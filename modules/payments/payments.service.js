import { ObjectId } from "mongodb";

import {
  CHECKOUT_SESSION_EXPIRES_SECONDS,
  MAX_PRICE_CENTS,
  MIN_STRIPE_AMOUNT_CENTS,
  PENDING_CHECKOUT_LOCK_STALE_MS,
  SALON_TIMEZONE,
} from "../../config/constants.js";
import { env } from "../../config/env.js";
import { getStripeClient } from "../../config/stripe.js";
import { getCollections } from "../../db/mongo.js";
import { ApiError } from "../../utils/ApiError.js";
import { formatUtcDateToSalonDateString } from "../../utils/salonTime.js";
import { escapeRegex, isValidObjectId } from "../../utils/validation.js";
import {
  ADMIN_CUSTOMER_LOOKUP_STAGE,
  SERVICE_SUMMARY_PROJECTION,
  toIsoTimestamp,
} from "../appointments/appointments.service.js";

function normalizeTxStatus(status) {
  if (status === "paid" || status === "failed" || status === "pending") {
    return status;
  }
  return "failed";
}

function normalizePaymentIntentId(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "object" && typeof value.id === "string") {
    const trimmed = value.id.trim();
    return trimmed || null;
  }
  return null;
}

function toSafeCustomerTransaction(doc) {
  if (!doc) {
    return null;
  }

  const appointment =
    doc.appointment && typeof doc.appointment === "object"
      ? doc.appointment
      : null;
  const service =
    doc.service && typeof doc.service === "object" ? doc.service : null;

  const appointmentId = doc.appointmentId
    ? doc.appointmentId.toString()
    : (appointment?._id?.toString() ?? "");
  const serviceId = appointment?.serviceId
    ? appointment.serviceId.toString()
    : (service?._id?.toString() ?? "");

  return {
    id: doc._id.toString(),
    appointmentId,
    serviceId,
    serviceName:
      typeof service?.serviceName === "string" && service.serviceName.trim()
        ? service.serviceName.trim()
        : "Service no longer offered",
    serviceCategory:
      typeof service?.category === "string" && service.category.trim()
        ? service.category.trim()
        : "Uncategorised",
    appointmentDate: appointment?.appointmentDate
      ? toIsoTimestamp(appointment.appointmentDate)
      : null,
    appointmentDateLocal: appointment?.appointmentDate
      ? formatUtcDateToSalonDateString(appointment.appointmentDate)
      : null,
    timeSlot:
      typeof appointment?.timeSlot === "string" ? appointment.timeSlot : null,
    appointmentStatus:
      appointment?.status === "pending" ||
      appointment?.status === "confirmed" ||
      appointment?.status === "cancelled"
        ? appointment.status
        : null,
    amount: Number(doc.amount) || 0,
    currency: String(doc.currency || "usd").toUpperCase(),
    stripeSessionId:
      typeof doc.stripeSessionId === "string" ? doc.stripeSessionId : "",
    status: normalizeTxStatus(doc.status),
    failureReason:
      typeof doc.failureReason === "string" && doc.failureReason.trim()
        ? doc.failureReason.trim()
        : null,
    paidAt: toIsoTimestamp(doc.paidAt),
    createdAt: toIsoTimestamp(doc.createdAt),
    updatedAt: toIsoTimestamp(doc.updatedAt),
  };
}

function toSafeAdminTransaction(doc) {
  const base = toSafeCustomerTransaction(doc);
  if (!base) {
    return null;
  }

  const customer =
    doc.customer && typeof doc.customer === "object" ? doc.customer : null;

  return {
    ...base,
    customerId: String(doc.customerId || ""),
    customerName:
      typeof customer?.name === "string" && customer.name.trim()
        ? customer.name.trim()
        : "Unknown customer",
    customerEmail:
      typeof customer?.email === "string" && customer.email.trim()
        ? customer.email.trim()
        : "",
  };
}

