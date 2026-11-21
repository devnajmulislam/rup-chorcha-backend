import { ObjectId } from "mongodb";

import {
  ACTIVE_APPOINTMENT_STATUSES,
  MAX_BOOKING_ADVANCE_DAYS,
  SALON_TIMEZONE,
  TIME_SLOTS,
} from "../../config/constants.js";
import { getCollections } from "../../db/mongo.js";
import { ApiError } from "../../utils/ApiError.js";
import {
  daysBetweenDateStrings,
  formatUtcDateToSalonDateString,
  getSalonTodayDateString,
  isSlotInPast,
  parseSalonDateToUtcStart,
} from "../../utils/salonTime.js";

const SERVICE_SUMMARY_PROJECTION = Object.freeze({
  _id: 1,
  serviceName: 1,
  category: 1,
  price: 1,
  duration: 1,
  image: 1,
  status: 1,
});

function toIsoTimestamp(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toSafeAppointment(doc) {
  if (!doc) {
    return null;
  }

  const service =
    doc.service && typeof doc.service === "object" ? doc.service : null;
  const serviceId = doc.serviceId
    ? doc.serviceId.toString()
    : (service?._id?.toString() ?? "");

  return {
    id: doc._id.toString(),
    serviceId,
    serviceName:
      typeof service?.serviceName === "string" && service.serviceName.trim()
        ? service.serviceName.trim()
        : "Service no longer offered",
    serviceCategory:
      typeof service?.category === "string" && service.category.trim()
        ? service.category.trim()
        : "Uncategorised",
    serviceImage:
      typeof service?.image === "string" && service.image.trim()
        ? service.image.trim()
        : null,
    serviceDuration: Number.isFinite(Number(service?.duration))
      ? Number(service.duration)
      : null,
    customerId: String(doc.customerId || ""),
    appointmentDate: toIsoTimestamp(doc.appointmentDate),
    appointmentDateLocal: formatUtcDateToSalonDateString(doc.appointmentDate),
    timeSlot: String(doc.timeSlot || ""),
    message:
      typeof doc.message === "string" && doc.message.trim()
        ? doc.message.trim()
        : null,
    servicePrice: Number(doc.servicePrice),
    status:
      doc.status === "confirmed" || doc.status === "cancelled"
        ? doc.status
        : "pending",
    paymentStatus: doc.paymentStatus === "paid" ? "paid" : "unpaid",
    createdAt: toIsoTimestamp(doc.createdAt),
    updatedAt: toIsoTimestamp(doc.updatedAt),
  };
}

async function getServiceAvailabilityForCustomer({
  serviceId,
  customerId,
  dateStr,
  now = new Date(),
}) {
  const { services, appointments } = getCollections();
  const serviceObjectId = new ObjectId(serviceId);

  const activeService = await services.findOne(
    { _id: serviceObjectId, status: "active" },
    { projection: { _id: 1 } }
  );

  if (!activeService) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  const normalizedDate = parseSalonDateToUtcStart(dateStr);

  const activeBookings = await appointments
    .find(
      {
        customerId,
        appointmentDate: normalizedDate,
        status: { $in: ACTIVE_APPOINTMENT_STATUSES },
      },
      { projection: { timeSlot: 1 } }
    )
    .toArray();

  const bookedSet = new Set(
    activeBookings
      .map((item) => item.timeSlot)
      .filter((slot) => TIME_SLOTS.includes(slot))
  );

  const pastSlots = TIME_SLOTS.filter((slot) =>
    isSlotInPast(dateStr, slot, now)
  );
  const pastSet = new Set(pastSlots);

  const bookedSlots = TIME_SLOTS.filter((slot) => bookedSet.has(slot));
  const availableSlots = TIME_SLOTS.filter(
    (slot) => !bookedSet.has(slot) && !pastSet.has(slot)
  );

  return {
    serviceId,
    date: dateStr,
    timezone: SALON_TIMEZONE,
    slots: [...TIME_SLOTS],
    bookedSlots,
    pastSlots,
    availableSlots,
  };
}

async function createCustomerAppointment({
  customerId,
  serviceId,
  appointmentDate: dateStr,
  timeSlot,
  message,
  now = new Date(),
}) {
  const todayStr = getSalonTodayDateString(now);
  const dayDelta = daysBetweenDateStrings(todayStr, dateStr);

  if (dayDelta < 0 || isSlotInPast(dateStr, timeSlot, now)) {
    throw new ApiError(
      "Select a future appointment date and time slot.",
      400,
      {
        code: "PAST_APPOINTMENT_SLOT",
        errors: {
          timeSlot: "This appointment date or time slot has already passed.",
        },
      }
    );
  }

  if (dayDelta > MAX_BOOKING_ADVANCE_DAYS) {
    throw new ApiError(
      `Appointments can be requested up to ${MAX_BOOKING_ADVANCE_DAYS} days in advance.`,
      400,
      {
        code: "DATE_TOO_FAR",
        errors: {
          appointmentDate: `Choose a date within ${MAX_BOOKING_ADVANCE_DAYS} days.`,
        },
      }
    );
  }

  const { services, appointments } = getCollections();
  const serviceObjectId = new ObjectId(serviceId);

  const service = await services.findOne(
    { _id: serviceObjectId, status: "active" },
    { projection: SERVICE_SUMMARY_PROJECTION }
  );

  if (!service) {
    throw new ApiError("Service not found.", 404, {
      code: "SERVICE_NOT_FOUND",
    });
  }

  const priceCents = Number(service.price);
  if (!Number.isInteger(priceCents) || priceCents <= 0) {
    throw new ApiError(
      "This service cannot be booked right now due to invalid pricing.",
      409,
      { code: "INVALID_SERVICE_PRICE" }
    );
  }

  const normalizedDate = parseSalonDateToUtcStart(dateStr);

  const existingDuplicate = await appointments.findOne(
    {
      customerId,
      appointmentDate: normalizedDate,
      timeSlot,
      status: { $in: ACTIVE_APPOINTMENT_STATUSES },
    },
    { projection: { _id: 1 } }
  );

  if (existingDuplicate) {
    throw new ApiError(
      "You already have an active appointment for this date and time slot.",
      409,
      {
        code: "DUPLICATE_APPOINTMENT_SLOT",
        errors: {
          timeSlot:
            "You already have an active appointment for this date and time slot.",
        },
      }
    );
  }

  const doc = {
    serviceId: serviceObjectId,
    customerId,
    appointmentDate: normalizedDate,
    timeSlot,
    message: message || null,
    servicePrice: priceCents,
    paymentStatus: "unpaid",
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  let result;
  try {
    result = await appointments.insertOne(doc);
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        "You already have an active appointment for this date and time slot.",
        409,
        {
          code: "DUPLICATE_APPOINTMENT_SLOT",
          errors: {
            timeSlot:
              "You already have an active appointment for this date and time slot.",
          },
        }
      );
    }

    throw error;
  }

  return toSafeAppointment({
    _id: result.insertedId,
    ...doc,
    service,
  });
}

