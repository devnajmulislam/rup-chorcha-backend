import {
  ACTIVE_APPOINTMENT_STATUSES,
  DASHBOARD_RECENT_APPOINTMENTS_LIMIT,
  DASHBOARD_UPCOMING_APPOINTMENTS_LIMIT,
  SALON_TIMEZONE,
} from "../../config/constants.js";
import { getCollections } from "../../db/mongo.js";
import {
  getSalonTodayDateString,
  isSlotInPast,
  parseSalonDateToUtcStart,
} from "../../utils/salonTime.js";
import {
  ADMIN_SERVICE_LOOKUP_STAGES,
  SERVICE_SUMMARY_PROJECTION,
  toSafeAdminAppointment,
  toSafeAppointment,
} from "../appointments/appointments.service.js";

async function getCustomerDashboard(customerUser, { now = new Date() } = {}) {
  const { appointments } = getCollections();
  const customerId = customerUser.id;
  const todayUtcStart = parseSalonDateToUtcStart(getSalonTodayDateString(now));

  const [statsRows, upcomingRows, recentRows] = await Promise.all([
    appointments
      .aggregate([
        { $match: { customerId } },
        {
          $group: {
            _id: null,
            totalAppointments: { $sum: 1 },
            pendingAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            confirmedAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
            },
            cancelledAppointments: {
              $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
            },
            paidAppointments: {
              $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
            },
            unpaidAppointments: {
              $sum: { $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0] },
            },
            payableAppointments: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$status", "confirmed"] },
                      { $eq: ["$paymentStatus", "unpaid"] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray(),
    appointments
      .aggregate([
        {
          $match: {
            customerId,
            status: { $in: ACTIVE_APPOINTMENT_STATUSES },
            appointmentDate: { $gte: todayUtcStart },
          },
        },
        { $sort: { appointmentDate: 1, timeSlot: 1, createdAt: 1 } },
        { $limit: 20 },
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
    appointments
      .aggregate([
        { $match: { customerId } },
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
  const stats = {
    totalAppointments: Number(rawStats.totalAppointments) || 0,
    pendingAppointments: Number(rawStats.pendingAppointments) || 0,
    confirmedAppointments: Number(rawStats.confirmedAppointments) || 0,
    cancelledAppointments: Number(rawStats.cancelledAppointments) || 0,
    paidAppointments: Number(rawStats.paidAppointments) || 0,
    unpaidAppointments: Number(rawStats.unpaidAppointments) || 0,
    payableAppointments: Number(rawStats.payableAppointments) || 0,
  };

  const upcomingAppointments = upcomingRows
    .map(toSafeAppointment)
    .filter(
      (item) =>
        Boolean(item.appointmentDateLocal) &&
        !isSlotInPast(item.appointmentDateLocal, item.timeSlot, now)
    )
    .slice(0, DASHBOARD_UPCOMING_APPOINTMENTS_LIMIT);

  const recentAppointments = recentRows.map(toSafeAppointment);

  return {
    profile: customerUser,
    stats,
    upcomingAppointments,
    recentAppointments,
    timezone: SALON_TIMEZONE,
  };
}

async function getAdminDashboard() {
  const { users, services, appointments, transactions } = getCollections();

  const [customerRows, serviceRows, appointmentRows, transactionRows, recentRows] =
    await Promise.all([
      users
        .aggregate([
          { $match: { role: { $ne: "admin" } } },
          {
            $group: {
              _id: null,
              totalCustomers: { $sum: 1 },
              activeCustomers: {
                $sum: { $cond: [{ $ne: ["$isBlocked", true] }, 1, 0] },
              },
              blockedCustomers: {
                $sum: { $cond: [{ $eq: ["$isBlocked", true] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      services
        .aggregate([
          {
            $group: {
              _id: null,
              totalServices: { $sum: 1 },
              activeServices: {
                $sum: { $cond: [{ $ne: ["$status", "inactive"] }, 1, 0] },
              },
              inactiveServices: {
                $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      appointments
        .aggregate([
          {
            $group: {
              _id: null,
              totalAppointments: { $sum: 1 },
              pendingAppointments: {
                $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
              },
              confirmedAppointments: {
                $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
              },
              cancelledAppointments: {
                $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
              },
              paidAppointments: {
                $sum: { $cond: [{ $eq: ["$paymentStatus", "paid"] }, 1, 0] },
              },
              unpaidAppointments: {
                $sum: { $cond: [{ $eq: ["$paymentStatus", "unpaid"] }, 1, 0] },
              },
            },
          },
        ])
        .toArray(),
      transactions
        .aggregate([
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              successfulPayments: {
                $sum: { $cond: [{ $eq: ["$status", "paid"] }, 1, 0] },
              },
              failedPayments: {
                $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
              },
              totalRevenueCents: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$status", "paid"] },
                        { $isNumber: "$amount" },
                        { $gt: ["$amount", 0] },
                      ],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),
      appointments
        .aggregate([
          { $sort: { createdAt: -1, _id: -1 } },
          { $limit: DASHBOARD_RECENT_APPOINTMENTS_LIMIT },
          ...ADMIN_SERVICE_LOOKUP_STAGES,
        ])
        .toArray(),
    ]);

  const customerStats = customerRows[0] ?? {};
  const serviceStats = serviceRows[0] ?? {};
  const appointmentStats = appointmentRows[0] ?? {};
  const txStats = transactionRows[0] ?? {};

  const totalTransactions = Number(txStats.totalTransactions) || 0;

  return {
    overview: {
      totalCustomers: Number(customerStats.totalCustomers) || 0,
      activeCustomers: Number(customerStats.activeCustomers) || 0,
      blockedCustomers: Number(customerStats.blockedCustomers) || 0,
      totalServices: Number(serviceStats.totalServices) || 0,
      activeServices: Number(serviceStats.activeServices) || 0,
      inactiveServices: Number(serviceStats.inactiveServices) || 0,
      totalAppointments: Number(appointmentStats.totalAppointments) || 0,
      pendingAppointments: Number(appointmentStats.pendingAppointments) || 0,
      confirmedAppointments:
        Number(appointmentStats.confirmedAppointments) || 0,
      cancelledAppointments:
        Number(appointmentStats.cancelledAppointments) || 0,
      paidAppointments: Number(appointmentStats.paidAppointments) || 0,
      unpaidAppointments: Number(appointmentStats.unpaidAppointments) || 0,
      successfulPayments: Number(txStats.successfulPayments) || 0,
      failedPayments: Number(txStats.failedPayments) || 0,
      totalTransactions,
      totalRevenueCents: Number(txStats.totalRevenueCents) || 0,
      currency: "USD",
      hasRecordedTransactions: totalTransactions > 0,
    },
    recentAppointments: recentRows.map(toSafeAdminAppointment),
    timezone: SALON_TIMEZONE,
  };
}

export { getAdminDashboard, getCustomerDashboard };
