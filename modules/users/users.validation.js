import { z } from "zod";

import {
  ADMIN_USERS_DEFAULT_LIMIT,
  ADMIN_USERS_MAX_LIMIT,
  USER_ACCESS_STATUSES,
} from "../../config/constants.js";
import {
  queryPositiveIntSchema,
  searchQuerySchema,
} from "../appointments/appointments.validation.js";

const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const adminUserIdParamSchema = z.object({
  id: z
    .string({ error: "Customer ID is required." })
    .trim()
    .regex(USER_ID_PATTERN, "Invalid customer ID."),
});

const userAccessStatusQuerySchema = z.preprocess(
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
    .enum(USER_ACCESS_STATUSES, {
      error: 'Status filter must be "active" or "blocked".',
    })
    .optional()
);

const adminUsersQuerySchema = z.object({
  search: searchQuerySchema,
  status: userAccessStatusQuerySchema,
  page: queryPositiveIntSchema(1, 10_000, "Page"),
  limit: queryPositiveIntSchema(
    ADMIN_USERS_DEFAULT_LIMIT,
    ADMIN_USERS_MAX_LIMIT,
    "Limit"
  ),
});

export { adminUserIdParamSchema, adminUsersQuerySchema };
