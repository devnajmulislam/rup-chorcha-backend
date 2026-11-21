import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ObjectId } from "mongodb";

import { createApp } from "../app.js";
import { SALON_TIMEZONE } from "../config/constants.js";
import { validateEnv } from "../config/env.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDB, connectDB, getClient, getCollections } from "../db/mongo.js";
import { initAuth } from "../lib/auth.js";
import { uploadImageToImgBB } from "../lib/imgbb.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  getSalonTodayDateString,
  parseSalonDateToUtcStart,
} from "../utils/salonTime.js";

const EXISTING_PRESERVED_SERVICE_ID = "6b008bfdeda8c9a56f80bc57";
const TINY_PNG_BUFFER = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360180500000800010000000049454e44ae426082",
  "hex"
);

const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

let server = null;
let baseUrl = "";
let mockUploadBehavior = "success";

let customerAToken = "";
let customerBToken = "";
let objectIdCustomerToken = "";
let blockedCustomerToken = "";
let adminToken = "";

let customerAId = "";
let customerBId = "";
let objectIdCustomerId = "";
let objectIdCustomerObjectId = null;
let blockedCustomerId = "";
let adminId = "";

let activeService1Id = "";
let activeService2Id = "";
let inactiveServiceId = "";
let existingServiceBefore = null;

const createdUserObjectIds = [];
const createdSessionIds = [];
const createdServiceIds = [];
const createdAppointmentIds = [];
const createdTransactionIds = [];

function addDaysToDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

async function apiRequest(
  path,
  { method = "GET", token, jsonBody, formData } = {}
) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(jsonBody);
  } else if (formData !== undefined) {
    body = formData;
  }

  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

async function seedTestUser({
  name,
  email,
  phone = null,
  role = "customer",
  isBlocked = false,
  withCustomIdField = true,
  createdAt = new Date(),
}) {
  const { users } = getCollections();
  const objectId = new ObjectId();
  const stringId = withCustomIdField
    ? `stage4_${role}_${runSuffix}_${Math.random().toString(36).slice(2, 8)}`
    : objectId.toString();

  const doc = {
    _id: objectId,
    ...(withCustomIdField ? { id: stringId } : {}),
    name,
    email: email.toLowerCase(),
    image: null,
    phone,
    role,
    isBlocked,
    emailVerified: true,
    createdAt,
    updatedAt: createdAt,
  };

  await users.insertOne(doc);
  createdUserObjectIds.push(objectId);

  const tokenUser = {
    id: stringId,
    email: doc.email,
    role: doc.role,
  };
  const { token } = await signAccessToken(tokenUser);

  return { id: stringId, objectId, email: doc.email, token };
}

