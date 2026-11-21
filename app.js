import { toNodeHandler } from "better-auth/node";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { getAuth } from "./lib/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import {
  authRateLimiter,
  globalRateLimiter,
} from "./middleware/rateLimiter.js";
import { createPaymentsController } from "./modules/payments/payments.controller.js";
import { apiRouter, createApiRouter } from "./routes/index.js";
import { ApiError } from "./utils/ApiError.js";
import { sendSuccess } from "./utils/apiResponse.js";

function createApp({
  auth = getAuth(),
  uploadImage,
  stripeClient,
  stripeWebhookSecret,
} = {}) {
  const app = express();
  const webhookController = createPaymentsController({
    stripeClient,
    stripeWebhookSecret,
  });

  app.set("trust proxy", 1);

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }

        const normalizedOrigin = origin.replace(/\/+$/, "");
        if (env.allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }

        return callback(
          new ApiError("Origin not allowed by CORS.", 403, {
            code: "CORS_NOT_ALLOWED",
          })
        );
      },
      credentials: true,
    })
  );

  // Better Auth manages its own request body parsing, so mount it before express.json().
  app.use("/api/auth", authRateLimiter);
  app.all("/api/auth/*splat", toNodeHandler(auth));

  // Mount Stripe webhook before global rate limiting and express.json() so raw Buffer signature verification stays intact.
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    webhookController.handleStripeWebhook
  );

  app.use("/api", globalRateLimiter);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    return sendSuccess(res, {
      service: "RupChorcha API",
      status: "running",
      health: "/api/health",
    });
  });

  app.use(
    "/api",
    uploadImage || stripeClient
      ? createApiRouter({ uploadImage, stripeClient })
      : apiRouter
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { createApp };
