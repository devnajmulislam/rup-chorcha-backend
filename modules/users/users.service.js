import { DASHBOARD_RECENT_APPOINTMENTS_LIMIT } from "../../config/constants.js";
import { getCollections } from "../../db/mongo.js";
import {
  SAFE_USER_PROJECTION,
  buildUserCandidateIds,
  buildUserIdFilter,
  toSafeUser,
} from "../../db/users.js";
import { ApiError } from "../../utils/ApiError.js";
import { escapeRegex } from "../../utils/validation.js";
import {
  SERVICE_SUMMARY_PROJECTION,
  toSafeAppointment,
} from "../appointments/appointments.service.js";

function toSafeAdminCustomer(doc, appointmentCount = 0) {
  const safe = toSafeUser(doc);
  if (!safe) {
    return null;
  }

  return {
    id: safe.id,
    name: safe.name.trim() || "Unnamed customer",
    email: safe.email,
    phone: safe.phone,
    image: safe.image,
    role: "customer",
    isBlocked: safe.isBlocked,
    emailVerified: safe.emailVerified,
    createdAt: safe.createdAt,
    updatedAt: safe.updatedAt,
    appointmentCount: Number(appointmentCount) || 0,
  };
}

function buildCustomerMatchFilter({ search, status }) {
  const match = {
    role: { $ne: "admin" },
  };

  if (status === "active") {
    match.isBlocked = { $ne: true };
  } else if (status === "blocked") {
    match.isBlocked = true;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    match.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  return match;
}

async function countCustomerAppointments(userDoc, rawId) {
  const { appointments } = getCollections();
  const candidateIds = buildUserCandidateIds(userDoc, rawId);
  if (candidateIds.length === 0) {
    return 0;
  }

  return appointments.countDocuments({
    customerId: { $in: candidateIds },
  });
}

async function listAdminCustomers({ search, status, page, limit }) {
  const { users } = getCollections();
  const match = buildCustomerMatchFilter({ search, status });
  const skip = (page - 1) * limit;

  const [rows, total, accessRows] = await Promise.all([
    users
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: SAFE_USER_PROJECTION },
        {
          $lookup: {
            from: "appointments",
            let: {
              uid: { $toString: "$_id" },
              uidStr: "$id",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      { $eq: [{ $toString: "$customerId" }, "$$uid"] },
                      {
                        $and: [
                          { $eq: [{ $type: "$$uidStr" }, "string"] },
                          { $ne: ["$$uidStr", ""] },
                          { $eq: [{ $toString: "$customerId" }, "$$uidStr"] },
                        ],
                      },
                    ],
                  },
                },
              },
              { $count: "count" },
            ],
            as: "appointmentMeta",
          },
        },
      ])
      .toArray(),
    users.countDocuments(match),
    users
      .aggregate([
        { $match: { role: { $ne: "admin" } } },
        {
          $group: {
            _id: { $cond: [{ $eq: ["$isBlocked", true] }, "blocked", "active"] },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const counts = {
    all: 0,
    active: 0,
    blocked: 0,
  };

  for (const row of accessRows) {
    const count = Number(row.count) || 0;
    counts.all += count;
    if (row._id === "active" || row._id === "blocked") {
      counts[row._id] = count;
    }
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items: rows.map((row) =>
      toSafeAdminCustomer(row, row.appointmentMeta?.[0]?.count ?? 0)
    ),
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1 && total > 0,
      filters: {
        search: search ?? null,
        status: status ?? null,
      },
      counts,
    },
  };
}

async function getAdminCustomerById(userId) {
  const { users, appointments } = getCollections();
  const doc = await users.findOne(buildUserIdFilter(userId), {
    projection: SAFE_USER_PROJECTION,
  });

  if (!doc || doc.role === "admin") {
    throw new ApiError("Customer not found.", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  const candidateIds = buildUserCandidateIds(doc, userId);

  const [statsRows, recentRows] = await Promise.all([
    appointments
      .aggregate([
        { $match: { customerId: { $in: candidateIds } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            confirmed: {
              $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
          },
        },
      ])
      .toArray(),
    appointments
      .aggregate([
        { $match: { customerId: { $in: candidateIds } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $limit: DASHBOARD_RECENT_APPOINTMENTS_LIMIT },
        {
          $lookup: {
            from: "services",
            localField: "serviceId",
            foreignField: "_id",
            pipeline: [{ $project: SERVICE_SUMMARY_PROJECTION }],
            as: "service",
          },
        },
        {
          $unwind: {
            path: "$service",
            preserveNullAndEmptyArrays: true,
          },
        },
      ])
      .toArray(),
  ]);

  const rawStats = statsRows[0] ?? {};
  const appointmentStats = {
    total: Number(rawStats.total) || 0,
    pending: Number(rawStats.pending) || 0,
    confirmed: Number(rawStats.confirmed) || 0,
    cancelled: Number(rawStats.cancelled) || 0,
  };

  return {
    ...toSafeAdminCustomer(doc, appointmentStats.total),
    appointmentStats,
    recentAppointments: recentRows.map(toSafeAppointment),
  };
}

async function setCustomerBlocked({ userId, actorId, isBlocked }) {
  const { users, sessions } = getCollections();
  const filter = buildUserIdFilter(userId);

  const existing = await users.findOne(filter, {
    projection: SAFE_USER_PROJECTION,
  });

  if (!existing) {
    throw new ApiError("Customer not found.", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  const existingSafe = toSafeUser(existing);
  if (
    existing.role === "admin" ||
    existingSafe.id === actorId ||
    existing._id.toString() === actorId
  ) {
    throw new ApiError(
      "Admin accounts cannot be blocked or modified through customer access controls.",
      403,
      { code: "CANNOT_BLOCK_ADMIN" }
    );
  }

  const updated = await users.findOneAndUpdate(
    { ...filter, role: { $ne: "admin" } },
    {
      $set: {
        isBlocked,
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      projection: SAFE_USER_PROJECTION,
    }
  );

  if (!updated) {
    throw new ApiError("Customer not found.", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  if (isBlocked) {
    const candidateIds = buildUserCandidateIds(updated, userId);
    if (candidateIds.length > 0) {
      await sessions.deleteMany({ userId: { $in: candidateIds } });
    }
  }

  const appointmentCount = await countCustomerAppointments(updated, userId);

  return toSafeAdminCustomer(updated, appointmentCount);
}

export {
  getAdminCustomerById,
  listAdminCustomers,
  setCustomerBlocked,
  toSafeAdminCustomer,
};
