import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ObjectId } from "mongodb";
import Stripe from "stripe";

import { createApp } from "../app.js";
import { SALON_TIMEZONE } from "../config/constants.js";
import { env, validateEnv } from "../config/env.js";
import { getStripeClient } from "../config/stripe.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDB, connectDB, getClient, getCollections } from "../db/mongo.js";
import { initAuth } from "../lib/auth.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  getSalonTodayDateString,
  parseSalonDateToUtcStart,
} from "../utils/salonTime.js";

const EXISTING_PRESERVED_SERVICE_ID = "6b008bfdeda8c9a56f80bc57";
const TEST_WEBHOOK_SECRET = "whsec_test_step5a_payments_signing_secret_123456";
const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

let liveServer = null;
let liveBaseUrl = "";
let testServer = null;
let testBaseUrl = "";

let realStripe = null;
let customerAToken = "";
let customerBToken = "";
let blockedCustomerToken = "";
let adminToken = "";

let customerAId = "";
let customerBId = "";
let blockedCustomerId = "";
let adminId = "";

let service1Id = "";
let service2Id = "";
let existingServiceBefore = null;

const createdUserObjectIds = [];
const createdServiceIds = [];
const createdAppointmentIds = [];
const createdTransactionIds = [];
const liveStripeSessionsToExpire = [];

let mockSessionCounter = 0;
const mockStripeSessions = new Map();
let mockCreateDelayMs = 0;
let mockCreateCalls = 0;

function addDaysToDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

