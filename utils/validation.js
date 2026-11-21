import { ObjectId } from "mongodb";

import { ApiError } from "./ApiError.js";

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

function isValidObjectId(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return OBJECT_ID_REGEX.test(trimmed) && ObjectId.isValid(trimmed);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatZodIssues(zodError) {
  const fieldErrors = {};

  for (const issue of zodError?.issues ?? []) {
    if (issue.code === "unrecognized_keys" && Array.isArray(issue.keys)) {
      for (const key of issue.keys) {
        if (typeof key === "string" && !fieldErrors[key]) {
          fieldErrors[key] = `Field "${key}" is not allowed.`;
        }
      }
      continue;
    }

    const firstKey = issue.path?.[0];
    const key = typeof firstKey === "string" && firstKey ? firstKey : "_form";
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }

  return fieldErrors;
}

function parseWithSchema(
  schema,
  data,
  { message = "Validation failed.", code = "VALIDATION_ERROR" } = {}
) {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ApiError(message, 400, {
      code,
      errors: formatZodIssues(result.error),
    });
  }

  return result.data;
}

export {
  OBJECT_ID_REGEX,
  escapeRegex,
  formatZodIssues,
  isValidObjectId,
  parseWithSchema,
};
