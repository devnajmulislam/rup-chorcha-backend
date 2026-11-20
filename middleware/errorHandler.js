import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { sendError } from "../utils/apiResponse.js";

function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    return next(err);
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
