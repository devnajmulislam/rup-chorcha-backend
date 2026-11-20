import { mongodbAdapter } from "@better-auth/mongo-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

import { env } from "../config/env.js";
import { buildUserIdFilter } from "../db/users.js";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  validatePasswordStrength,
} from "../utils/password.js";

let authInstance = null;

function buildSocialProviders() {
  if (!env.googleOAuthConfigured) {
    return {};
  }

  return {
    google: {
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret,
    },
  };
}

function initAuth({ db, client }) {
  if (authInstance) {
    return authInstance;
  }

  if (!env.betterAuthSecret) {
    throw new Error("BETTER_AUTH_SECRET is not configured.");
  }

  const trustedOrigins = [
    ...new Set([env.betterAuthUrl, ...env.allowedOrigins]),
  ];

  authInstance = betterAuth({
    appName: "RupChorcha",
    baseURL: env.betterAuthUrl,
    basePath: "/api/auth",
    secret: env.betterAuthSecret,
    trustedOrigins,
    database: mongodbAdapter(db, { client }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    socialProviders: buildSocialProviders(),
    user: {
      additionalFields: {
        role: {
          type: ["customer", "admin"],
          required: false,
          defaultValue: "customer",
          input: false,
        },
        isBlocked: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        phone: {
          type: "string",
          required: false,
          input: true,
        },
      },
    },
    advanced: {
      useSecureCookies: env.isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.isProduction,
        path: "/",
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          const check = validatePasswordStrength(ctx.body?.password);
          if (!check.valid) {
            throw new APIError("BAD_REQUEST", {
              code: "WEAK_PASSWORD",
              message: check.message,
            });
          }
        }

        if (
          ctx.path === "/change-password" ||
          ctx.path === "/reset-password"
        ) {
          const check = validatePasswordStrength(ctx.body?.newPassword);
          if (!check.valid) {
            throw new APIError("BAD_REQUEST", {
              code: "WEAK_PASSWORD",
              message: check.message,
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Force customer role and active access on every created account;
            // admins can only be provisioned via scripts/seed-admin.js.
            return {
              data: {
                ...user,
                role: "customer",
                isBlocked: false,
              },
            };
          },
        },
        update: {
          before: async (user) => {
            const safe = { ...user };
            delete safe.role;
            delete safe.isBlocked;
            return { data: safe };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const existingUser = await db
              .collection("user")
              .findOne(buildUserIdFilter(session.userId), {
                projection: { isBlocked: 1 },
              });

            if (existingUser?.isBlocked === true) {
              throw new APIError("FORBIDDEN", {
                code: "USER_BLOCKED",
                message:
                  "This account is blocked. Contact RupChorcha to restore access.",
              });
            }
          },
        },
      },
    },
  });

  return authInstance;
}

function getAuth() {
  if (!authInstance) {
    throw new Error("Better Auth has not been initialized.");
  }

  return authInstance;
}

export { getAuth, initAuth };