function toSafePaymentSession(txDoc, appointmentDoc, serviceDoc) {
  const status = normalizeTxStatus(txDoc.status);

  return {
    sessionId: txDoc.stripeSessionId,
    transactionId: txDoc._id.toString(),
    status,
    isFinal: status === "paid" || status === "failed",
    amount: Number(txDoc.amount) || 0,
    currency: String(txDoc.currency || "usd").toUpperCase(),
    failureReason:
      typeof txDoc.failureReason === "string" && txDoc.failureReason.trim()
        ? txDoc.failureReason.trim()
        : null,
    paidAt: toIsoTimestamp(txDoc.paidAt),
    createdAt: toIsoTimestamp(txDoc.createdAt),
    updatedAt: toIsoTimestamp(txDoc.updatedAt),
    timezone: SALON_TIMEZONE,
    appointment: appointmentDoc
      ? {
          id: appointmentDoc._id.toString(),
          serviceId: appointmentDoc.serviceId
            ? appointmentDoc.serviceId.toString()
            : "",
          serviceName:
            typeof serviceDoc?.serviceName === "string" &&
            serviceDoc.serviceName.trim()
              ? serviceDoc.serviceName.trim()
              : "Service no longer offered",
          serviceCategory:
            typeof serviceDoc?.category === "string" && serviceDoc.category.trim()
              ? serviceDoc.category.trim()
              : "Uncategorised",
          appointmentDate: toIsoTimestamp(appointmentDoc.appointmentDate),
          appointmentDateLocal: formatUtcDateToSalonDateString(
            appointmentDoc.appointmentDate
          ),
          timeSlot: String(appointmentDoc.timeSlot || ""),
          servicePrice: Number(appointmentDoc.servicePrice) || 0,
          status:
            appointmentDoc.status === "pending" ||
            appointmentDoc.status === "confirmed" ||
            appointmentDoc.status === "cancelled"
              ? appointmentDoc.status
              : "pending",
          paymentStatus:
            appointmentDoc.paymentStatus === "paid" ? "paid" : "unpaid",
        }
      : null,
  };
}