before(async () => {
  validateEnv();
  const db = await connectDB();
  await ensureIndexes(db);
  const auth = initAuth({ db, client: getClient() });

  const { services } = getCollections();
  if (ObjectId.isValid(EXISTING_PRESERVED_SERVICE_ID)) {
    existingServiceBefore = await services.findOne({
      _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
    });
  }

  const [cA, cB, objCust, blocked, adm] = await Promise.all([
    seedTestUser({
      name: `Stage4 Ayesha ${runSuffix}`,
      email: `stage4.ayesha.${runSuffix}@example.com`,
      phone: "+880 1711 000001",
      role: "customer",
    }),
    seedTestUser({
      name: `Stage4 Farhana ${runSuffix}`,
      email: `stage4.farhana.${runSuffix}@example.com`,
      phone: "+880 1711 000002",
      role: "customer",
    }),
    seedTestUser({
      name: `Stage4 ObjectId Cust ${runSuffix}`,
      email: `stage4.objcust.${runSuffix}@example.com`,
      role: "customer",
      withCustomIdField: false,
    }),
    seedTestUser({
      name: `Stage4 Blocked ${runSuffix}`,
      email: `stage4.blocked.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: true,
    }),
    seedTestUser({
      name: `Stage4 Admin ${runSuffix}`,
      email: `stage4.admin.${runSuffix}@example.com`,
      phone: "+880 1711 000099",
      role: "admin",
    }),
  ]);

  customerAToken = cA.token;
  customerAId = cA.id;
  customerBToken = cB.token;
  customerBId = cB.id;
  objectIdCustomerToken = objCust.token;
  objectIdCustomerId = objCust.id;
  objectIdCustomerObjectId = objCust.objectId;
  blockedCustomerToken = blocked.token;
  blockedCustomerId = blocked.id;
  adminToken = adm.token;
  adminId = adm.id;

  const now = new Date();
  const s1Id = new ObjectId();
  const s2Id = new ObjectId();
  const sInactiveId = new ObjectId();

  await services.insertMany([
    {
      _id: s1Id,
      serviceName: `Stage4 Glow Facial ${runSuffix}`,
      category: "Facial & Skincare",
      description: "Botanical glow treatment for Step 4A testing.",
      price: 9500,
      duration: 60,
      image: "https://i.ibb.co/precheck/stage4-facial.png",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: s2Id,
      serviceName: `Stage4 Silk Hair Spa ${runSuffix}`,
      category: "Hair Treatment",
      description: "Restorative silk mask for Step 4A testing.",
      price: 12000,
      duration: 75,
      image: "https://i.ibb.co/precheck/stage4-hair.png",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: sInactiveId,
      serviceName: `Stage4 Archived Spa ${runSuffix}`,
      category: "Spa & Massage",
      description: "Inactive service for Step 4A aggregation checks.",
      price: 6000,
      duration: 45,
      image: "https://i.ibb.co/precheck/stage4-inactive.png",
      status: "inactive",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  createdServiceIds.push(s1Id, s2Id, sInactiveId);
  activeService1Id = s1Id.toString();
  activeService2Id = s2Id.toString();
  inactiveServiceId = sInactiveId.toString();

  const mockUpload = async (file, options) => {
    return uploadImageToImgBB(file, {
      ...options,
      apiKey: "stage4-unit-test-key",
      fetchImpl: async () => {
        if (mockUploadBehavior === "fail") {
          return new Response(JSON.stringify({ success: false }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              url: `https://i.ibb.co/stage4-avatar-${runSuffix}.png`,
              display_url: `https://i.ibb.co/stage4-avatar-${runSuffix}.png`,
              thumb: { url: `https://i.ibb.co/stage4-avatar-thumb-${runSuffix}.png` },
              width: 1,
              height: 1,
              size: file.buffer.length,
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      },
    });
  };

  const app = createApp({ auth, uploadImage: mockUpload });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  const { users, sessions, services, appointments, transactions } =
    getCollections();

  if (createdTransactionIds.length > 0) {
    await transactions.deleteMany({ _id: { $in: createdTransactionIds } });
  }
  if (createdAppointmentIds.length > 0) {
    await appointments.deleteMany({ _id: { $in: createdAppointmentIds } });
  }
  if (createdServiceIds.length > 0) {
    await services.deleteMany({ _id: { $in: createdServiceIds } });
  }
  if (createdSessionIds.length > 0) {
    await sessions.deleteMany({ _id: { $in: createdSessionIds } });
  }
  if (createdUserObjectIds.length > 0) {
    await users.deleteMany({ _id: { $in: createdUserObjectIds } });
  }

  if (existingServiceBefore) {
    const existingAfter = await services.findOne({
      _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
    });
    assert.deepEqual(existingAfter, existingServiceBefore);
  }

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closeDB();
});

