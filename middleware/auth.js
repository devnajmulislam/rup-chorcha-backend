import { findUserById } from "../db/users.js";
import { verifyAccessToken } from "../lib/jwt.js";
import { ApiError } from "../utils/ApiError.js";

function extractBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") {
    return null;
  }

  const match = authorizationHeader.trim().match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

async function requireAuth(req, _res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return next(
        new ApiError("Authentication required.", 401, {
          code: "UNAUTHORIZED",
        })
      );
    }

    const claims = await verifyAccessToken(token);
    const user = await findUserById(claims.sub);

    if (!user) {
      return next(
        new ApiError("Authenticated user no longer exists.", 401, {
          code: "UNAUTHORIZED",
        })
      );
    }

    if (
      user.id !== claims.sub ||
      user.email.trim().toLowerCase() !== claims.email.trim().toLowerCase()
    ) {
      return next(
        new ApiError("Token identity does not match authenticated user.", 401, {
          code: "TOKEN_IDENTITY_MISMATCH",
        })
      );
    }

    req.user = user;
    req.auth = { claims, token };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireNotBlocked(req, _res, next) {
  if (!req.user) {
    return next(
      new ApiError("Authentication required.", 401, {
        code: "UNAUTHORIZED",
      })
    );
  }

  if (req.user.isBlocked === true) {
    return next(
      new ApiError(
        "This account is blocked. Contact RupChorcha to restore access.",
        403,
        { code: "USER_BLOCKED" }
      )
    );
  }

  return next();
}

function requireRole(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(
        new ApiError("Authentication required.", 401, {
          code: "UNAUTHORIZED",
        })
      );
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError("You do not have permission to access this resource.", 403, {
          code: "FORBIDDEN",
        })
      );
    }

    return next();
  };
}

function protect(...allowedRoles) {
  return allowedRoles.length > 0
    ? [requireAuth, requireNotBlocked, requireRole(...allowedRoles)]
    : [requireAuth, requireNotBlocked];
}

export { protect, requireAuth, requireNotBlocked, requireRole };
