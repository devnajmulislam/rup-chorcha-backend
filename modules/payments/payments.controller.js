import { env } from "../../config/env.js";
import { constructVerifiedStripeEvent } from "../../config/stripe.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { parseWithSchema } from "../../utils/validation.js";
import {
  createCheckoutSessionForCustomer,
  getCustomerPaymentSession,
  listAdminTransactions,
  listCustomerTransactions,
  processStripeWebhookEvent,
} from "./payments.service.js";
import {
  adminTransactionsQuerySchema,
  checkoutBodySchema,
  myTransactionsQuerySchema,
  sessionIdParamSchema,
} from "./payments.validation.js";

function createPaymentsController({ stripeClient, stripeWebhookSecret } = {}) {
  return {
    async createCheckoutSession(req, res, next) {
      try {
        const { appointmentId } = parseWithSchema(checkoutBodySchema, req.body, {
          message: "Invalid payment checkout request.",
        });

        const result = await createCheckoutSessionForCustomer({
          customerUser: req.user,
          appointmentId,
          stripeClient,
        });

        return sendSuccess(res, result.data, {
          statusCode: result.reused ? 200 : 201,
        });
      } catch (error) {
        return next(error);
      }
    },

    async handleStripeWebhook(req, res, next) {
      try {
        const rawSignature = req.headers["stripe-signature"];
        const signature = Array.isArray(rawSignature)
          ? rawSignature[0]
          : rawSignature;

        const event = constructVerifiedStripeEvent({
          rawBody: req.body,
          signature,
          webhookSecret: stripeWebhookSecret ?? env.stripeWebhookSecret,
          stripeClient,
        });

        const result = await processStripeWebhookEvent(event);
        return sendSuccess(res, result);
      } catch (error) {
        return next(error);
      }
    },

    async getPaymentSession(req, res, next) {
      try {
        const { sessionId } = parseWithSchema(sessionIdParamSchema, req.params, {
          message: "Invalid Stripe session ID.",
          code: "INVALID_SESSION_ID",
        });

        const sessionSummary = await getCustomerPaymentSession({
          customerId: req.user.id,
          sessionId,
        });

        return sendSuccess(res, sessionSummary);
      } catch (error) {
        return next(error);
      }
    },

    async getMyTransactions(req, res, next) {
      try {
        const query = parseWithSchema(myTransactionsQuerySchema, req.query, {
          message: "Invalid transaction filter query.",
        });

        const result = await listCustomerTransactions({
          customerId: req.user.id,
          ...query,
        });

        return sendSuccess(res, result.items, { meta: result.meta });
      } catch (error) {
        return next(error);
      }
    },

    async getAdminTransactions(req, res, next) {
      try {
        const query = parseWithSchema(adminTransactionsQuerySchema, req.query, {
          message: "Invalid admin transaction filter query.",
        });

        const result = await listAdminTransactions(query);
        return sendSuccess(res, result.items, { meta: result.meta });
      } catch (error) {
        return next(error);
      }
    },
  };
}

export { createPaymentsController };