async function listCustomerAppointments({
  customerId,
  status,
  page,
  limit,
}) {
  const { appointments } = getCollections();
  const match = {
    customerId,
    ...(status ? { status } : {}),
  };

  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    appointments
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "services",
            localField: "serviceId",
            foreignField: "_id",
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
    appointments.countDocuments(match),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    items: rows.map(toSafeAppointment),
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1 && total > 0,
      filters: {
        status: status ?? null,
      },
    },
  };
}

async function getCustomerAppointmentById({ customerId, appointmentId }) {
  const { appointments, services } = getCollections();
  const objectId = new ObjectId(appointmentId);

  const doc = await appointments.findOne({ _id: objectId });

  if (!doc) {
    throw new ApiError("Appointment not found.", 404, {
      code: "APPOINTMENT_NOT_FOUND",
    });
  }

  if (doc.customerId !== customerId) {
    throw new ApiError(
      "You do not have permission to view this appointment.",
      403,
      { code: "FORBIDDEN" }
    );
  }

  const service = doc.serviceId
    ? await services.findOne(
        { _id: doc.serviceId },
        { projection: SERVICE_SUMMARY_PROJECTION }
      )
    : null;

  return toSafeAppointment({
    ...doc,
    service,
  });
}

async function cancelCustomerPendingAppointment({ customerId, appointmentId }) {
  const { appointments, services } = getCollections();
  const objectId = new ObjectId(appointmentId);

  const existing = await appointments.findOne({ _id: objectId });

  if (!existing) {
    throw new ApiError("Appointment not found.", 404, {
      code: "APPOINTMENT_NOT_FOUND",
    });
  }

  if (existing.customerId !== customerId) {
    throw new ApiError(
      "You do not have permission to cancel this appointment.",
      403,
      { code: "FORBIDDEN" }
    );
  }

  const updated = await appointments.findOneAndUpdate(
    {
      _id: objectId,
      customerId,
      status: "pending",
    },
    {
      $set: {
        status: "cancelled",
        updatedAt: new Date(),
      },
    },
    { returnDocument: "after" }
  );

  if (!updated) {
    throw new ApiError(
      "Only pending appointment requests can be cancelled.",
      409,
      { code: "INVALID_STATUS_TRANSITION" }
    );
  }

  const service = updated.serviceId
    ? await services.findOne(
        { _id: updated.serviceId },
        { projection: SERVICE_SUMMARY_PROJECTION }
      )
    : null;

  return toSafeAppointment({
    ...updated,
    service,
  });
}

export {
  cancelCustomerPendingAppointment,
  createCustomerAppointment,
  getCustomerAppointmentById,
  getServiceAvailabilityForCustomer,
  listCustomerAppointments,
  toSafeAppointment,
};
