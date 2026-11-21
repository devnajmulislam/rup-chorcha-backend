import Stripe from "stripe";

import { env } from "./env.js";
import { ApiError } from "../utils/ApiError.js";

let cachedStripeClient = null;
let cachedStripeKey = "";

function isStripeConfigured() {
  return Boolean(env.stripeSecretKey);
}

function isStripeWebhookConfigured() {
  return Boolean(env.stripeWebhookSecret);
}

function getStripeClient() {
  if (!env.stripeSecretKey) {
    throw new ApiError("Online payment checkout is not configured yet.", 503, {
      code: "STRIPE_NOT_CONFIGURED",
    });
  }

  if (!cachedStripeClient || cachedStripeKey !== env.stripeSecretKey) {
    cachedStripeClient = new Stripe(env.stripeSecretKey);
    cachedStripeKey = env.stripeSecretKey;
  }

  return cachedStripeClient;
}

function constructVerifiedStripeEvent({
  rawBody,
  signature,
  webhookSecret = env.stripeWebhookSecret,
  stripeClient,
}) {
  const secret = typeof webhookSecret === "string" ? webhookSecret.trim() : "";
  if (!secret) {
    throw new ApiError("Stripe webhook verification is not configured.", 503, {
      code: "STRIPE_WEBHOOK_NOT_CONFIGURED",
    });
  }

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    throw new ApiError("Webhook payload must be a raw JSON buffer.", 400, {
      code: "INVALID_WEBHOOK_PAYLOAD",
    });
  }

  const trimmedSignature =
    typeof signature === "string" ? signature.trim() : "";
  if (!trimmedSignature) {
    throw new ApiError("Missing Stripe-Signature header.", 400, {
      code: "MISSING_STRIPE_SIGNATURE",
    });
  }

  const constructEvent =
    typeof stripeClient?.webhooks?.constructEvent === "function"
      ? stripeClient.webhooks.constructEvent.bind(stripeClient.webhooks)
      : Stripe.webhooks.constructEvent.bind(Stripe.webhooks);

  try {
    return constructEvent(rawBody, trimmedSignature, secret);
  } catch {
    throw new ApiError("Invalid Stripe webhook signature.", 400, {
      code: "INVALID_STRIPE_SIGNATURE",
    });
  }
}

const stripe = env.stripeSecretKey ? getStripeClient() : null;

export {
  constructVerifiedStripeEvent,
  getStripeClient,
  isStripeConfigured,
  isStripeWebhookConfigured,
  stripe,
};
