import { z } from "zod";

import {
  ADMIN_SERVICES_DEFAULT_LIMIT,
  ADMIN_SERVICES_MAX_LIMIT,
  ALLOWED_SERVICE_IMAGE_HOSTS,
  MAX_DURATION_MINUTES,
  MAX_PRICE_CENTS,
  MAX_SEARCH_LENGTH,
  PUBLIC_SERVICES_DEFAULT_LIMIT,
  PUBLIC_SERVICES_MAX_LIMIT,
  SALON_CATEGORIES,
  SERVICE_SORT_OPTIONS,
  SERVICE_STATUSES,
} from "../../config/constants.js";
import { isValidObjectId } from "../../utils/validation.js";

function isAllowedServiceImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return (
      parsed.protocol === "https:" &&
      ALLOWED_SERVICE_IMAGE_HOSTS.includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

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

const searchQuerySchema = z.preprocess(
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
    .string({ error: "Search query must be text." })
    .max(
      MAX_SEARCH_LENGTH,
      `Search query must be ${MAX_SEARCH_LENGTH} characters or fewer.`
    )
    .optional()
);

const categoryQuerySchema = z.preprocess(
  (val) => {
    if (val === undefined) {
      return undefined;
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "" || trimmed.toLowerCase() === "all") {
        return undefined;
      }
      return trimmed;
    }
    return val;
  },
  z
    .enum(SALON_CATEGORIES, {
      error: `Category must be one of: ${SALON_CATEGORIES.join(", ")}.`,
    })
    .optional()
);

const statusQuerySchema = z.preprocess(
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
    .enum(SERVICE_STATUSES, {
      error: 'Status filter must be "active" or "inactive".',
    })
    .optional()
);

const sortQuerySchema = z.preprocess(
  (val) => {
    if (val === undefined) {
      return "newest";
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed === "" ? "newest" : trimmed;
    }
    return val;
  },
  z.enum(SERVICE_SORT_OPTIONS, {
    error: `Sort must be one of: ${SERVICE_SORT_OPTIONS.join(", ")}.`,
  })
);

const serviceIdParamSchema = z.object({
  id: z
    .string({ error: "Service ID is required." })
    .trim()
    .refine(isValidObjectId, "Invalid service ID."),
});

const publicServicesQuerySchema = z.object({
  search: searchQuerySchema,
  category: categoryQuerySchema,
  sort: sortQuerySchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    PUBLIC_SERVICES_DEFAULT_LIMIT,
    PUBLIC_SERVICES_MAX_LIMIT,
    "Limit"
  ),
});

const adminServicesQuerySchema = z.object({
  search: searchQuerySchema,
  category: categoryQuerySchema,
  status: statusQuerySchema,
  sort: sortQuerySchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    ADMIN_SERVICES_DEFAULT_LIMIT,
    ADMIN_SERVICES_MAX_LIMIT,
    "Limit"
  ),
});

const serviceNameSchema = z
  .string({ error: "Service name is required." })
  .trim()
  .min(2, "Service name must be at least 2 characters.")
  .max(120, "Service name must be 120 characters or fewer.");

const serviceCategorySchema = z.enum(SALON_CATEGORIES, {
  error: `Category must be one of: ${SALON_CATEGORIES.join(", ")}.`,
});

const serviceDescriptionSchema = z
  .string({ error: "Service description is required." })
  .trim()
  .min(1, "Service description is required.")
  .max(1000, "Service description must be 1000 characters or fewer.");

const servicePriceSchema = z
  .number({ error: "Price must be provided in whole USD cents." })
  .int("Price must be a whole integer amount in USD cents.")
  .min(1, "Price must be greater than 0 cents.")
  .max(
    MAX_PRICE_CENTS,
    `Price must be ${MAX_PRICE_CENTS} cents or less.`
  );

const serviceDurationSchema = z
  .number({ error: "Duration must be provided in whole minutes." })
  .int("Duration must be a whole number of minutes.")
  .min(1, "Duration must be at least 1 minute.")
  .max(
    MAX_DURATION_MINUTES,
    `Duration must be ${MAX_DURATION_MINUTES} minutes or less.`
  );

const serviceImageRequiredSchema = z
  .string({ error: "Service image URL is required." })
  .trim()
  .min(1, "Service image URL is required.")
  .refine(
    isAllowedServiceImageUrl,
    "Service image must be hosted on an approved HTTPS image host."
  );

const serviceImageOptionalSchema = z.preprocess(
  (val) => {
    if (typeof val === "string" && val.trim() === "") {
      return undefined;
    }
    return typeof val === "string" ? val.trim() : val;
  },
  z
    .string({ error: "Service image URL must be a string." })
    .refine(
      isAllowedServiceImageUrl,
      "Service image must be hosted on an approved HTTPS image host."
    )
    .optional()
);

const serviceStatusSchema = z.enum(SERVICE_STATUSES, {
  error: 'Status must be "active" or "inactive".',
});

const createServiceSchema = z
  .object({
    serviceName: serviceNameSchema,
    category: serviceCategorySchema,
    description: serviceDescriptionSchema,
    price: servicePriceSchema,
    duration: serviceDurationSchema,
    image: serviceImageRequiredSchema,
    status: serviceStatusSchema.optional().default("active"),
  })
  .strict();

const updateServiceSchema = z
  .object({
    serviceName: serviceNameSchema,
    category: serviceCategorySchema,
    description: serviceDescriptionSchema,
    price: servicePriceSchema,
    duration: serviceDurationSchema,
    image: serviceImageOptionalSchema,
    status: serviceStatusSchema.optional(),
  })
  .strict();

const updateServiceStatusSchema = z
  .object({
    status: serviceStatusSchema,
  })
  .strict();

function normalizeMultipartServiceBody(rawBody) {
  if (!rawBody || typeof rawBody !== "object") {
    return {};
  }

  const normalized = { ...rawBody };

  if (typeof normalized.price === "string") {
    const trimmed = normalized.price.trim();
    if (/^\d+$/.test(trimmed)) {
      normalized.price = Number(trimmed);
    }
  }

  if (typeof normalized.duration === "string") {
    const trimmed = normalized.duration.trim();
    if (/^\d+$/.test(trimmed)) {
      normalized.duration = Number(trimmed);
    }
  }

  if (typeof normalized.status === "string" && normalized.status.trim() === "") {
    delete normalized.status;
  }

  return normalized;
}

export {
  adminServicesQuerySchema,
  createServiceSchema,
  isAllowedServiceImageUrl,
  normalizeMultipartServiceBody,
  publicServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceSchema,
  updateServiceStatusSchema,
};
