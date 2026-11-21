import { z } from "zod";

import {
  ADMIN_TRANSACTIONS_DEFAULT_LIMIT,
  ADMIN_TRANSACTIONS_MAX_LIMIT,
  CUSTOMER_TRANSACTIONS_DEFAULT_LIMIT,
  CUSTOMER_TRANSACTIONS_MAX_LIMIT,
  MAX_SEARCH_LENGTH,
  STRIPE_SESSION_ID_REGEX,
  TRANSACTION_STATUSES,
} from "../../config/constants.js";
import { isValidObjectId } from "../../utils/validation.js";

function queryPositiveIntSchema(defaultValue, maxValue, label) {
  return z.preprocess(
    (val) => {
      if (val === undefined) {
        return defaultValue;
      }

      if (typeof val === "string") {
        const trimmed = val.trim();
        if (trimmed === "") {
          return defaultValue;
        }
        if (!/^\d+$/.test(trimmed)) {
          return trimmed;
        }
        return Number(trimmed);
      }

      return val;
    },
    z
      .number({ error: `${label} must be a positive whole number.` })
      .int(`${label} must be a positive whole number.`)
      .min(1, `${label} must be at least 1.`)
      .max(maxValue, `${label} must be ${maxValue} or fewer.`)
  );
}

const transactionStatusQuerySchema = z.preprocess(
  (val) => {
    if (val === undefined) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim().toLowerCase();
      if (trimmed === "" || trimmed === "all") {
        return undefined;
      }
      return trimmed;
    }

    return val;
  },
  z
    .enum(TRANSACTION_STATUSES, {
      error: `Transaction status filter must be one of: ${TRANSACTION_STATUSES.join(", ")}.`,
    })
    .optional()
);

const checkoutBodySchema = z
  .object({
    appointmentId: z
      .string({ error: "Appointment ID is required." })
      .trim()
      .refine(isValidObjectId, "Invalid appointment ID."),
  })
  .strict();

const sessionIdParamSchema = z.object({
  sessionId: z
    .string({ error: "Stripe session ID is required." })
    .trim()
    .min(5, "Invalid Stripe checkout session ID.")
    .max(255, "Invalid Stripe checkout session ID.")
    .regex(STRIPE_SESSION_ID_REGEX, "Invalid Stripe checkout session ID."),
});

const myTransactionsQuerySchema = z.object({
  status: transactionStatusQuerySchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    CUSTOMER_TRANSACTIONS_DEFAULT_LIMIT,
    CUSTOMER_TRANSACTIONS_MAX_LIMIT,
    "Limit"
  ),
});

const adminTransactionsQuerySchema = z.object({
  status: transactionStatusQuerySchema,
  search: z.preprocess(
    (val) => {
      if (val === undefined) {
        return undefined;
      }
      if (typeof val === "string") {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return val;
    },
    z
      .string({ error: "Search term must be text." })
      .max(
        MAX_SEARCH_LENGTH,
        `Search query must be ${MAX_SEARCH_LENGTH} characters or fewer.`
      )
      .optional()
  ),
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    ADMIN_TRANSACTIONS_DEFAULT_LIMIT,
    ADMIN_TRANSACTIONS_MAX_LIMIT,
    "Limit"
  ),
});

export {
  adminTransactionsQuerySchema,
  checkoutBodySchema,
  myTransactionsQuerySchema,
  sessionIdParamSchema,
};