async function apiRequest(
  baseUrl,
  path,
  { method = "GET", token, jsonBody, rawBody, headers: extraHeaders } = {}
) {
  const headers = new Headers(extraHeaders || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let body;
  if (rawBody !== undefined) {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    body = rawBody;
  } else if (jsonBody !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(jsonBody);
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

function buildSignedWebhookRequest(eventPayload, secret = TEST_WEBHOOK_SECRET) {
  const rawPayload = JSON.stringify(eventPayload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawPayload,
    secret,
  });
  return { rawPayload, signature };
}

async function seedTestUser({ name, email, role = "customer", isBlocked = false }) {
  const { users } = getCollections();
  const objectId = new ObjectId();
  const stringId = `step5_${role}_${runSuffix}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  await users.insertOne({
    _id: objectId,
    id: stringId,
    name,
    email: email.toLowerCase(),
    emailVerified: true,
    image: null,
    phone: "+880 1711-112233",
    role,
    isBlocked,
    createdAt: now,
    updatedAt: now,
  });
  createdUserObjectIds.push(objectId);

  const { token } = await signAccessToken({
    id: stringId,
    email: email.toLowerCase(),
    role,
  });

  return { id: stringId, objectId, email: email.toLowerCase(), token };
}

const mockStripeClient = {
  checkout: {
    sessions: {
      async create(params) {
        mockCreateCalls += 1;
        if (mockCreateDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, mockCreateDelayMs));
        }

        mockSessionCounter += 1;
        const id = `cs_test_mock_${runSuffix.replace(/-/g, "")}_${mockSessionCounter}`;
        const session = {
          id,
          object: "checkout.session",
          url: `https://checkout.stripe.com/c/pay/${id}`,
          status: "open",
          payment_status: "unpaid",
          payment_intent: `pi_test_${mockSessionCounter}`,
          amount_total: params.line_items?.[0]?.price_data?.unit_amount ?? 0,
          currency: params.line_items?.[0]?.price_data?.currency ?? "usd",
          expires_at: params.expires_at,
          metadata: params.metadata ?? {},
        };
        mockStripeSessions.set(id, session);
        return session;
      },

      async retrieve(sessionId) {
        const found = mockStripeSessions.get(sessionId);
        if (!found) {
          throw new Error(`No such mock session: ${sessionId}`);
        }
        return { ...found };
      },

      async expire(sessionId) {
        const found = mockStripeSessions.get(sessionId);
        if (found) {
          found.status = "expired";
        }
        return found ? { ...found } : { id: sessionId, status: "expired" };
      },
    },
  },
};

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

  const [cA, cB, cBlocked, adm] = await Promise.all([
    seedTestUser({
      name: `Step5 Nadia ${runSuffix}`,
      email: `step5.nadia.${runSuffix}@example.com`,
      role: "customer",
    }),
    seedTestUser({
      name: `Step5 Tariq ${runSuffix}`,
      email: `step5.tariq.${runSuffix}@example.com`,
      role: "customer",
    }),
    seedTestUser({
      name: `Step5 Blocked ${runSuffix}`,
      email: `step5.blocked.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: true,
    }),
    seedTestUser({
      name: `Step5 Admin ${runSuffix}`,
      email: `step5.admin.${runSuffix}@example.com`,
      role: "admin",
    }),
  ]);

  customerAToken = cA.token;
  customerAId = cA.id;
  customerBToken = cB.token;
  customerBId = cB.id;
  blockedCustomerToken = cBlocked.token;
  blockedCustomerId = cBlocked.id;
  adminToken = adm.token;
  adminId = adm.id;

  const s1Id = new ObjectId();
  const s2Id = new ObjectId();
  const now = new Date();
  await services.insertMany([
    {
      _id: s1Id,
      serviceName: `Step5 Royal Facial ${runSuffix}`,
      category: "Facial & Skincare",
      description: "Signature facial service for Stripe Step 5A verification.",
      price: 7500,
      duration: 60,
      image: "https://i.ibb.co/precheck/step5-facial.png",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    {
      _id: s2Id,
      serviceName: `Step5 Bridal Makeup ${runSuffix}`,
      category: "Makeup",
      description: "Luxury bridal makeup service for Stripe Step 5A verification.",
      price: 14500,
      duration: 90,
      image: "https://i.ibb.co/precheck/step5-makeup.png",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
  ]);
  createdServiceIds.push(s1Id, s2Id);
  service1Id = s1Id.toString();
  service2Id = s2Id.toString();

  if (env.stripeConfigured) {
    realStripe = getStripeClient();
  }

  const liveApp = createApp({
    auth,
    stripeWebhookSecret: TEST_WEBHOOK_SECRET,
  });
  await new Promise((resolve) => {
    liveServer = liveApp.listen(0, "127.0.0.1", () => {
      liveBaseUrl = `http://127.0.0.1:${liveServer.address().port}`;
      resolve();
    });
  });

  const testApp = createApp({
    auth,
    stripeClient: mockStripeClient,
    stripeWebhookSecret: TEST_WEBHOOK_SECRET,
  });
  await new Promise((resolve) => {
    testServer = testApp.listen(0, "127.0.0.1", () => {
      testBaseUrl = `http://127.0.0.1:${testServer.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  const { users, services, appointments, transactions } = getCollections();

  for (const sessionId of liveStripeSessionsToExpire) {
    if (realStripe) {
      await realStripe.checkout.sessions.expire(sessionId).catch(() => {});
    }
  }

  if (createdTransactionIds.length > 0 || createdAppointmentIds.length > 0) {
    await transactions.deleteMany({
      $or: [
        ...(createdTransactionIds.length > 0
          ? [{ _id: { $in: createdTransactionIds } }]
          : []),
        ...(createdAppointmentIds.length > 0
          ? [{ appointmentId: { $in: createdAppointmentIds } }]
          : []),
        { customerId: { $in: [customerAId, customerBId, blockedCustomerId] } },
      ],
    });
  }

  if (createdAppointmentIds.length > 0) {
    await appointments.deleteMany({
      _id: { $in: createdAppointmentIds },
    });
  }

  if (createdServiceIds.length > 0) {
    await services.deleteMany({
      _id: { $in: createdServiceIds },
    });
  }

  if (createdUserObjectIds.length > 0) {
    await users.deleteMany({
      _id: { $in: createdUserObjectIds },
    });
  }

  if (existingServiceBefore && ObjectId.isValid(EXISTING_PRESERVED_SERVICE_ID)) {
    const existingAfter = await services.findOne({
      _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
    });
    assert.deepEqual(existingAfter, existingServiceBefore);
  }

  if (liveServer) {
    await new Promise((resolve) => liveServer.close(resolve));
  }
  if (testServer) {
    await new Promise((resolve) => testServer.close(resolve));
  }

  await closeDB();
});

async function seedAppointment({
  customerId,
  serviceId,
  daysAhead = 5,
  timeSlot = "11:00",
  servicePrice = 7500,
  status = "confirmed",
  paymentStatus = "unpaid",
}) {
  const { appointments } = getCollections();
  const id = new ObjectId();
  const dateStr = addDaysToDateStr(getSalonTodayDateString(), daysAhead);
  const now = new Date();

  await appointments.insertOne({
    _id: id,
    serviceId: new ObjectId(serviceId),
    customerId,
    appointmentDate: parseSalonDateToUtcStart(dateStr),
    timeSlot,
    message: null,
    servicePrice,
    status,
    paymentStatus,
    createdAt: now,
    updatedAt: now,
  });

  createdAppointmentIds.push(id);
  return { id: id.toString(), objectId: id, dateStr };
}

describe("Step 5A — Stripe Checkout, Verified Webhook & Payment APIs", () => {
  test("creates a real Stripe test-mode Checkout Session, reuses open session, recovers cleanly on expiration, and enforces session ownership", async () => {
    assert.ok(
      realStripe,
      "STRIPE_SECRET_KEY must be configured in rup-chorcha-backend/.env for Stripe test-mode Checkout verification."
    );

    const appt = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 6,
      timeSlot: "10:00",
      servicePrice: 7500,
      status: "confirmed",
      paymentStatus: "unpaid",
    });

    // 1. Live Stripe Test-Mode Checkout Session creation
    const checkoutRes = await apiRequest(liveBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: appt.id },
    });

    assert.equal(checkoutRes.status, 201);
    assert.equal(checkoutRes.json?.success, true);
    const createdData = checkoutRes.json.data;
    assert.equal(createdData.appointmentId, appt.id);
    assert.equal(createdData.amount, 7500);
    assert.equal(createdData.currency, "USD");
    assert.equal(createdData.status, "pending");
    assert.equal(createdData.reused, false);
    assert.match(createdData.sessionId, /^cs_test_/);
    assert.match(createdData.url, /^https:\/\/checkout\.stripe\.com\//);
    liveStripeSessionsToExpire.push(createdData.sessionId);

    const remoteSession = await realStripe.checkout.sessions.retrieve(
      createdData.sessionId
    );
    assert.equal(remoteSession.amount_total, 7500);
    assert.equal(remoteSession.currency, "usd");
    assert.equal(remoteSession.metadata?.appointmentId, appt.id);
    assert.equal(remoteSession.metadata?.customerId, customerAId);
    assert.equal(remoteSession.status, "open");
    assert.ok(
      remoteSession.success_url?.includes(
        "/payment/success?session_id={CHECKOUT_SESSION_ID}"
      )
    );
    assert.ok(
      remoteSession.cancel_url?.includes(
        `/payment/cancel?appointmentId=${appt.id}`
      )
    );

    // 2. Duplicate Checkout call reuses the active open Stripe session without creating another row
    const reuseRes = await apiRequest(liveBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: appt.id },
    });
    assert.equal(reuseRes.status, 200);
    assert.equal(reuseRes.json.data.reused, true);
    assert.equal(reuseRes.json.data.sessionId, createdData.sessionId);

    const { transactions } = getCollections();
    assert.equal(
      await transactions.countDocuments({ appointmentId: appt.objectId }),
      1
    );

    // 3. Session lookup ownership checks
    const ownerLookup = await apiRequest(
      liveBaseUrl,
      `/api/payments/session/${createdData.sessionId}`,
      { token: customerAToken }
    );
    assert.equal(ownerLookup.status, 200);
    assert.equal(ownerLookup.json.data.sessionId, createdData.sessionId);
    assert.equal(ownerLookup.json.data.status, "pending");
    assert.equal(ownerLookup.json.data.isFinal, false);
    assert.equal(ownerLookup.json.data.amount, 7500);
    assert.equal(ownerLookup.json.data.currency, "USD");
    assert.equal(ownerLookup.json.data.appointment.id, appt.id);
    assert.equal(ownerLookup.json.data.appointment.paymentStatus, "unpaid");
    assert.equal(ownerLookup.json.data.client_secret, undefined);
    assert.equal(ownerLookup.json.data.checkoutUrl, undefined);

    const otherCustLookup = await apiRequest(
      liveBaseUrl,
      `/api/payments/session/${createdData.sessionId}`,
      { token: customerBToken }
    );
    assert.equal(otherCustLookup.status, 403);

    const adminLookup = await apiRequest(
      liveBaseUrl,
      `/api/payments/session/${createdData.sessionId}`,
      { token: adminToken }
    );
    assert.equal(adminLookup.status, 403);

    const invalidLookup = await apiRequest(
      liveBaseUrl,
      "/api/payments/session/bad_session_id",
      { token: customerAToken }
    );
    assert.equal(invalidLookup.status, 400);

    const missingLookup = await apiRequest(
      liveBaseUrl,
      "/api/payments/session/cs_test_nonexistent_99999",
      { token: customerAToken }
    );
    assert.equal(missingLookup.status, 404);

    // 4. Expire the live Stripe session directly on Stripe and confirm retry creates a fresh session
    await realStripe.checkout.sessions.expire(createdData.sessionId);
    const retryRes = await apiRequest(liveBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: appt.id },
    });
    assert.equal(retryRes.status, 201);
    assert.equal(retryRes.json.data.reused, false);
    assert.notEqual(retryRes.json.data.sessionId, createdData.sessionId);
    liveStripeSessionsToExpire.push(retryRes.json.data.sessionId);

    const oldTx = await transactions.findOne({
      stripeSessionId: createdData.sessionId,
    });
    assert.equal(oldTx?.status, "failed");
  });

  test("enforces checkout authentication, ownership, status eligibility, strict amount validation, and concurrent conflict locking", async () => {
    const confirmedAppt = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 7,
      timeSlot: "12:00",
      servicePrice: 7500,
      status: "confirmed",
      paymentStatus: "unpaid",
    });
    const pendingAppt = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 7,
      timeSlot: "13:00",
      servicePrice: 7500,
      status: "pending",
      paymentStatus: "unpaid",
    });
    const cancelledAppt = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 7,
      timeSlot: "14:00",
      servicePrice: 7500,
      status: "cancelled",
      paymentStatus: "unpaid",
    });

    // Unauthenticated & role/blocked checks
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          jsonBody: { appointmentId: confirmedAppt.id },
        })
      ).status,
      401
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: blockedCustomerToken,
          jsonBody: { appointmentId: confirmedAppt.id },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: adminToken,
          jsonBody: { appointmentId: confirmedAppt.id },
        })
      ).status,
      403
    );

    // Cross-customer payment rejected
    const crossCustomer = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerBToken,
      jsonBody: { appointmentId: confirmedAppt.id },
    });
    assert.equal(crossCustomer.status, 403);

    // Invalid ID & non-existent ID
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: customerAToken,
          jsonBody: { appointmentId: "not-an-object-id" },
        })
      ).status,
      400
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: customerAToken,
          jsonBody: { appointmentId: new ObjectId().toString() },
        })
      ).status,
      404
    );

    // Tampered client-supplied price/customer/urls rejected by .strict()
    for (const extraField of [
      { amount: 100 },
      { price: 100 },
      { servicePrice: 100 },
      { customerId: customerBId },
      { paymentStatus: "paid" },
      { successUrl: "https://evil.example" },
    ]) {
      const spoofed = await apiRequest(testBaseUrl, "/api/payments/checkout", {
        method: "POST",
        token: customerAToken,
        jsonBody: { appointmentId: confirmedAppt.id, ...extraField },
      });
      assert.equal(spoofed.status, 400);
    }

    // Pending & cancelled ineligible
    const pendingRes = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: pendingAppt.id },
    });
    assert.equal(pendingRes.status, 409);
    assert.equal(pendingRes.json?.code, "APPOINTMENT_NOT_CONFIRMED");

    const cancelledRes = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: cancelledAppt.id },
    });
    assert.equal(cancelledRes.status, 409);
    assert.equal(cancelledRes.json?.code, "APPOINTMENT_CANCELLED");

    // Concurrent checkout race protected by uniq_transactions_pending_appointment
    mockCreateCalls = 0;
    mockCreateDelayMs = 200;
    try {
      const [r1, r2] = await Promise.all([
        apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: customerAToken,
          jsonBody: { appointmentId: confirmedAppt.id },
        }),
        apiRequest(testBaseUrl, "/api/payments/checkout", {
          method: "POST",
          token: customerAToken,
          jsonBody: { appointmentId: confirmedAppt.id },
        }),
      ]);
      const statuses = [r1.status, r2.status].sort((a, b) => a - b);
      assert.deepEqual(statuses, [201, 409]);
      assert.equal(mockCreateCalls, 1);
    } finally {
      mockCreateDelayMs = 0;
    }
  });

  test("verifies raw-body Stripe signatures, idempotent webhook transitions, failures/expirations, and prevents paying ineligible appointments", async () => {
    const apptPaid = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 8,
      timeSlot: "10:00",
      servicePrice: 7500,
      status: "confirmed",
      paymentStatus: "unpaid",
    });

    const cRes = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: apptPaid.id },
    });
    assert.equal(cRes.status, 201);
    const sessionId1 = cRes.json.data.sessionId;

    // 1. Missing signature & invalid signature / tampered payload
    const { rawPayload: rawValid, signature: sigValid } =
      buildSignedWebhookRequest({
        id: `evt_completed_${runSuffix}`,
        type: "checkout.session.completed",
        data: {
          object: {
            id: sessionId1,
            object: "checkout.session",
            payment_status: "paid",
            payment_intent: `pi_completed_${runSuffix}`,
            amount_total: 7500,
            currency: "usd",
            metadata: {
              appointmentId: apptPaid.id,
              customerId: customerAId,
            },
          },
        },
      });

    const missingSigRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: rawValid,
    });
    assert.equal(missingSigRes.status, 400);
    assert.equal(missingSigRes.json?.code, "MISSING_STRIPE_SIGNATURE");

    const badSigRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: rawValid,
      headers: { "stripe-signature": "t=123,v1=deadbeef" },
    });
    assert.equal(badSigRes.status, 400);
    assert.equal(badSigRes.json?.code, "INVALID_STRIPE_SIGNATURE");

    const tamperedBodyRes = await apiRequest(
      testBaseUrl,
      "/api/payments/webhook",
      {
        method: "POST",
        rawBody: rawValid.replace("7500", "100"),
        headers: { "stripe-signature": sigValid },
      }
    );
    assert.equal(tamperedBodyRes.status, 400);
    assert.equal(tamperedBodyRes.json?.code, "INVALID_STRIPE_SIGNATURE");

    // Ensure appointment was untouched after rejected webhooks
    const { appointments, transactions } = getCollections();
    assert.equal(
      (await appointments.findOne({ _id: apptPaid.objectId })).paymentStatus,
      "unpaid"
    );

    // 2. Async pending checkout.session.completed (payment_status: "unpaid") must NOT mark paid
    const asyncPendingHook = buildSignedWebhookRequest({
      id: `evt_pending_${runSuffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId1,
          payment_status: "unpaid",
          amount_total: 7500,
          currency: "usd",
        },
      },
    });
    const pendingHookRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: asyncPendingHook.rawPayload,
      headers: { "stripe-signature": asyncPendingHook.signature },
    });
    assert.equal(pendingHookRes.status, 200);
    assert.equal(pendingHookRes.json.data.outcome, "awaiting_async_payment");
    assert.equal(
      (await appointments.findOne({ _id: apptPaid.objectId })).paymentStatus,
      "unpaid"
    );

    // 3. Verified paid webhook updates tx -> paid & appointment -> paid
    const paidRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: rawValid,
      headers: { "stripe-signature": sigValid },
    });
    assert.equal(paidRes.status, 200);
    assert.equal(paidRes.json.data.outcome, "paid");
    assert.equal(paidRes.json.data.duplicate, false);

    const txAfterPaid = await transactions.findOne({
      stripeSessionId: sessionId1,
    });
    assert.equal(txAfterPaid.status, "paid");
    assert.equal(txAfterPaid.checkoutUrl, null);
    assert.ok(txAfterPaid.paidAt instanceof Date);

    const apptAfterPaid = await appointments.findOne({ _id: apptPaid.objectId });
    assert.equal(apptAfterPaid.status, "confirmed");
    assert.equal(apptAfterPaid.paymentStatus, "paid");

    // 4. Duplicate webhook delivery is idempotent
    const dupRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: rawValid,
      headers: { "stripe-signature": sigValid },
    });
    assert.equal(dupRes.status, 200);
    assert.equal(dupRes.json.data.duplicate, true);
    assert.equal(
      await transactions.countDocuments({
        appointmentId: apptPaid.objectId,
        status: "paid",
      }),
      1
    );

    // 5. Late expired/failed webhook never downgrades already-paid transaction
    const lateExpired = buildSignedWebhookRequest({
      id: `evt_late_exp_${runSuffix}`,
      type: "checkout.session.expired",
      data: { object: { id: sessionId1 } },
    });
    const lateExpRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: lateExpired.rawPayload,
      headers: { "stripe-signature": lateExpired.signature },
    });
    assert.equal(lateExpRes.status, 200);
    assert.equal(lateExpRes.json.data.outcome, "ignored_already_paid");
    assert.equal(
      (await transactions.findOne({ stripeSessionId: sessionId1 })).status,
      "paid"
    );

    // 6. Paid appointment cannot initiate another checkout
    const repayRes = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerAToken,
      jsonBody: { appointmentId: apptPaid.id },
    });
    assert.equal(repayRes.status, 409);
    assert.equal(repayRes.json?.code, "APPOINTMENT_ALREADY_PAID");

    // 7. Session lookup shows paid state cleanly
    const paidSessionLookup = await apiRequest(
      testBaseUrl,
      `/api/payments/session/${sessionId1}`,
      { token: customerAToken }
    );
    assert.equal(paidSessionLookup.status, 200);
    assert.equal(paidSessionLookup.json.data.status, "paid");
    assert.equal(paidSessionLookup.json.data.isFinal, true);
    assert.equal(paidSessionLookup.json.data.appointment.paymentStatus, "paid");

    // 8. Expired -> retry -> async_payment_failed -> retry -> async_payment_succeeded lifecycle
    const apptRetry = await seedAppointment({
      customerId: customerBId,
      serviceId: service2Id,
      daysAhead: 9,
      timeSlot: "15:00",
      servicePrice: 14500,
      status: "confirmed",
      paymentStatus: "unpaid",
    });

    const firstTry = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerBToken,
      jsonBody: { appointmentId: apptRetry.id },
    });
    assert.equal(firstTry.status, 201);
    const sidExpire = firstTry.json.data.sessionId;

    const expHook = buildSignedWebhookRequest({
      id: `evt_exp_${runSuffix}`,
      type: "checkout.session.expired",
      data: {
        object: {
          id: sidExpire,
          amount_total: 14500,
          currency: "usd",
        },
      },
    });
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/webhook", {
          method: "POST",
          rawBody: expHook.rawPayload,
          headers: { "stripe-signature": expHook.signature },
        })
      ).status,
      200
    );
    assert.equal(
      (await transactions.findOne({ stripeSessionId: sidExpire })).status,
      "failed"
    );
    assert.equal(
      (await appointments.findOne({ _id: apptRetry.objectId })).paymentStatus,
      "unpaid"
    );

    // Retry creates second session -> async_payment_failed
    const secondTry = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerBToken,
      jsonBody: { appointmentId: apptRetry.id },
    });
    assert.equal(secondTry.status, 201);
    const sidAsyncFail = secondTry.json.data.sessionId;

    const asyncFailHook = buildSignedWebhookRequest({
      id: `evt_afail_${runSuffix}`,
      type: "checkout.session.async_payment_failed",
      data: {
        object: {
          id: sidAsyncFail,
          payment_intent: `pi_fail_${runSuffix}`,
        },
      },
    });
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/payments/webhook", {
          method: "POST",
          rawBody: asyncFailHook.rawPayload,
          headers: { "stripe-signature": asyncFailHook.signature },
        })
      ).status,
      200
    );
    assert.equal(
      (await transactions.findOne({ stripeSessionId: sidAsyncFail })).status,
      "failed"
    );

    // Third attempt succeeds via async_payment_succeeded
    const thirdTry = await apiRequest(testBaseUrl, "/api/payments/checkout", {
      method: "POST",
      token: customerBToken,
      jsonBody: { appointmentId: apptRetry.id },
    });
    assert.equal(thirdTry.status, 201);
    const sidAsyncSuccess = thirdTry.json.data.sessionId;

    const asyncSuccessHook = buildSignedWebhookRequest({
      id: `evt_asucc_${runSuffix}`,
      type: "checkout.session.async_payment_succeeded",
      data: {
        object: {
          id: sidAsyncSuccess,
          payment_intent: `pi_succ_${runSuffix}`,
          amount_total: 14500,
          currency: "usd",
        },
      },
    });
    const succRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: asyncSuccessHook.rawPayload,
      headers: { "stripe-signature": asyncSuccessHook.signature },
    });
    assert.equal(succRes.status, 200);
    assert.equal(succRes.json.data.outcome, "paid");
    assert.equal(
      (await appointments.findOne({ _id: apptRetry.objectId })).paymentStatus,
      "paid"
    );

    // 9. Cancelled appointment receiving paid webhook must NOT become paid
    const apptCancelledHook = await seedAppointment({
      customerId: customerAId,
      serviceId: service1Id,
      daysAhead: 10,
      timeSlot: "17:00",
      servicePrice: 7500,
      status: "cancelled",
      paymentStatus: "unpaid",
    });
    const fakeCancelledSid = `cs_test_cancelled_${runSuffix.replace(/-/g, "")}`;
    const cancelledHook = buildSignedWebhookRequest({
      id: `evt_cancel_hook_${runSuffix}`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: fakeCancelledSid,
          payment_status: "paid",
          amount_total: 7500,
          currency: "usd",
          metadata: {
            appointmentId: apptCancelledHook.id,
            customerId: customerAId,
          },
        },
      },
    });
    const cancelHookRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: cancelledHook.rawPayload,
      headers: { "stripe-signature": cancelledHook.signature },
    });
    assert.equal(cancelHookRes.status, 200);
    assert.equal(cancelHookRes.json.data.outcome, "appointment_not_confirmed");
    assert.equal(
      (await appointments.findOne({ _id: apptCancelledHook.objectId })).paymentStatus,
      "unpaid"
    );

    // 10. Unhandled event type safely acknowledged
    const ignoredEvent = buildSignedWebhookRequest({
      id: `evt_ignored_${runSuffix}`,
      type: "payment_intent.created",
      data: { object: { id: "pi_123" } },
    });
    const ignoredRes = await apiRequest(testBaseUrl, "/api/payments/webhook", {
      method: "POST",
      rawBody: ignoredEvent.rawPayload,
      headers: { "stripe-signature": ignoredEvent.signature },
    });
    assert.equal(ignoredRes.status, 200);
    assert.equal(ignoredRes.json.data.handled, false);
  });

  test("enforces customer transaction isolation, admin read-only transaction ledger filtering/search, and dashboard revenue sync", async () => {
    // Unauthenticated & role rejections
    assert.equal(
      (await apiRequest(testBaseUrl, "/api/transactions/my")).status,
      401
    );
    assert.equal(
      (await apiRequest(testBaseUrl, "/api/admin/transactions")).status,
      401
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/transactions/my", {
          token: blockedCustomerToken,
        })
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/transactions/my", {
          token: adminToken,
        })
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(testBaseUrl, "/api/admin/transactions", {
          token: customerAToken,
        })
      ).status,
      403
    );

    // Customer A sees ONLY Customer A transactions (never Customer B's)
    const custATx = await apiRequest(
      testBaseUrl,
      "/api/transactions/my?page=1&limit=10",
      { token: customerAToken }
    );
    assert.equal(custATx.status, 200);
    assert.ok(custATx.json.data.length >= 2);
    for (const item of custATx.json.data) {
      assert.equal(item._id, undefined);
      assert.equal(item.checkoutUrl, undefined);
      assert.equal(item.lastStripeEventId, undefined);
      assert.equal(item.password, undefined);
      assert.equal(item.currency, "USD");
    }
    assert.equal(
      custATx.json.data.some((tx) => tx.serviceName.includes("Bridal Makeup")),
      false,
      "Customer A must not see Customer B transactions"
    );

    // Customer A paid filter
    const custAPaid = await apiRequest(
      testBaseUrl,
      "/api/transactions/my?status=paid",
      { token: customerAToken }
    );
    assert.equal(custAPaid.status, 200);
    assert.equal(custAPaid.json.data.length, 1);
    assert.equal(custAPaid.json.data[0].amount, 7500);
    assert.equal(custAPaid.json.data[0].status, "paid");

    // Admin transactions list, search (name/email/service/session), status filter & metadata
    const adminSearchCustomerB = await apiRequest(
      testBaseUrl,
      `/api/admin/transactions?search=${encodeURIComponent(`Step5 Tariq ${runSuffix}`)}`,
      { token: adminToken }
    );
    assert.equal(adminSearchCustomerB.status, 200);
    assert.equal(adminSearchCustomerB.json.data.length, 3);
    for (const row of adminSearchCustomerB.json.data) {
      assert.equal(row.customerName, `Step5 Tariq ${runSuffix}`);
      assert.equal(row.customerEmail, `step5.tariq.${runSuffix}@example.com`);
      assert.equal(row._id, undefined);
      assert.equal(row.password, undefined);
      assert.equal(row.checkoutUrl, undefined);
    }

    const adminFailedFilter = await apiRequest(
      testBaseUrl,
      `/api/admin/transactions?status=failed&search=${encodeURIComponent(runSuffix.slice(0, 8))}`,
      { token: adminToken }
    );
    assert.equal(adminFailedFilter.status, 200);
    assert.ok(adminFailedFilter.json.data.length >= 3);
    assert.ok(
      adminFailedFilter.json.data.every((item) => item.status === "failed")
    );
    assert.equal(adminFailedFilter.json.meta.currency, "USD");
    assert.ok(adminFailedFilter.json.meta.totalPaidRevenueCents >= 22000);

    // Regex metacharacters in search do not throw
    const regexSearch = await apiRequest(
      testBaseUrl,
      `/api/admin/transactions?search=${encodeURIComponent(".*+?[]()")}`,
      { token: adminToken }
    );
    assert.equal(regexSearch.status, 200);
    assert.equal(regexSearch.json.data.length, 0);

    // Strictly read-only ledger: POST/PATCH/PUT/DELETE rejected with 404
    const someTxId = custAPaid.json.data[0].id;
    for (const [method, path] of [
      ["POST", "/api/admin/transactions"],
      ["PATCH", `/api/admin/transactions/${someTxId}`],
      ["PUT", `/api/admin/transactions/${someTxId}`],
      ["DELETE", `/api/admin/transactions/${someTxId}`],
    ]) {
      const mutateRes = await apiRequest(testBaseUrl, path, {
        method,
        token: adminToken,
        jsonBody: { status: "paid" },
      });
      assert.equal(mutateRes.status, 404);
    }

    // Dashboard admin reflects updated transaction counts & revenue
    const adminDash = await apiRequest(testBaseUrl, "/api/dashboard/admin", {
      token: adminToken,
    });
    assert.equal(adminDash.status, 200);
    assert.equal(adminDash.json.data.overview.hasRecordedTransactions, true);
    assert.ok(adminDash.json.data.overview.successfulPayments >= 2);
    assert.ok(adminDash.json.data.overview.totalRevenueCents >= 22000);
  });
});
