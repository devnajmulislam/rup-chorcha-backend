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
});

function validateEnv() {
  const missing = [];

  if (!env.mongodbUri) {
    missing.push("MONGODB_URI");
  }

  if (env.isProduction && env.allowedOrigins.length === 0) {
    missing.push("CLIENT_URL");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

export { env, validateEnv };
