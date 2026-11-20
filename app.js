import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { globalRateLimiter } from "./middleware/rateLimiter.js";
import { apiRouter } from "./routes/index.js";
import { ApiError } from "./utils/ApiError.js";
import { sendSuccess } from "./utils/apiResponse.js";

function createApp() {
  const app = express();

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

  app.use("/api", globalRateLimiter);

  // Part B (Better Auth at /api/auth/*splat) and Phase 5 (Stripe webhook raw
  // body at /api/payments/webhook) will be mounted before express.json().
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

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { createApp };
