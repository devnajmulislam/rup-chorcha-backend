import { z } from "zod";

import {
  ADMIN_APPOINTMENTS_DEFAULT_LIMIT,
  ADMIN_APPOINTMENTS_MAX_LIMIT,
  APPOINTMENT_STATUSES,
  CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT,
  CUSTOMER_APPOINTMENTS_MAX_LIMIT,
  MAX_APPOINTMENT_MESSAGE_LENGTH,
  MAX_SEARCH_LENGTH,
  PAYMENT_STATUSES,
  TIME_SLOTS,
} from "../../config/constants.js";
import { isValidDateString } from "../../utils/salonTime.js";
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

const appointmentIdParamSchema = z.object({
  id: z
    .string({ error: "Appointment ID is required." })
    .trim()
    .refine(isValidObjectId, "Invalid appointment ID."),
});

const availabilityQuerySchema = z.object({
  date: z.preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z
      .string({ error: "Appointment date (YYYY-MM-DD) is required." })
      .refine(
        isValidDateString,
        "Enter a valid appointment date in YYYY-MM-DD format."
      )
  ),
});

const appointmentMessageSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) {
      return null;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return val;
  },
  z
    .string({ error: "Appointment note must be text." })
    .max(
      MAX_APPOINTMENT_MESSAGE_LENGTH,
      `Message must be ${MAX_APPOINTMENT_MESSAGE_LENGTH} characters or fewer.`
    )
    .nullable()
);

const createAppointmentSchema = z
  .object({
    serviceId: z
      .string({ error: "Service ID is required." })
      .trim()
      .refine(isValidObjectId, "Invalid service ID."),
    appointmentDate: z
      .string({ error: "Appointment date is required." })
      .trim()
      .refine(
        isValidDateString,
        "Enter a valid appointment date in YYYY-MM-DD format."
      ),
    timeSlot: z.enum(TIME_SLOTS, {
      error: `Time slot must be one of: ${TIME_SLOTS.join(", ")}.`,
    }),
    message: appointmentMessageSchema,
  })
  .strict();

const appointmentStatusQuerySchema = z.preprocess(
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
    .enum(APPOINTMENT_STATUSES, {
      error: 'Status filter must be "pending", "confirmed", or "cancelled".',
    })
    .optional()
);

const myAppointmentsQuerySchema = z.object({
  status: appointmentStatusQuerySchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    CUSTOMER_APPOINTMENTS_DEFAULT_LIMIT,
    CUSTOMER_APPOINTMENTS_MAX_LIMIT,
    "Limit"
  ),
});

const paymentStatusQuerySchema = z.preprocess(
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
    .enum(PAYMENT_STATUSES, {
      error: 'Payment status filter must be "unpaid" or "paid".',
    })
    .optional()
);

const searchQuerySchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    return val;
  },
  z
    .string({ error: "Search query must be text." })
    .max(
      MAX_SEARCH_LENGTH,
      `Search query must be ${MAX_SEARCH_LENGTH} characters or fewer.`
    )
    .optional()
);

const optionalDateFilterSchema = z.preprocess(
  (val) => {
    if (val === undefined || val === null) {
      return undefined;
    }

    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    return val;
  },
  z
    .string({ error: "Appointment date filter must be text." })
    .refine(
      isValidDateString,
      "Enter a valid appointment date filter in YYYY-MM-DD format."
    )
    .optional()
);

const adminAppointmentsQuerySchema = z.object({
  status: appointmentStatusQuerySchema,
  paymentStatus: paymentStatusQuerySchema,
  search: searchQuerySchema,
  date: optionalDateFilterSchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    ADMIN_APPOINTMENTS_DEFAULT_LIMIT,
    ADMIN_APPOINTMENTS_MAX_LIMIT,
    "Limit"
  ),
});

const adminUpdateAppointmentStatusSchema = z
  .object({
    status: z.enum(["confirmed", "cancelled"], {
      error: 'Admin status update must be "confirmed" or "cancelled".',
    }),
  })
  .strict();

const emptyStrictBodySchema = z.preprocess(
  (val) => (val === undefined || val === null ? {} : val),
  z.object({}).strict()
);

export {
  adminAppointmentsQuerySchema,
  adminUpdateAppointmentStatusSchema,
  appointmentIdParamSchema,
  appointmentStatusQuerySchema,
  availabilityQuerySchema,
  createAppointmentSchema,
  emptyStrictBodySchema,
  myAppointmentsQuerySchema,
  queryPositiveIntSchema,
  searchQuerySchema,
};
