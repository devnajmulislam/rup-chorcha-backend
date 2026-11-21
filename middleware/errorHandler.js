import multer from "multer";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { sendError } from "../utils/apiResponse.js";
import { formatZodIssues } from "../utils/validation.js";

function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return sendError(res, {
        statusCode: 413,
        message: `Image size must be ${env.maxUploadMb} MB or smaller.`,
        code: "FILE_TOO_LARGE",
      });
    }

    return sendError(res, {
      statusCode: 400,
      message: "Upload a single image using the 'image' field.",
      code: "INVALID_UPLOAD",
    });
  }

  if (err?.name === "ZodError" && Array.isArray(err.issues)) {
    return sendError(res, {
      statusCode: 400,
      message: "Validation failed.",
      code: "VALIDATION_ERROR",
      errors: formatZodIssues(err),
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return sendError(res, {
      statusCode: 400,
      message: "Invalid JSON payload.",
      code: "INVALID_JSON",
    });
  }

  if (err?.type === "entity.too.large") {
    return sendError(res, {
      statusCode: 413,
      message: "Request payload is too large.",
      code: "PAYLOAD_TOO_LARGE",
    });
  }

  if (err instanceof ApiError) {
    return sendError(res, {
      statusCode: err.statusCode,
      message: err.message,
      code: err.code,
      errors: err.errors,
    });
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[error] ${message}`);

  return sendError(res, {
    statusCode: 500,
    message: env.isProduction
      ? "Internal server error."
      : message || "Internal server error.",
    code: "INTERNAL_SERVER_ERROR",
  });
}

export { errorHandler };
