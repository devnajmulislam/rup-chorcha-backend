import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ObjectId } from "mongodb";

import { createApp } from "../app.js";
import { SALON_TIMEZONE, TIME_SLOTS } from "../config/constants.js";
import { validateEnv } from "../config/env.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDB, connectDB, getClient, getCollections } from "../db/mongo.js";
import { initAuth } from "../lib/auth.js";
import { signAccessToken } from "../lib/jwt.js";
import { getServiceAvailabilityForCustomer } from "../modules/appointments/appointments.service.js";
import {
  formatUtcDateToSalonDateString,
  getSalonTodayDateString,
  parseSalonDateToUtcStart,
} from "../utils/salonTime.js";

const EXISTING_PRESERVED_SERVICE_ID = "6b008bfdeda8c9a56f80bc57";

let server = null;
let baseUrl = "";
let customerAToken = "";
let customerBToken = "";
let adminToken = "";
let blockedCustomerToken = "";
let customerAId = "";
let customerBId = "";

let activeService1 = null;
let activeService2 = null;
let inactiveService = null;
let existingServiceBefore = null;

const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const createdUserIds = [];
const createdServiceIds = [];
const createdAppointmentIds = [];

function addDaysToDateStr(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

async function apiRequest(path, { method = "GET", token, jsonBody } = {}) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
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

async function createSeedUser({ name, email, role, isBlocked }) {
  const { users } = getCollections();
  const id = `stage3_${role}_${isBlocked ? "blocked_" : ""}${runSuffix}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const doc = {
    id,
    name,
    email,
    image: null,
    phone: null,
    role,
    isBlocked,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };

  await users.insertOne(doc);
  createdUserIds.push(id);
  const { token } = await signAccessToken(doc);
  return { id, token };
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

  const [cA, cB, adm, blocked] = await Promise.all([
    createSeedUser({
      name: "Stage3 Customer A",
      email: `stage3.custA.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: false,
    }),
    createSeedUser({
      name: "Stage3 Customer B",
      email: `stage3.custB.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: false,
    }),
    createSeedUser({
      name: "Stage3 Admin",
      email: `stage3.admin.${runSuffix}@example.com`,
      role: "admin",
      isBlocked: false,
    }),
    createSeedUser({
      name: "Stage3 Blocked Customer",
      email: `stage3.blocked.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: true,
    }),
  ]);

  customerAId = cA.id;
  customerBId = cB.id;
  customerAToken = cA.token;
  customerBToken = cB.token;
  adminToken = adm.token;
  blockedCustomerToken = blocked.token;

  const now = new Date();
  const inserted1 = await services.insertOne({
    serviceName: `Stage3 Active Facial ${runSuffix}`,
    category: "Facial & Skincare",
    description: "Active facial service for booking tests",
    price: 8900,
    duration: 60,
    image: "https://i.ibb.co/jkR1fh6x/1c0a229cba7b.jpg",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  activeService1 = {
    id: inserted1.insertedId.toString(),
    price: 8900,
  };
  createdServiceIds.push(activeService1.id);

  const inserted2 = await services.insertOne({
    serviceName: `Stage3 Active Cut ${runSuffix}`,
    category: "Haircut & Styling",
    description: "Second active service for cross-service conflict tests",
    price: 4200,
    duration: 45,
    image: "https://i.ibb.co/jkR1fh6x/1c0a229cba7b.jpg",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  activeService2 = {
    id: inserted2.insertedId.toString(),
    price: 4200,
  };
  createdServiceIds.push(activeService2.id);

  const insertedInactive = await services.insertOne({
    serviceName: `Stage3 Inactive Wax ${runSuffix}`,
    category: "Spa & Massage",
    description: "Inactive service must not be bookable",
    price: 3500,
    duration: 30,
    image: "https://i.ibb.co/jkR1fh6x/1c0a229cba7b.jpg",
    status: "inactive",
    createdAt: now,
    updatedAt: now,
  });
  inactiveService = {
    id: insertedInactive.insertedId.toString(),
  };
  createdServiceIds.push(inactiveService.id);

  const app = createApp({ auth });
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  try {
    const { appointments, services, users } = getCollections();

    if (createdAppointmentIds.length > 0) {
      await appointments.deleteMany({
        _id: { $in: createdAppointmentIds.map((id) => new ObjectId(id)) },
      });
    }

    if (createdUserIds.length > 0) {
      await appointments.deleteMany({
        customerId: { $in: createdUserIds },
      });
      await users.deleteMany({
        id: { $in: createdUserIds },
      });
    }

    if (createdServiceIds.length > 0) {
      await services.deleteMany({
        _id: { $in: createdServiceIds.map((id) => new ObjectId(id)) },
      });
    }

    if (existingServiceBefore) {
      const afterSnapshot = await services.findOne({
        _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
      });
      assert.deepEqual(
        afterSnapshot,
        existingServiceBefore,
        "Pre-existing service document must remain unmodified"
      );
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDB().catch(() => {});
  }
});

describe("Step 3 — Express Appointments & Customer Availability APIs", () => {
  const futureDate = addDaysToDateStr(getSalonTodayDateString(), 3);
  const raceDate = addDaysToDateStr(getSalonTodayDateString(), 4);

  test("enforces authentication, customer-only role, and blocked-user guards", async () => {
    const unauthAvail = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=${futureDate}`
    );
    assert.equal(unauthAvail.status, 401);

    const unauthBook = await apiRequest("/api/appointments", {
      method: "POST",
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(unauthBook.status, 401);

    const unauthList = await apiRequest("/api/appointments/my");
    assert.equal(unauthList.status, 401);

    const adminAvail = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=${futureDate}`,
      { token: adminToken }
    );
    assert.equal(adminAvail.status, 403);
    assert.equal(adminAvail.json?.code, "FORBIDDEN");

    const adminBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(adminBook.status, 403);
    assert.equal(adminBook.json?.code, "FORBIDDEN");

    const blockedAvail = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=${futureDate}`,
      { token: blockedCustomerToken }
    );
    assert.equal(blockedAvail.status, 403);
    assert.equal(blockedAvail.json?.code, "USER_BLOCKED");

    const blockedBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: blockedCustomerToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(blockedBook.status, 403);
    assert.equal(blockedBook.json?.code, "USER_BLOCKED");

    const blockedMy = await apiRequest("/api/appointments/my", {
      token: blockedCustomerToken,
    });
    assert.equal(blockedMy.status, 403);
    assert.equal(blockedMy.json?.code, "USER_BLOCKED");
  });

  test("handles service availability, Asia/Dhaka past-slot logic, and invalid/inactive targets", async () => {
    const valid = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=${futureDate}`,
      { token: customerAToken }
    );
    assert.equal(valid.status, 200);
    assert.equal(valid.json.data.timezone, SALON_TIMEZONE);
    assert.deepEqual(valid.json.data.slots, [...TIME_SLOTS]);
    assert.deepEqual(valid.json.data.bookedSlots, []);
    assert.deepEqual(valid.json.data.pastSlots, []);
    assert.deepEqual(valid.json.data.availableSlots, [...TIME_SLOTS]);

    // Deterministic Dhaka midday test (2026-12-01T12:30:00+06:00 -> 09:00..12:00 past, 13:00..18:00 available)
    const middayDhaka = new Date("2026-12-01T12:30:00.000+06:00");
    const dhakaAvail = await getServiceAvailabilityForCustomer({
      serviceId: activeService1.id,
      customerId: customerAId,
      dateStr: "2026-12-01",
      now: middayDhaka,
    });
    assert.deepEqual(dhakaAvail.pastSlots, ["09:00", "10:00", "11:00", "12:00"]);
    assert.deepEqual(dhakaAvail.availableSlots, [
      "13:00",
      "14:00",
      "15:00",
      "16:00",
      "17:00",
      "18:00",
    ]);

    const badDate = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=2026-02-30`,
      { token: customerAToken }
    );
    assert.equal(badDate.status, 400);

    const badId = await apiRequest(
      `/api/services/123456789012/availability?date=${futureDate}`,
      { token: customerAToken }
    );
    assert.equal(badId.status, 400);
    assert.equal(badId.json?.code, "INVALID_SERVICE_ID");

    const inactiveAvail = await apiRequest(
      `/api/services/${inactiveService.id}/availability?date=${futureDate}`,
      { token: customerAToken }
    );
    assert.equal(inactiveAvail.status, 404);
    assert.equal(inactiveAvail.json?.code, "SERVICE_NOT_FOUND");
  });

  test("validates payloads, prevents spoofing, rejects past/inactive/nonexistent bookings, and snapshots server price", async () => {
    const spoofedCustomer = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        customerId: customerBId,
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(spoofedCustomer.status, 400);
    assert.equal(spoofedCustomer.json?.code, "VALIDATION_ERROR");

    const spoofedPriceStatus = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "10:00",
        servicePrice: 1,
        status: "confirmed",
        paymentStatus: "paid",
      },
    });
    assert.equal(spoofedPriceStatus.status, 400);
    assert.equal(spoofedPriceStatus.json?.code, "VALIDATION_ERROR");

    const pastDateStr = addDaysToDateStr(getSalonTodayDateString(), -1);
    const pastBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: pastDateStr,
        timeSlot: "10:00",
      },
    });
    assert.equal(pastBook.status, 400);
    assert.equal(pastBook.json?.code, "PAST_APPOINTMENT_SLOT");

    const tooFarStr = addDaysToDateStr(getSalonTodayDateString(), 120);
    const tooFarBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: tooFarStr,
        timeSlot: "10:00",
      },
    });
    assert.equal(tooFarBook.status, 400);
    assert.equal(tooFarBook.json?.code, "DATE_TOO_FAR");

    const badSlot = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "22:00",
      },
    });
    assert.equal(badSlot.status, 400);

    const inactiveBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: inactiveService.id,
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(inactiveBook.status, 404);
    assert.equal(inactiveBook.json?.code, "SERVICE_NOT_FOUND");

    const missingBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: "000000000000000000000000",
        appointmentDate: futureDate,
        timeSlot: "10:00",
      },
    });
    assert.equal(missingBook.status, 404);

    // Valid Customer A booking
    const createRes = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "11:00",
        message: "Please prepare sensitive skin cleanser",
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json?.success, true);
    const created = createRes.json.data;
    createdAppointmentIds.push(created.id);

    assert.equal("_id" in created, false);
    assert.equal(created.customerId, customerAId);
    assert.equal(created.serviceId, activeService1.id);
    assert.equal(created.servicePrice, activeService1.price);
    assert.equal(created.status, "pending");
    assert.equal(created.paymentStatus, "unpaid");
    assert.equal(created.timeSlot, "11:00");
    assert.equal(created.appointmentDateLocal, futureDate);
    assert.equal(
      created.appointmentDate,
      parseSalonDateToUtcStart(futureDate).toISOString()
    );
    assert.equal(
      formatUtcDateToSalonDateString(created.appointmentDate),
      futureDate
    );

    // Reflects in availability endpoint immediately
    const availAfter = await apiRequest(
      `/api/services/${activeService1.id}/availability?date=${futureDate}`,
      { token: customerAToken }
    );
    assert.equal(availAfter.status, 200);
    assert.deepEqual(availAfter.json.data.bookedSlots, ["11:00"]);
    assert.equal(availAfter.json.data.availableSlots.includes("11:00"), false);
  });

  test("prevents same-customer duplicate & overlapping bookings while allowing different customers on the same slot", async () => {
    // Customer A cannot book the exact same service + date + slot
    const dupSameService = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "11:00",
      },
    });
    assert.equal(dupSameService.status, 409);
    assert.equal(dupSameService.json?.code, "DUPLICATE_APPOINTMENT_SLOT");

    // Customer A cannot double-book even for a DIFFERENT service at the same date + slot
    const dupOtherService = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService2.id,
        appointmentDate: futureDate,
        timeSlot: "11:00",
      },
    });
    assert.equal(dupOtherService.status, 409);
    assert.equal(dupOtherService.json?.code, "DUPLICATE_APPOINTMENT_SLOT");

    // Customer B CAN book the exact same service, date, and slot
    const custBBook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerBToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: futureDate,
        timeSlot: "11:00",
        message: "Customer B booking same slot",
      },
    });
    assert.equal(custBBook.status, 201);
    createdAppointmentIds.push(custBBook.json.data.id);
    assert.equal(custBBook.json.data.customerId, customerBId);

    // Concurrent race condition protection via MongoDB unique partial index
    const [race1, race2] = await Promise.all([
      apiRequest("/api/appointments", {
        method: "POST",
        token: customerAToken,
        jsonBody: {
          serviceId: activeService1.id,
          appointmentDate: raceDate,
          timeSlot: "14:00",
        },
      }),
      apiRequest("/api/appointments", {
        method: "POST",
        token: customerAToken,
        jsonBody: {
          serviceId: activeService2.id,
          appointmentDate: raceDate,
          timeSlot: "14:00",
        },
      }),
    ]);

    const statuses = [race1.status, race2.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [201, 409]);
    const winner = race1.status === 201 ? race1 : race2;
    const loser = race1.status === 409 ? race1 : race2;
    createdAppointmentIds.push(winner.json.data.id);
    assert.equal(loser.json?.code, "DUPLICATE_APPOINTMENT_SLOT");
  });

  test("enforces customer ownership on list/detail/cancel and frees slot after cancellation", async () => {
    const myListA = await apiRequest("/api/appointments/my", {
      token: customerAToken,
    });
    assert.equal(myListA.status, 200);
    assert.ok(myListA.json.data.length >= 2);
    assert.ok(myListA.json.data.every((item) => item.customerId === customerAId));
    const apptAId = myListA.json.data[0].id;

    const myListB = await apiRequest("/api/appointments/my", {
      token: customerBToken,
    });
    assert.equal(myListB.status, 200);
    assert.ok(myListB.json.data.every((item) => item.customerId === customerBId));
    const apptBId = myListB.json.data[0].id;

    // Customer A can inspect own appointment
    const detailOwn = await apiRequest(`/api/appointments/my/${apptAId}`, {
      token: customerAToken,
    });
    assert.equal(detailOwn.status, 200);
    assert.equal(detailOwn.json.data.id, apptAId);

    // Customer A cannot inspect or cancel Customer B's appointment
    const detailOther = await apiRequest(`/api/appointments/my/${apptBId}`, {
      token: customerAToken,
    });
    assert.equal(detailOther.status, 403);
    assert.equal(detailOther.json?.code, "FORBIDDEN");

    const cancelOther = await apiRequest(
      `/api/appointments/my/${apptBId}/cancel`,
      {
        method: "PATCH",
        token: customerAToken,
      }
    );
    assert.equal(cancelOther.status, 403);
    assert.equal(cancelOther.json?.code, "FORBIDDEN");

    // Cancel pending booking on raceDate 14:00, then verify rebooking succeeds
    const cancelTarget = myListA.json.data.find(
      (item) => item.appointmentDateLocal === raceDate && item.timeSlot === "14:00"
    );
    assert.ok(cancelTarget, "Expected pending booking on raceDate 14:00");

    const cancelRes = await apiRequest(
      `/api/appointments/my/${cancelTarget.id}/cancel`,
      {
        method: "PATCH",
        token: customerAToken,
      }
    );
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.data.status, "cancelled");

    // Cancelling an already-cancelled appointment fails with 409
    const reCancel = await apiRequest(
      `/api/appointments/my/${cancelTarget.id}/cancel`,
      {
        method: "PATCH",
        token: customerAToken,
      }
    );
    assert.equal(reCancel.status, 409);
    assert.equal(reCancel.json?.code, "INVALID_STATUS_TRANSITION");

    // Rebooking the now-cancelled slot succeeds
    const rebook = await apiRequest("/api/appointments", {
      method: "POST",
      token: customerAToken,
      jsonBody: {
        serviceId: activeService1.id,
        appointmentDate: raceDate,
        timeSlot: "14:00",
      },
    });
    assert.equal(rebook.status, 201);
    createdAppointmentIds.push(rebook.json.data.id);
  });
});