async function resolveExistingPendingCheckout({
  existingPending,
  appointmentId,
  amountCents,
  stripe,
  transactions,
  now,
}) {
  if (!existingPending.stripeSessionId) {
    const ageMs = now.getTime() - new Date(existingPending.createdAt).getTime();
    if (ageMs < PENDING_CHECKOUT_LOCK_STALE_MS) {
      throw new ApiError(
        "A payment checkout session is already being prepared for this appointment. Please try again shortly.",
        409,
        { code: "CHECKOUT_IN_PROGRESS" }
      );
    }

    await transactions.updateOne(
      { _id: existingPending._id, status: "pending", stripeSessionId: null },
      {
        $set: {
          status: "failed",
          failureReason: "abandoned_init",
          updatedAt: now,
        },
      }
    );
    return null;
  }

  if (
    existingPending.expiresAt &&
    new Date(existingPending.expiresAt).getTime() <= now.getTime()
  ) {
    await transactions.updateOne(
      { _id: existingPending._id, status: "pending" },
      {
        $set: {
          status: "failed",
          failureReason: "session_expired",
          checkoutUrl: null,
          updatedAt: now,
        },
      }
    );
    return null;
  }

  let remoteSession = null;
  try {
    remoteSession = await stripe.checkout.sessions.retrieve(
      existingPending.stripeSessionId
    );
  } catch {
    remoteSession = null;
  }

  if (
    remoteSession &&
    remoteSession.status === "complete" &&
    remoteSession.payment_status === "paid"
  ) {
    throw new ApiError("This appointment has already been paid.", 409, {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  if (remoteSession && remoteSession.status === "expired") {
    await transactions.updateOne(
      { _id: existingPending._id, status: "pending" },
      {
        $set: {
          status: "failed",
          failureReason: "session_expired",
          checkoutUrl: null,
          updatedAt: now,
        },
      }
    );
    return null;
  }

  const reusableUrl =
    (typeof remoteSession?.url === "string" && remoteSession.url) ||
    (typeof existingPending.checkoutUrl === "string" &&
      existingPending.checkoutUrl) ||
    null;

  if (
    (!remoteSession || remoteSession.status === "open") &&
    reusableUrl &&
    existingPending.amount === amountCents
  ) {
    return {
      reused: true,
      data: {
        transactionId: existingPending._id.toString(),
        appointmentId,
        sessionId: existingPending.stripeSessionId,
        url: reusableUrl,
        amount: existingPending.amount,
        currency: String(existingPending.currency || "usd").toUpperCase(),
        status: "pending",
        expiresAt: toIsoTimestamp(existingPending.expiresAt),
        reused: true,
      },
    };
  }

  if (remoteSession && remoteSession.status === "open") {
    await stripe.checkout.sessions
      .expire(existingPending.stripeSessionId)
      .catch(() => {});
  }

  await transactions.updateOne(
    { _id: existingPending._id, status: "pending" },
    {
      $set: {
        status: "failed",
        failureReason: "superseded",
        checkoutUrl: null,
        updatedAt: now,
      },
    }
  );
  return null;
}

async function createCheckoutSessionForCustomer({
  customerUser,
  appointmentId,
  stripeClient,
  now = new Date(),
}) {
  const stripe = stripeClient ?? getStripeClient();
  const { appointments, services, transactions } = getCollections();
  const appointmentObjectId = new ObjectId(appointmentId);

  const appointment = await appointments.findOne({ _id: appointmentObjectId });
  if (!appointment) {
    throw new ApiError("Appointment not found.", 404, {
      code: "APPOINTMENT_NOT_FOUND",
    });
  }

  if (appointment.customerId !== customerUser.id) {
    throw new ApiError(
      "You do not have permission to pay for this appointment.",
      403,
      { code: "FORBIDDEN" }
    );
  }

  if (appointment.status === "pending") {
    throw new ApiError(
      "Pending appointments cannot be paid until confirmed by the salon.",
      409,
      { code: "APPOINTMENT_NOT_CONFIRMED" }
    );
  }

  if (appointment.status === "cancelled") {
    throw new ApiError("Cancelled appointments cannot be paid.", 409, {
      code: "APPOINTMENT_CANCELLED",
    });
  }

  if (appointment.status !== "confirmed") {
    throw new ApiError("This appointment is not eligible for payment.", 409, {
      code: "APPOINTMENT_NOT_PAYABLE",
    });
  }

  if (appointment.paymentStatus === "paid") {
    throw new ApiError("This appointment has already been paid.", 409, {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  const existingPaidTx = await transactions.findOne(
    { appointmentId: appointmentObjectId, status: "paid" },
    { projection: { _id: 1 } }
  );
  if (existingPaidTx) {
    throw new ApiError("This appointment has already been paid.", 409, {
      code: "APPOINTMENT_ALREADY_PAID",
    });
  }

  const service = appointment.serviceId
    ? await services.findOne(
        { _id: appointment.serviceId },
        { projection: SERVICE_SUMMARY_PROJECTION }
      )
    : null;

  const snapshotPrice = Number(appointment.servicePrice);
  const servicePrice = Number(service?.price);
  const amountCents =
    Number.isInteger(snapshotPrice) && snapshotPrice > 0
      ? snapshotPrice
      : servicePrice;

  if (
    !Number.isInteger(amountCents) ||
    amountCents < MIN_STRIPE_AMOUNT_CENTS ||
    amountCents > MAX_PRICE_CENTS
  ) {
    throw new ApiError(
      "This appointment amount cannot be processed by online checkout.",
      409,
      { code: "INVALID_PAYMENT_AMOUNT" }
    );
  }

  const existingPending = await transactions.findOne({
    appointmentId: appointmentObjectId,
    status: "pending",
  });

  if (existingPending) {
    const reusedResult = await resolveExistingPendingCheckout({
      existingPending,
      appointmentId,
      amountCents,
      stripe,
      transactions,
      now,
    });
    if (reusedResult) {
      return reusedResult;
    }
  }

  const pendingTxId = new ObjectId();
  const expiresAtUnix =
    Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_EXPIRES_SECONDS;
  const expiresAtDate = new Date(expiresAtUnix * 1000);
  const serviceName =
    typeof service?.serviceName === "string" && service.serviceName.trim()
      ? service.serviceName.trim()
      : "RupChorcha Salon Appointment";
  const localDate = formatUtcDateToSalonDateString(appointment.appointmentDate);

  try {
    await transactions.insertOne({
      _id: pendingTxId,
      appointmentId: appointmentObjectId,
      customerId: customerUser.id,
      amount: amountCents,
      currency: env.stripeCurrency,
      stripeSessionId: null,
      stripePaymentIntentId: null,
      checkoutUrl: null,
      status: "pending",
      failureReason: null,
      lastStripeEventId: null,
      expiresAt: expiresAtDate,
      paidAt: null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw new ApiError(
        "A payment checkout session is already active for this appointment.",
        409,
        { code: "CHECKOUT_IN_PROGRESS" }
      );
    }
    throw error;
  }

  const productData = {
    name: serviceName,
    description:
      localDate && appointment.timeSlot
        ? `RupChorcha appointment on ${localDate} at ${appointment.timeSlot} (${SALON_TIMEZONE})`
        : "RupChorcha salon appointment payment",
    ...(typeof service?.image === "string" &&
    service.image.trim().startsWith("https://")
      ? { images: [service.image.trim()] }
      : {}),
  };

  const sessionMetadata = {
    appointmentId,
    customerId: customerUser.id,
    transactionId: pendingTxId.toString(),
    serviceId: appointment.serviceId ? appointment.serviceId.toString() : "",
  };

  let stripeSession;
  try {
    stripeSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        ...(customerUser.email ? { customer_email: customerUser.email } : {}),
        client_reference_id: appointmentId,
        line_items: [
          {
            price_data: {
              currency: env.stripeCurrency,
              unit_amount: amountCents,
              product_data: productData,
            },
            quantity: 1,
          },
        ],
        metadata: sessionMetadata,
        payment_intent_data: {
          metadata: sessionMetadata,
        },
        success_url: `${env.clientBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.clientBaseUrl}/payment/cancel?appointmentId=${encodeURIComponent(appointmentId)}`,
        expires_at: expiresAtUnix,
      },
      {
        idempotencyKey: `checkout_${pendingTxId.toString()}`,
      }
    );
  } catch {
    await transactions
      .deleteOne({ _id: pendingTxId, stripeSessionId: null })
      .catch(() => {});
    throw new ApiError(
      "Unable to start Stripe Checkout right now. Please try again shortly.",
      502,
      { code: "STRIPE_CHECKOUT_FAILED" }
    );
  }

  if (
    !stripeSession ||
    typeof stripeSession.id !== "string" ||
    typeof stripeSession.url !== "string" ||
    !stripeSession.url
  ) {
    await transactions
      .deleteOne({ _id: pendingTxId, stripeSessionId: null })
      .catch(() => {});
    throw new ApiError(
      "Stripe returned an incomplete checkout session. Please try again.",
      502,
      { code: "STRIPE_CHECKOUT_FAILED" }
    );
  }

  const sessionExpiresAt =
    typeof stripeSession.expires_at === "number"
      ? new Date(stripeSession.expires_at * 1000)
      : expiresAtDate;

  await transactions.updateOne(
    { _id: pendingTxId },
    {
      $set: {
        stripeSessionId: stripeSession.id,
        stripePaymentIntentId: normalizePaymentIntentId(
          stripeSession.payment_intent
        ),
        checkoutUrl: stripeSession.url,
        expiresAt: sessionExpiresAt,
        updatedAt: new Date(),
      },
    }
  );

  return {
    reused: false,
    data: {
      transactionId: pendingTxId.toString(),
      appointmentId,
      sessionId: stripeSession.id,
      url: stripeSession.url,
      amount: amountCents,
      currency: env.stripeCurrency.toUpperCase(),
      status: "pending",
      expiresAt: toIsoTimestamp(sessionExpiresAt),
      reused: false,
    },
  };
}

async function resolveTransactionForWebhookSession({
  session,
  transactions,
  appointments,
  requireExactAmountMatch,
  now,
}) {
  const sessionId = typeof session?.id === "string" ? session.id.trim() : "";
  if (!sessionId) {
    return { status: "unmatched" };
  }

  const existing = await transactions.findOne({ stripeSessionId: sessionId });
  if (existing) {
    return { status: "found", tx: existing };
  }

  const rawAppointmentId = session?.metadata?.appointmentId;
  const rawCustomerId =
    typeof session?.metadata?.customerId === "string"
      ? session.metadata.customerId.trim()
      : "";

  if (!isValidObjectId(rawAppointmentId) || !rawCustomerId) {
    return { status: "unmatched" };
  }

  const appointmentObjectId = new ObjectId(rawAppointmentId);
  const appointment = await appointments.findOne({ _id: appointmentObjectId });
  if (!appointment || appointment.customerId !== rawCustomerId) {
    return { status: "unmatched" };
  }

  const sessionCurrency =
    typeof session?.currency === "string"
      ? session.currency.trim().toLowerCase()
      : env.stripeCurrency;
  if (sessionCurrency !== env.stripeCurrency) {
    return { status: "mismatch" };
  }

  const expectedAmount = Number(appointment.servicePrice);
  const sessionAmount =
    typeof session?.amount_total === "number" ? session.amount_total : null;

  if (
    requireExactAmountMatch &&
    (sessionAmount === null || sessionAmount !== expectedAmount)
  ) {
    return { status: "mismatch" };
  }

  const amountToStore =
    typeof sessionAmount === "number" && sessionAmount > 0
      ? sessionAmount
      : expectedAmount;

  const existingPending = await transactions.findOne({
    appointmentId: appointmentObjectId,
    status: "pending",
  });

  if (existingPending && !existingPending.stripeSessionId) {
    const claimed = await transactions.findOneAndUpdate(
      { _id: existingPending._id, status: "pending", stripeSessionId: null },
      { $set: { stripeSessionId: sessionId, updatedAt: now } },
      { returnDocument: "after" }
    );
    if (claimed) {
      return { status: "found", tx: claimed, appointment };
    }
  }

  const fallbackTx = {
    _id: new ObjectId(),
    appointmentId: appointmentObjectId,
    customerId: appointment.customerId,
    amount: amountToStore,
    currency: env.stripeCurrency,
    stripeSessionId: sessionId,
    stripePaymentIntentId: normalizePaymentIntentId(session.payment_intent),
    checkoutUrl: null,
    status: "pending",
    failureReason: null,
    lastStripeEventId: null,
    expiresAt:
      typeof session.expires_at === "number"
        ? new Date(session.expires_at * 1000)
        : null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await transactions.insertOne(fallbackTx);
    return { status: "found", tx: fallbackTx, appointment };
  } catch (error) {
    if (error?.code === 11000) {
      const raced = await transactions.findOne({ stripeSessionId: sessionId });
      if (raced) {
        return { status: "found", tx: raced, appointment };
      }
      const existingPaid = await transactions.findOne({
        appointmentId: appointmentObjectId,
        status: "paid",
      });
      if (existingPaid) {
        return { status: "already_paid", appointment };
      }
      return { status: "unmatched" };
    }
    throw error;
  }
}

async function markSessionPaid({ session, eventId, now }) {
  const { transactions, appointments } = getCollections();
  const paymentIntentId = normalizePaymentIntentId(session?.payment_intent);

  const resolved = await resolveTransactionForWebhookSession({
    session,
    transactions,
    appointments,
    requireExactAmountMatch: true,
    now,
  });

  if (resolved.status === "already_paid") {
    await appointments.updateOne(
      {
        _id: resolved.appointment._id,
        status: "confirmed",
        paymentStatus: { $ne: "paid" },
      },
      { $set: { paymentStatus: "paid", updatedAt: now } }
    );
    return {
      received: true,
      handled: true,
      outcome: "already_paid",
      duplicate: true,
    };
  }

  if (resolved.status !== "found") {
    return {
      received: true,
      handled: false,
      outcome:
        resolved.status === "mismatch"
          ? "amount_or_currency_mismatch"
          : "unmatched_session",
      duplicate: false,
    };
  }

  const tx = resolved.tx;
  const sessionCurrency =
    typeof session?.currency === "string"
      ? session.currency.trim().toLowerCase()
      : null;

  if (
    (typeof session?.amount_total === "number" &&
      session.amount_total !== tx.amount) ||
    (sessionCurrency && sessionCurrency !== String(tx.currency).toLowerCase())
  ) {
    return {
      received: true,
      handled: false,
      outcome: "amount_or_currency_mismatch",
      duplicate: false,
    };
  }

  if (tx.status === "paid") {
    await appointments.updateOne(
      {
        _id: tx.appointmentId,
        status: "confirmed",
        paymentStatus: { $ne: "paid" },
      },
      { $set: { paymentStatus: "paid", updatedAt: now } }
    );
    return {
      received: true,
      handled: true,
      outcome: "already_processed",
      duplicate: true,
    };
  }

  const appointment =
    resolved.appointment ??
    (await appointments.findOne({ _id: tx.appointmentId }));

  if (!appointment || appointment.status !== "confirmed") {
    await transactions.updateOne(
      { _id: tx._id, status: "pending" },
      {
        $set: {
          status: "failed",
          failureReason: "appointment_not_confirmed",
          stripePaymentIntentId: paymentIntentId ?? tx.stripePaymentIntentId,
          checkoutUrl: null,
          lastStripeEventId: eventId || null,
          updatedAt: now,
        },
      }
    );
    return {
      received: true,
      handled: true,
      outcome: "appointment_not_confirmed",
      duplicate: false,
    };
  }

  const otherPaidTx = await transactions.findOne(
    {
      appointmentId: tx.appointmentId,
      status: "paid",
      _id: { $ne: tx._id },
    },
    { projection: { _id: 1 } }
  );

  if (otherPaidTx) {
    await appointments.updateOne(
      {
        _id: tx.appointmentId,
        status: "confirmed",
        paymentStatus: { $ne: "paid" },
      },
      { $set: { paymentStatus: "paid", updatedAt: now } }
    );
    await transactions.updateOne(
      { _id: tx._id, status: "pending" },
      {
        $set: {
          status: "failed",
          failureReason: "duplicate_session_for_paid_appointment",
          checkoutUrl: null,
          lastStripeEventId: eventId || null,
          updatedAt: now,
        },
      }
    );
    return {
      received: true,
      handled: true,
      outcome: "already_paid",
      duplicate: true,
    };
  }

  let updatedTx = null;
  try {
    updatedTx = await transactions.findOneAndUpdate(
      { _id: tx._id, status: { $in: ["pending", "failed"] } },
      {
        $set: {
          status: "paid",
          stripePaymentIntentId: paymentIntentId ?? tx.stripePaymentIntentId,
          checkoutUrl: null,
          failureReason: null,
          lastStripeEventId: eventId || null,
          paidAt: now,
          updatedAt: now,
        },
      },
      { returnDocument: "after" }
    );
  } catch (error) {
    if (error?.code === 11000) {
      await appointments.updateOne(
        {
          _id: tx.appointmentId,
          status: "confirmed",
          paymentStatus: { $ne: "paid" },
        },
        { $set: { paymentStatus: "paid", updatedAt: now } }
      );
      return {
        received: true,
        handled: true,
        outcome: "already_paid",
        duplicate: true,
      };
    }
    throw error;
  }

  if (!updatedTx) {
    return {
      received: true,
      handled: true,
      outcome: "already_processed",
      duplicate: true,
    };
  }

  await appointments.updateOne(
    {
      _id: tx.appointmentId,
      status: "confirmed",
      paymentStatus: { $ne: "paid" },
    },
    { $set: { paymentStatus: "paid", updatedAt: now } }
  );

  return {
    received: true,
    handled: true,
    outcome: "paid",
    duplicate: false,
  };
}

async function markSessionFailed({ session, eventId, reason, now }) {
  const { transactions, appointments } = getCollections();
  const paymentIntentId = normalizePaymentIntentId(session?.payment_intent);

  const resolved = await resolveTransactionForWebhookSession({
    session,
    transactions,
    appointments,
    requireExactAmountMatch: false,
    now,
  });

  if (resolved.status === "already_paid") {
    return {
      received: true,
      handled: true,
      outcome: "ignored_already_paid",
      duplicate: false,
    };
  }

  if (resolved.status !== "found") {
    return {
      received: true,
      handled: false,
      outcome:
        resolved.status === "mismatch"
          ? "amount_or_currency_mismatch"
          : "unmatched_session",
      duplicate: false,
    };
  }

  const tx = resolved.tx;
  if (tx.status === "paid") {
    return {
      received: true,
      handled: true,
      outcome: "ignored_already_paid",
      duplicate: false,
    };
  }

  if (tx.status === "failed") {
    return {
      received: true,
      handled: true,
      outcome: "already_processed",
      duplicate: true,
    };
  }

  const paidAppointment = await transactions.findOne(
    { appointmentId: tx.appointmentId, status: "paid" },
    { projection: { _id: 1 } }
  );

  const effectiveReason = paidAppointment ? "superseded_by_paid" : reason;

  const updatedTx = await transactions.findOneAndUpdate(
    { _id: tx._id, status: "pending" },
    {
      $set: {
        status: "failed",
        failureReason: effectiveReason,
        stripePaymentIntentId: paymentIntentId ?? tx.stripePaymentIntentId,
        checkoutUrl: null,
        lastStripeEventId: eventId || null,
        updatedAt: now,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedTx) {
    return {
      received: true,
      handled: true,
      outcome: "already_processed",
      duplicate: true,
    };
  }

  return {
    received: true,
    handled: true,
    outcome: "failed",
    duplicate: false,
  };
}

async function processStripeWebhookEvent(event, { now = new Date() } = {}) {
  const eventType = typeof event?.type === "string" ? event.type : "";
  const session = event?.data?.object;

  switch (eventType) {
    case "checkout.session.completed": {
      if (session?.payment_status === "paid") {
        return {
          eventType,
          ...(await markSessionPaid({ session, eventId: event.id, now })),
        };
      }
      return {
        received: true,
        handled: true,
        eventType,
        outcome: "awaiting_async_payment",
        duplicate: false,
      };
    }

    case "checkout.session.async_payment_succeeded":
      return {
        eventType,
        ...(await markSessionPaid({ session, eventId: event.id, now })),
      };

    case "checkout.session.expired":
      return {
        eventType,
        ...(await markSessionFailed({
          session,
          eventId: event.id,
          reason: "session_expired",
          now,
        })),
      };

    case "checkout.session.async_payment_failed":
      return {
        eventType,
        ...(await markSessionFailed({
          session,
          eventId: event.id,
          reason: "async_payment_failed",
          now,
        })),
      };

    default:
      return {
        received: true,
        handled: false,
        eventType,
        outcome: "ignored_event_type",
        duplicate: false,
      };
  }
}

async function getCustomerPaymentSession({ customerId, sessionId }) {
  const { transactions, appointments, services } = getCollections();

  const tx = await transactions.findOne({ stripeSessionId: sessionId });
  if (!tx) {
    throw new ApiError("Payment session not found.", 404, {
      code: "PAYMENT_SESSION_NOT_FOUND",
    });
  }

  if (tx.customerId !== customerId) {
    throw new ApiError(
      "You do not have permission to view this payment session.",
      403,
      { code: "FORBIDDEN" }
    );
  }

  const appointment = tx.appointmentId
    ? await appointments.findOne({ _id: tx.appointmentId })
    : null;
  const service = appointment?.serviceId
    ? await services.findOne(
        { _id: appointment.serviceId },
        { projection: SERVICE_SUMMARY_PROJECTION }
      )
    : null;

  return toSafePaymentSession(tx, appointment, service);
}

const TRANSACTION_APPOINTMENT_LOOKUP_STAGES = Object.freeze([
  {
    $lookup: {
      from: "appointments",
      localField: "appointmentId",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            _id: 1,
            serviceId: 1,
            appointmentDate: 1,
            timeSlot: 1,
            status: 1,
            paymentStatus: 1,
          },
        },
      ],
      as: "appointment",
    },
  },
  {
    $unwind: {
      path: "$appointment",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "services",
      localField: "appointment.serviceId",
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
]);

function summarizeTransactionCounts(rows) {
  const counts = {
    all: 0,
    paid: 0,
    failed: 0,
    pending: 0,
  };
  let totalPaidRevenueCents = 0;

  for (const row of rows) {
    const count = Number(row.count) || 0;
    counts.all += count;
    if (row._id === "paid" || row._id === "failed" || row._id === "pending") {
      counts[row._id] = count;
    }
    if (row._id === "paid") {
      totalPaidRevenueCents = Number(row.revenueCents) || 0;
    }
  }

  return { counts, totalPaidRevenueCents };
}

async function listCustomerTransactions({ customerId, status, page, limit }) {
  const { transactions } = getCollections();
  const match = {
    customerId,
    ...(status ? { status } : {}),
  };
  const skip = (page - 1) * limit;

  const [facetRows, statusRows] = await Promise.all([
    transactions
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: limit },
              ...TRANSACTION_APPOINTMENT_LOOKUP_STAGES,
            ],
            total: [{ $count: "count" }],
          },
        },
      ])
      .toArray(),
    transactions
      .aggregate([
        { $match: { customerId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const facetResult = facetRows[0] ?? { items: [], total: [] };
  const items = (facetResult.items ?? []).map(toSafeCustomerTransaction);
  const total = facetResult.total?.[0]?.count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const { counts } = summarizeTransactionCounts(statusRows);

  return {
    items,
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
      counts,
    },
  };
}

async function listAdminTransactions({ status, search, page, limit }) {
  const { transactions } = getCollections();
  const match = {
    ...(status ? { status } : {}),
  };
  const skip = (page - 1) * limit;

  const pipeline = [];
  if (Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    ...TRANSACTION_APPOINTMENT_LOOKUP_STAGES,
    ADMIN_CUSTOMER_LOOKUP_STAGE,
    {
      $unwind: {
        path: "$customer",
        preserveNullAndEmptyArrays: true,
      },
    }
  );

  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    pipeline.push({
      $match: {
        $or: [
          { stripeSessionId: regex },
          { "customer.name": regex },
          { "customer.email": regex },
          { "service.serviceName": regex },
        ],
      },
    });
  }

  pipeline.push(
    { $sort: { createdAt: -1, _id: -1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    }
  );

  const [facetRows, statusRows] = await Promise.all([
    transactions.aggregate(pipeline).toArray(),
    transactions
      .aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            revenueCents: {
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
  ]);

  const facetResult = facetRows[0] ?? { items: [], total: [] };
  const items = (facetResult.items ?? []).map(toSafeAdminTransaction);
  const total = facetResult.total?.[0]?.count ?? 0;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const { counts, totalPaidRevenueCents } =
    summarizeTransactionCounts(statusRows);

  return {
    items,
    meta: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page * limit < total,
      hasPrevPage: page > 1 && total > 0,
      filters: {
        status: status ?? null,
        search: search ?? null,
      },
      counts,
      totalPaidRevenueCents,
      currency: "USD",
    },
  };
}

export {
  createCheckoutSessionForCustomer,
  getCustomerPaymentSession,
  listAdminTransactions,
  listCustomerTransactions,
  processStripeWebhookEvent,
  toSafeAdminTransaction,
  toSafeCustomerTransaction,
  toSafePaymentSession,
};