describe("Step 4A — Express Dashboard, Admin & Profile APIs", () => {
  test("enforces auth, RBAC, and blocked-user restrictions on all Step 4A routes", async () => {
    const protectedEndpoints = [
      ["GET", "/api/dashboard/customer"],
      ["GET", "/api/dashboard/admin"],
      ["GET", "/api/admin/appointments"],
      ["GET", `/api/admin/appointments/${new ObjectId().toString()}`],
      ["PATCH", `/api/admin/appointments/${new ObjectId().toString()}/confirm`],
      ["PATCH", `/api/admin/appointments/${new ObjectId().toString()}/cancel`],
      ["PATCH", `/api/admin/appointments/${new ObjectId().toString()}/status`],
      ["GET", "/api/admin/users"],
      ["GET", `/api/admin/users/${customerAId}`],
      ["PATCH", `/api/admin/users/${customerAId}/block`],
      ["PATCH", `/api/admin/users/${customerAId}/unblock`],
      ["GET", "/api/profile"],
      ["PATCH", "/api/profile"],
      ["POST", "/api/uploads/profile-image"],
    ];

    for (const [method, endpoint] of protectedEndpoints) {
      const res = await apiRequest(endpoint, { method });
      assert.equal(res.status, 401, `${method} ${endpoint} should require auth`);
    }

    // Customer cannot access admin dashboard or admin management endpoints
    for (const [method, endpoint] of [
      ["GET", "/api/dashboard/admin"],
      ["GET", "/api/admin/appointments"],
      ["PATCH", `/api/admin/appointments/${new ObjectId().toString()}/confirm`],
      ["GET", "/api/admin/users"],
      ["PATCH", `/api/admin/users/${customerBId}/block`],
    ]) {
      const res = await apiRequest(endpoint, { method, token: customerAToken });
      assert.equal(
        res.status,
        403,
        `${method} ${endpoint} must reject customers`
      );
      assert.equal(res.json?.code, "FORBIDDEN");
    }

    // Admin cannot call customer-only dashboard
    const admOnCustomerDash = await apiRequest("/api/dashboard/customer", {
      token: adminToken,
    });
    assert.equal(admOnCustomerDash.status, 403);
    assert.equal(admOnCustomerDash.json?.code, "FORBIDDEN");

    // Blocked customer is denied across customer dashboard, profile, and upload
    for (const [method, endpoint] of [
      ["GET", "/api/dashboard/customer"],
      ["GET", "/api/profile"],
      ["PATCH", "/api/profile"],
      ["POST", "/api/uploads/profile-image"],
    ]) {
      const res = await apiRequest(endpoint, {
        method,
        token: blockedCustomerToken,
        jsonBody: method === "PATCH" ? { name: "Blocked Update" } : undefined,
      });
      assert.equal(res.status, 403);
      assert.equal(res.json?.code, "USER_BLOCKED");
    }
  });

  test("returns accurate empty and populated GET /api/dashboard/customer scoped strictly to authenticated user", async () => {
    const emptyRes = await apiRequest(
      `/api/dashboard/customer?customerId=${customerBId}`,
      { token: customerAToken }
    );
    assert.equal(emptyRes.status, 200);
    assert.equal(emptyRes.json.data.timezone, SALON_TIMEZONE);
    assert.equal(emptyRes.json.data.profile.id, customerAId);
    assert.deepEqual(emptyRes.json.data.stats, {
      totalAppointments: 0,
      pendingAppointments: 0,
      confirmedAppointments: 0,
      cancelledAppointments: 0,
      paidAppointments: 0,
      unpaidAppointments: 0,
      payableAppointments: 0,
    });
    assert.deepEqual(emptyRes.json.data.upcomingAppointments, []);
    assert.deepEqual(emptyRes.json.data.recentAppointments, []);

    const { appointments } = getCollections();
    const todayStr = getSalonTodayDateString();
    const pastDateStr = addDaysToDateStr(todayStr, -2);
    const futureDate1Str = addDaysToDateStr(todayStr, 3);
    const futureDate2Str = addDaysToDateStr(todayStr, 6);

    const aPastConfirmed = new ObjectId();
    const aFutureConfirmedUnpaid = new ObjectId();
    const aFuturePending = new ObjectId();
    const aFutureCancelled = new ObjectId();
    const bFutureConfirmed = new ObjectId();

    const t0 = Date.now();
    await appointments.insertMany([
      {
        _id: aPastConfirmed,
        serviceId: new ObjectId(activeService1Id),
        customerId: customerAId,
        appointmentDate: parseSalonDateToUtcStart(pastDateStr),
        timeSlot: "10:00",
        message: "Past confirmed paid visit",
        servicePrice: 9500,
        paymentStatus: "paid",
        status: "confirmed",
        createdAt: new Date(t0 - 4000),
        updatedAt: new Date(t0 - 4000),
      },
      {
        _id: aFutureConfirmedUnpaid,
        serviceId: new ObjectId(activeService2Id),
        customerId: customerAId,
        appointmentDate: parseSalonDateToUtcStart(futureDate2Str),
        timeSlot: "14:00",
        message: null,
        servicePrice: 12000,
        paymentStatus: "unpaid",
        status: "confirmed",
        createdAt: new Date(t0 - 3000),
        updatedAt: new Date(t0 - 3000),
      },
      {
        _id: aFuturePending,
        serviceId: new ObjectId(activeService1Id),
        customerId: customerAId,
        appointmentDate: parseSalonDateToUtcStart(futureDate1Str),
        timeSlot: "11:00",
        message: "Sensitive skin check",
        servicePrice: 9500,
        paymentStatus: "unpaid",
        status: "pending",
        createdAt: new Date(t0 - 1000),
        updatedAt: new Date(t0 - 1000),
      },
      {
        _id: aFutureCancelled,
        serviceId: new ObjectId(activeService1Id),
        customerId: customerAId,
        appointmentDate: parseSalonDateToUtcStart(futureDate1Str),
        timeSlot: "16:00",
        message: null,
        servicePrice: 9500,
        paymentStatus: "unpaid",
        status: "cancelled",
        createdAt: new Date(t0 - 2000),
        updatedAt: new Date(t0 - 2000),
      },
      {
        _id: bFutureConfirmed,
        serviceId: new ObjectId(activeService2Id),
        customerId: customerBId,
        appointmentDate: parseSalonDateToUtcStart(futureDate1Str),
        timeSlot: "11:00",
        message: "Other customer booking",
        servicePrice: 12000,
        paymentStatus: "paid",
        status: "confirmed",
        createdAt: new Date(t0),
        updatedAt: new Date(t0),
      },
    ]);
    createdAppointmentIds.push(
      aPastConfirmed,
      aFutureConfirmedUnpaid,
      aFuturePending,
      aFutureCancelled,
      bFutureConfirmed
    );

    const dashRes = await apiRequest(
      `/api/dashboard/customer?customerId=${customerBId}`,
      { token: customerAToken }
    );
    assert.equal(dashRes.status, 200);
    assert.deepEqual(dashRes.json.data.stats, {
      totalAppointments: 4,
      pendingAppointments: 1,
      confirmedAppointments: 2,
      cancelledAppointments: 1,
      paidAppointments: 1,
      unpaidAppointments: 3,
      payableAppointments: 1,
    });

    const upcomingIds = dashRes.json.data.upcomingAppointments.map((i) => i.id);
    assert.deepEqual(upcomingIds, [
      aFuturePending.toString(),
      aFutureConfirmedUnpaid.toString(),
    ]);

    const recentIds = dashRes.json.data.recentAppointments.map((i) => i.id);
    assert.deepEqual(recentIds, [
      aFuturePending.toString(),
      aFutureCancelled.toString(),
      aFutureConfirmedUnpaid.toString(),
      aPastConfirmed.toString(),
    ]);
    assert.equal(
      dashRes.json.data.recentAppointments.some(
        (i) => i.customerId === customerBId
      ),
      false
    );
  });

  test("returns real GET /api/dashboard/admin stats and distinguishes unavailable vs recorded transactions", async () => {
    const { transactions } = getCollections();
    const existingTxCount = await transactions.countDocuments({});

    const dashBeforeTx = await apiRequest("/api/dashboard/admin", {
      token: adminToken,
    });
    assert.equal(dashBeforeTx.status, 200);
    const ov1 = dashBeforeTx.json.data.overview;
    assert.equal(dashBeforeTx.json.data.timezone, SALON_TIMEZONE);
    assert.ok(ov1.totalCustomers >= 4);
    assert.ok(ov1.activeCustomers >= 3);
    assert.ok(ov1.blockedCustomers >= 1);
    assert.ok(ov1.totalServices >= 3);
    assert.ok(ov1.activeServices >= 2);
    assert.ok(ov1.inactiveServices >= 1);
    assert.ok(ov1.totalAppointments >= 5);
    assert.equal(ov1.hasRecordedTransactions, existingTxCount > 0);
    assert.equal(ov1.currency, "USD");

    const paidTxId = new ObjectId();
    const failedTxId = new ObjectId();
    const linkedApptId = createdAppointmentIds[0];

    await transactions.insertMany([
      {
        _id: paidTxId,
        appointmentId: linkedApptId,
        customerId: customerAId,
        amount: 9500,
        currency: "usd",
        stripeSessionId: `cs_test_stage4_paid_${runSuffix}`,
        status: "paid",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: failedTxId,
        appointmentId: createdAppointmentIds[4],
        customerId: customerBId,
        amount: 12000,
        currency: "usd",
        stripeSessionId: `cs_test_stage4_failed_${runSuffix}`,
        status: "failed",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    createdTransactionIds.push(paidTxId, failedTxId);

    const dashAfterTx = await apiRequest("/api/dashboard/admin", {
      token: adminToken,
    });
    assert.equal(dashAfterTx.status, 200);
    const ov2 = dashAfterTx.json.data.overview;
    assert.equal(ov2.hasRecordedTransactions, true);
    assert.equal(ov2.totalTransactions, ov1.totalTransactions + 2);
    assert.equal(ov2.successfulPayments, ov1.successfulPayments + 1);
    assert.equal(ov2.failedPayments, ov1.failedPayments + 1);
    assert.equal(ov2.totalRevenueCents, ov1.totalRevenueCents + 9500);

    // Recent appointments do not leak user credentials/secrets
    assert.ok(dashAfterTx.json.data.recentAppointments.length >= 1);
    const firstRecent = dashAfterTx.json.data.recentAppointments[0];
    assert.equal(firstRecent.password, undefined);
    assert.equal(firstRecent._id, undefined);
    assert.ok(firstRecent.customerName);
    assert.ok(firstRecent.serviceName);
  });

  test("manages /api/admin/appointments listing, filtering, detail, valid/invalid status transitions, and field immutability", async () => {
    const todayStr = getSalonTodayDateString();
    const filterDate = addDaysToDateStr(todayStr, 3);

    const listAll = await apiRequest(
      `/api/admin/appointments?search=${encodeURIComponent(runSuffix)}&limit=10`,
      { token: adminToken }
    );
    assert.equal(listAll.status, 200);
    assert.equal(listAll.json.data.length, 5);
    assert.ok(listAll.json.meta.counts.all >= 5);

    const filtered = await apiRequest(
      `/api/admin/appointments?status=pending&paymentStatus=unpaid&date=${filterDate}&search=${encodeURIComponent("Ayesha")}`,
      { token: adminToken }
    );
    assert.equal(filtered.status, 200);
    assert.equal(filtered.json.data.length, 1);
    const pendingId = filtered.json.data[0].id;

    // Invalid ID & missing ID checks
    const badId = await apiRequest("/api/admin/appointments/not-an-id", {
      token: adminToken,
    });
    assert.equal(badId.status, 400);
    assert.equal(badId.json?.code, "INVALID_APPOINTMENT_ID");

    const missing = await apiRequest(
      `/api/admin/appointments/${new ObjectId().toString()}`,
      { token: adminToken }
    );
    assert.equal(missing.status, 404);

    const detail = await apiRequest(`/api/admin/appointments/${pendingId}`, {
      token: adminToken,
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.data.customerEmail, `stage4.ayesha.${runSuffix}@example.com`);
    assert.equal(detail.json.data.servicePrice, 9500);
    assert.equal(detail.json.data.message, "Sensitive skin check");

    // Reject client tampering on confirm body
    const tamperedConfirm = await apiRequest(
      `/api/admin/appointments/${pendingId}/confirm`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { servicePrice: 1, customerId: customerBId },
      }
    );
    assert.equal(tamperedConfirm.status, 400);
    assert.equal(tamperedConfirm.json?.code, "VALIDATION_ERROR");

    // Confirm pending -> confirmed
    const confirmedRes = await apiRequest(
      `/api/admin/appointments/${pendingId}/confirm`,
      { method: "PATCH", token: adminToken }
    );
    assert.equal(confirmedRes.status, 200);
    assert.equal(confirmedRes.json.data.status, "confirmed");
    assert.equal(confirmedRes.json.data.servicePrice, 9500);
    assert.equal(confirmedRes.json.data.paymentStatus, "unpaid");

    // Cannot re-confirm already confirmed
    const reconfirm = await apiRequest(
      `/api/admin/appointments/${pendingId}/confirm`,
      { method: "PATCH", token: adminToken }
    );
    assert.equal(reconfirm.status, 409);
    assert.equal(reconfirm.json?.code, "INVALID_STATUS_TRANSITION");

    // Cannot reset confirmed back to pending or modify protected fields via /status
    const revertPending = await apiRequest(
      `/api/admin/appointments/${pendingId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { status: "pending" },
      }
    );
    assert.equal(revertPending.status, 400);

    const statusTamper = await apiRequest(
      `/api/admin/appointments/${pendingId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { status: "cancelled", paymentStatus: "paid" },
      }
    );
    assert.equal(statusTamper.status, 400);

    // Admin can cancel confirmed (even paid) appointment while preserving paymentStatus history
    const paidApptId = createdAppointmentIds[0].toString();
    const cancelPaid = await apiRequest(
      `/api/admin/appointments/${paidApptId}/cancel`,
      { method: "PATCH", token: adminToken }
    );
    assert.equal(cancelPaid.status, 200);
    assert.equal(cancelPaid.json.data.status, "cancelled");
    assert.equal(cancelPaid.json.data.paymentStatus, "paid");

    // Cannot re-cancel already cancelled
    const recancel = await apiRequest(
      `/api/admin/appointments/${paidApptId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { status: "cancelled" },
      }
    );
    assert.equal(recancel.status, 409);
    assert.equal(recancel.json?.code, "INVALID_STATUS_TRANSITION");
  });

  test("manages /api/admin/users listing, search, details, session-revoking block/unblock, and admin protection", async () => {
    const listCustomers = await apiRequest(
      `/api/admin/users?search=${encodeURIComponent(runSuffix)}&limit=10`,
      { token: adminToken }
    );
    assert.equal(listCustomers.status, 200);
    const listedEmails = listCustomers.json.data.map((u) => u.email);
    assert.ok(listedEmails.includes(`stage4.ayesha.${runSuffix}@example.com`));
    assert.ok(listedEmails.includes(`stage4.objcust.${runSuffix}@example.com`));
    assert.equal(
      listedEmails.includes(`stage4.admin.${runSuffix}@example.com`),
      false
    );

    for (const item of listCustomers.json.data) {
      assert.equal(item.role, "customer");
      assert.equal(item._id, undefined);
      assert.equal(item.password, undefined);
      assert.equal(item.token, undefined);
    }

    // Admin filter by blocked status & email search
    const blockedOnly = await apiRequest(
      `/api/admin/users?status=blocked&search=${encodeURIComponent(runSuffix)}`,
      { token: adminToken }
    );
    assert.equal(blockedOnly.status, 200);
    assert.equal(blockedOnly.json.data.length, 1);
    assert.equal(blockedOnly.json.data[0].id, blockedCustomerId);

    // Admin detail by ObjectId-only Better Auth user & admin-hiding 404
    const objDetail = await apiRequest(`/api/admin/users/${objectIdCustomerId}`, {
      token: adminToken,
    });
    assert.equal(objDetail.status, 200);
    assert.equal(objDetail.json.data.id, objectIdCustomerId);
    assert.equal(objDetail.json.data.password, undefined);
    assert.deepEqual(objDetail.json.data.appointmentStats, {
      total: 0,
      pending: 0,
      confirmed: 0,
      cancelled: 0,
    });

    const hiddenAdmin = await apiRequest(`/api/admin/users/${adminId}`, {
      token: adminToken,
    });
    assert.equal(hiddenAdmin.status, 404);

    // Seed Better Auth sessions for objectIdCustomer using both ObjectId & string userId
    const { sessions } = getCollections();
    const sess1 = new ObjectId();
    const sess2 = new ObjectId();
    await sessions.insertMany([
      {
        _id: sess1,
        userId: objectIdCustomerObjectId,
        token: `tok1_${runSuffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        _id: sess2,
        userId: objectIdCustomerId,
        token: `tok2_${runSuffix}`,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    createdSessionIds.push(sess1, sess2);

    // Extra body fields on block must fail validation
    const invalidBlockBody = await apiRequest(
      `/api/admin/users/${objectIdCustomerId}/block`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { role: "admin" },
      }
    );
    assert.equal(invalidBlockBody.status, 400);

    // Cannot block an admin
    const blockAdminRes = await apiRequest(`/api/admin/users/${adminId}/block`, {
      method: "PATCH",
      token: adminToken,
    });
    assert.equal(blockAdminRes.status, 403);
    assert.equal(blockAdminRes.json?.code, "CANNOT_BLOCK_ADMIN");

    // Block objectIdCustomer -> revokes Better Auth sessions & blocks protected routes immediately
    const blockCust = await apiRequest(
      `/api/admin/users/${objectIdCustomerId}/block`,
      { method: "PATCH", token: adminToken }
    );
    assert.equal(blockCust.status, 200);
    assert.equal(blockCust.json.data.isBlocked, true);

    const remainingSessions = await sessions.countDocuments({
      _id: { $in: [sess1, sess2] },
    });
    assert.equal(remainingSessions, 0);

    const blockedMe = await apiRequest("/api/profile", {
      token: objectIdCustomerToken,
    });
    assert.equal(blockedMe.status, 403);
    assert.equal(blockedMe.json?.code, "USER_BLOCKED");

    // Unblock restores access immediately
    const unblockCust = await apiRequest(
      `/api/admin/users/${objectIdCustomerId}/unblock`,
      { method: "PATCH", token: adminToken }
    );
    assert.equal(unblockCust.status, 200);
    assert.equal(unblockCust.json.data.isBlocked, false);

    const restoredDash = await apiRequest("/api/dashboard/customer", {
      token: objectIdCustomerToken,
    });
    assert.equal(restoredDash.status, 200);
  });

  test("validates GET/PATCH /api/profile, isolates users, and blocks protected field tampering", async () => {
    const getCust = await apiRequest("/api/profile", {
      token: objectIdCustomerToken,
    });
    assert.equal(getCust.status, 200);
    assert.equal(getCust.json.data.id, objectIdCustomerId);
    assert.equal(getCust.json.data.password, undefined);
    assert.equal(getCust.json.data._id, undefined);

    const updateCust = await apiRequest("/api/profile", {
      method: "PATCH",
      token: objectIdCustomerToken,
      jsonBody: {
        name: `Updated Obj Cust ${runSuffix}`,
        phone: "+880 1811 223344",
        image: "https://i.ibb.co/example/avatar.png",
      },
    });
    assert.equal(updateCust.status, 200);
    assert.equal(updateCust.json.data.name, `Updated Obj Cust ${runSuffix}`);
    assert.equal(updateCust.json.data.phone, "+880 1811 223344");
    assert.equal(
      updateCust.json.data.image,
      "https://i.ibb.co/example/avatar.png"
    );
    assert.equal(updateCust.json.data.role, "customer");

    // Admin can also update own profile
    const updateAdm = await apiRequest("/api/profile", {
      method: "PATCH",
      token: adminToken,
      jsonBody: { name: `Updated Admin ${runSuffix}`, phone: "" },
    });
    assert.equal(updateAdm.status, 200);
    assert.equal(updateAdm.json.data.name, `Updated Admin ${runSuffix}`);
    assert.equal(updateAdm.json.data.phone, null);
    assert.equal(updateAdm.json.data.role, "admin");

    // Reject empty update, invalid phone, invalid URL
    const emptyPatch = await apiRequest("/api/profile", {
      method: "PATCH",
      token: customerAToken,
      jsonBody: {},
    });
    assert.equal(emptyPatch.status, 400);

    const badPhone = await apiRequest("/api/profile", {
      method: "PATCH",
      token: customerAToken,
      jsonBody: { phone: "abc" },
    });
    assert.equal(badPhone.status, 400);

    const badImage = await apiRequest("/api/profile", {
      method: "PATCH",
      token: customerAToken,
      jsonBody: { image: "javascript:alert(1)" },
    });
    assert.equal(badImage.status, 400);

    // Reject tampering with role, isBlocked, email, password, or id
    for (const payload of [
      { role: "admin" },
      { name: "Hacker", isBlocked: true },
      { email: "hijack@example.com" },
      { password: "NewPassword1" },
      { id: customerBId, name: "Cross Account" },
    ]) {
      const res = await apiRequest("/api/profile", {
        method: "PATCH",
        token: customerAToken,
        jsonBody: payload,
      });
      assert.equal(res.status, 400);
      assert.equal(res.json?.code, "VALIDATION_ERROR");
    }

    // Confirm Customer B was completely unaffected
    const custBProfile = await apiRequest("/api/profile", {
      token: customerBToken,
    });
    assert.equal(custBProfile.status, 200);
    assert.equal(custBProfile.json.data.name, `Stage4 Farhana ${runSuffix}`);
  });

  test("handles POST /api/uploads/profile-image validation, own-user persistence, and safe ImgBB error handling", async () => {
    // Missing file
    const emptyForm = new FormData();
    const missingRes = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: emptyForm,
    });
    assert.equal(missingRes.status, 400);
    assert.equal(missingRes.json?.code, "IMAGE_REQUIRED");

    // Invalid MIME type
    const txtForm = new FormData();
    txtForm.append(
      "image",
      new Blob(["plain text"], { type: "text/plain" }),
      "notes.txt"
    );
    const badMime = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: txtForm,
    });
    assert.equal(badMime.status, 400);
    assert.equal(badMime.json?.code, "INVALID_IMAGE_TYPE");

    // Spoofed magic bytes
    const spoofForm = new FormData();
    spoofForm.append(
      "image",
      new Blob(["not really a png"], { type: "image/png" }),
      "fake.png"
    );
    const spoofRes = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: spoofForm,
    });
    assert.equal(spoofRes.status, 400);
    assert.equal(spoofRes.json?.code, "INVALID_IMAGE_CONTENT");

    // Oversized > 5 MB
    const bigForm = new FormData();
    bigForm.append(
      "image",
      new Blob([Buffer.alloc(5 * 1024 * 1024 + 128)], { type: "image/png" }),
      "huge.png"
    );
    const hugeRes = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: bigForm,
    });
    assert.equal(hugeRes.status, 413);
    assert.equal(hugeRes.json?.code, "FILE_TOO_LARGE");

    // Upstream failure does not leak key or mutate existing image
    mockUploadBehavior = "fail";
    const failForm = new FormData();
    failForm.append(
      "image",
      new Blob([TINY_PNG_BUFFER], { type: "image/png" }),
      "avatar.png"
    );
    const upstreamFail = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: failForm,
    });
    assert.equal(upstreamFail.status, 502);
    assert.equal(upstreamFail.json?.code, "IMAGE_UPLOAD_FAILED");
    assert.equal(upstreamFail.text.includes("stage4-unit-test-key"), false);

    // Valid upload updates ONLY caller's profile image (ignores spoofed userId field)
    mockUploadBehavior = "success";
    const okForm = new FormData();
    okForm.append(
      "image",
      new Blob([TINY_PNG_BUFFER], { type: "image/png" }),
      "avatar.png"
    );
    okForm.append("userId", customerBId);

    const okUpload = await apiRequest("/api/uploads/profile-image", {
      method: "POST",
      token: customerAToken,
      formData: okForm,
    });
    assert.equal(okUpload.status, 200);
    const expectedUrl = `https://i.ibb.co/stage4-avatar-${runSuffix}.png`;
    assert.equal(okUpload.json.data.url, expectedUrl);
    assert.equal(okUpload.json.data.user.id, customerAId);
    assert.equal(okUpload.json.data.user.image, expectedUrl);

    const custBCheck = await apiRequest("/api/profile", {
      token: customerBToken,
    });
    assert.equal(custBCheck.status, 200);
    assert.equal(custBCheck.json.data.image, null);
  });
});
