import { ApiError } from "../utils/ApiError.js";

function notFoundHandler(req, _res, next) {
  next(
    new ApiError(`Route not found: ${req.method} ${req.originalUrl}`, 404, {
      code: "NOT_FOUND",
    })
  );
}

export { notFoundHandler };
