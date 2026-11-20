import { Router } from "express";

import { env } from "../config/env.js";
import { pingDB } from "../db/mongo.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const healthRouter = Router();

healthRouter.get("/", async (_req, res, next) => {
  try {
    await pingDB();

    return sendSuccess(res, {
      status: "ok",
      service: "rup-chorcha-backend",
      database: {
        name: env.mongodbDbName,
        status: "connected",
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return next(
      new ApiError("Database health check failed.", 503, {
        code: "SERVICE_UNAVAILABLE",
      })
    );
  }
});

export { healthRouter };
