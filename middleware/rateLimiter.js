import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";

const globalRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler(_req, res) {
    return sendError(res, {
      statusCode: 429,
      message: "Too many requests. Please try again shortly.",
      code: "RATE_LIMIT_EXCEEDED",
    });
  },
});

export { globalRateLimiter };
