import { randomUUID } from "node:crypto";

import { SignJWT, decodeJwt, jwtVerify } from "jose";
import { z } from "zod";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";
import { normalizeRole, userRoleSchema } from "../utils/password.js";

const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: userRoleSchema,
  type: z.literal("access"),
  iss: z.string().min(1),
  aud: z.union([z.string().min(1), z.array(z.string().min(1))]),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().min(1),
});

function getSecretBytes() {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  return new TextEncoder().encode(env.jwtSecret);
}

async function signAccessToken(user, { expiresIn = env.jwtExpiresIn } = {}) {
  if (!user?.id || !user?.email) {
    throw new ApiError("Cannot issue token without user identity.", 500, {
      code: "TOKEN_ISSUE_FAILED",
    });
  }

  const normalizedEmail = String(user.email).trim().toLowerCase();
  const role = normalizeRole(user.role);

  const token = await new SignJWT({
    email: normalizedEmail,
    role,
    type: "access",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(user.id))
    .setIssuer(env.jwtIssuer)
    .setAudience(env.jwtAudience)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecretBytes());

  const decoded = decodeJwt(token);

  return {
    token,
    tokenType: "Bearer",
    expiresIn,
    expiresAt:
      typeof decoded.exp === "number"
        ? new Date(decoded.exp * 1000).toISOString()
        : null,
  };
}

async function verifyAccessToken(token) {
  if (typeof token !== "string" || token.trim().split(".").length !== 3) {
    throw new ApiError("Invalid or malformed access token.", 401, {
      code: "INVALID_TOKEN",
    });
  }

  try {
    const { payload } = await jwtVerify(token.trim(), getSecretBytes(), {
      issuer: env.jwtIssuer,
      audience: env.jwtAudience,
      algorithms: ["HS256"],
    });

    const parsed = jwtClaimsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError("Access token is missing required claims.", 401, {
        code: "INVALID_TOKEN_CLAIMS",
      });
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.code === "ERR_JWT_EXPIRED") {
      throw new ApiError("Access token has expired.", 401, {
        code: "TOKEN_EXPIRED",
      });
    }

    throw new ApiError("Invalid or malformed access token.", 401, {
      code: "INVALID_TOKEN",
    });
  }
}

export { jwtClaimsSchema, signAccessToken, verifyAccessToken };
