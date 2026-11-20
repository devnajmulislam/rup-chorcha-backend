import "dotenv/config";

function parsePositiveInt(rawValue, fallback, name) {
  if (rawValue === undefined || rawValue.trim() === "") {
    return fallback;
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseAllowedOrigins(rawOrigins, isProduction) {
  if (!rawOrigins || rawOrigins.trim() === "") {
    return isProduction ? [] : ["http://localhost:3000"];
  }

  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  return [...new Set(origins)];
}

const nodeEnv = process.env.NODE_ENV?.trim() || "development";
const isProduction = nodeEnv === "production";
const port = parsePositiveInt(process.env.PORT, 5000, "PORT");

if (port > 65535) {
  throw new Error("PORT must be between 1 and 65535.");
}

const primaryMongoUri = process.env.MONGODB_URI?.trim() || "";
const legacyDbUri = process.env.DB_URI?.trim() || "";
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || "";
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || "";

const env = Object.freeze({
  nodeEnv,
  isProduction,
  port,
  mongodbUri: primaryMongoUri || legacyDbUri,
  usedLegacyDbUri: Boolean(!primaryMongoUri && legacyDbUri),
  mongodbDbName: process.env.MONGODB_DB_NAME?.trim() || "rup-chorcha",
  allowedOrigins: parseAllowedOrigins(process.env.CLIENT_URL, isProduction),
  rateLimitWindowMs: parsePositiveInt(
    process.env.RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    "RATE_LIMIT_WINDOW_MS"
  ),
  rateLimitMax: parsePositiveInt(
    process.env.RATE_LIMIT_MAX,
    200,
    "RATE_LIMIT_MAX"
  ),
  authRateLimitWindowMs: parsePositiveInt(
    process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    15 * 60 * 1000,
    "AUTH_RATE_LIMIT_WINDOW_MS"
  ),
  authRateLimitMax: parsePositiveInt(
    process.env.AUTH_RATE_LIMIT_MAX,
    isProduction ? 60 : 300,
    "AUTH_RATE_LIMIT_MAX"
  ),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET?.trim() || "",
  betterAuthUrl: (
    process.env.BETTER_AUTH_URL?.trim() || `http://localhost:${port}`
  ).replace(/\/+$/, ""),
  jwtSecret: process.env.JWT_SECRET?.trim() || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || "15m",
  jwtIssuer: process.env.JWT_ISSUER?.trim() || "rup-chorcha-api",
  jwtAudience: process.env.JWT_AUDIENCE?.trim() || "rup-chorcha-client",
  googleClientId,
  googleClientSecret,
  googleOAuthConfigured: Boolean(googleClientId && googleClientSecret),
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminName: process.env.ADMIN_NAME?.trim() || "RupChorcha Admin",
});

function validateEnv() {
  const issues = [];

  if (!env.mongodbUri) {
    issues.push("MONGODB_URI");
  }

  if (!env.betterAuthSecret) {
    issues.push("BETTER_AUTH_SECRET");
  } else if (env.betterAuthSecret.length < 32) {
    issues.push("BETTER_AUTH_SECRET (must be at least 32 characters)");
  }

  if (!env.jwtSecret) {
    issues.push("JWT_SECRET");
  } else if (env.jwtSecret.length < 32) {
    issues.push("JWT_SECRET (must be at least 32 characters)");
  }

  if (env.isProduction && env.allowedOrigins.length === 0) {
    issues.push("CLIENT_URL");
  }

  if (env.isProduction && !process.env.BETTER_AUTH_URL?.trim()) {
    issues.push("BETTER_AUTH_URL");
  }

  if (issues.length > 0) {
    throw new Error(
      `Missing or invalid required environment variables: ${issues.join(", ")}`
    );
  }
}

function validateAdminSeedEnv() {
  const issues = [];

  if (!env.mongodbUri) {
    issues.push("MONGODB_URI");
  }

  if (!env.betterAuthSecret) {
    issues.push("BETTER_AUTH_SECRET");
  } else if (env.betterAuthSecret.length < 32) {
    issues.push("BETTER_AUTH_SECRET (must be at least 32 characters)");
  }

  if (!env.adminEmail) {
    issues.push("ADMIN_EMAIL");
  }

  if (!env.adminPassword) {
    issues.push("ADMIN_PASSWORD");
  }

  if (issues.length > 0) {
    throw new Error(
      `Missing or invalid admin seed environment variables: ${issues.join(", ")}`
    );
  }
}

export { env, validateAdminSeedEnv, validateEnv };
