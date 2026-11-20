import { fromNodeHeaders } from "better-auth/node";
import { Router } from "express";

import { env } from "../config/env.js";
import { findUserById } from "../db/users.js";
import { getAuth } from "../lib/auth.js";
import { signAccessToken } from "../lib/jwt.js";
import {
  requireAuth,
  requireNotBlocked,
  requireRole,
} from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimiter.js";
import { ApiError } from "../utils/ApiError.js";
import { sendSuccess } from "../utils/apiResponse.js";

const jwtRouter = Router();

jwtRouter.get("/providers", (_req, res) => {
  return sendSuccess(res, {
    emailPassword: true,
    google: env.googleOAuthConfigured,
  });
});

jwtRouter.post("/token", authRateLimiter, async (req, res, next) => {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user?.id) {
      throw new ApiError(
        "Active session required to issue an access token.",
        401,
        { code: "UNAUTHORIZED" }
      );
    }

    const user = await findUserById(session.user.id);
    if (!user) {
      throw new ApiError("Authenticated user no longer exists.", 401, {
        code: "UNAUTHORIZED",
      });
    }

    if (user.isBlocked === true) {
      throw new ApiError(
        "This account is blocked. Contact RupChorcha to restore access.",
        403,
        { code: "USER_BLOCKED" }
      );
    }

    const issued = await signAccessToken(user);

    return sendSuccess(res, {
      ...issued,
      user,
    });
  } catch (error) {
    return next(error);
  }
});

jwtRouter.get("/me", requireAuth, requireNotBlocked, (req, res) => {
  return sendSuccess(res, {
    user: req.user,
    token: {
      sub: req.auth.claims.sub,
      email: req.auth.claims.email,
      role: req.auth.claims.role,
      iss: req.auth.claims.iss,
      aud: req.auth.claims.aud,
      exp: req.auth.claims.exp,
    },
  });
});

jwtRouter.get(
  "/customer-check",
  requireAuth,
  requireNotBlocked,
  requireRole("customer"),
  (req, res) => {
    return sendSuccess(res, {
      message: "Customer access granted.",
      user: req.user,
    });
  }
);

jwtRouter.get(
  "/admin-check",
  requireAuth,
  requireNotBlocked,
  requireRole("admin"),
  (req, res) => {
    return sendSuccess(res, {
      message: "Admin access granted.",
      user: req.user,
    });
  }
);

export { jwtRouter };
