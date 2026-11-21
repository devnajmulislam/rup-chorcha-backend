import rateLimit from "express-rate-limit";

import { env } from "../config/env.js";
import { sendError } from "../utils/apiResponse.js";

function rateLimitExceededHandler(_req, res) {
  return sendError(res, {
    statusCode: 429,
    message: "Too many requests. Please try again shortly.",
    code: "RATE_LIMIT_EXCEEDED",
  });
}

const globalRateLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: env.rateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});

const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  limit: env.authRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});

const uploadRateLimiter = rateLimit({
  windowMs: env.uploadRateLimitWindowMs,
  limit: env.uploadRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});

const checkoutRateLimiter = rateLimit({
  windowMs: env.checkoutRateLimitWindowMs,
  limit: env.checkoutRateLimitMax,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: rateLimitExceededHandler,
});

export {
  authRateLimiter,
  checkoutRateLimiter,
  globalRateLimiter,
  uploadRateLimiter,
};
