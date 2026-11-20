import { createApp } from "./app.js";
import { env, validateEnv } from "./config/env.js";
import { ensureIndexes } from "./db/indexes.js";
import { closeDB, connectDB } from "./db/mongo.js";

let server = null;
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  console.log(`Received ${signal}. Shutting down RupChorcha backend...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  await closeDB().catch(() => {});
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

async function startServer() {
  validateEnv();

  if (env.usedLegacyDbUri) {
    console.warn(
      "[env] Using legacy DB_URI. Prefer MONGODB_URI in your backend .env file."
    );
  }

  const db = await connectDB();
  console.log(`Connected to MongoDB database "${db.databaseName}".`);

  await ensureIndexes(db);
  console.log("Verified MongoDB collection indexes.");

  const app = createApp();
  server = app.listen(env.port, () => {
    console.log(`RupChorcha backend listening on port ${env.port}.`);
  });
}

startServer().catch(async (error) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  console.error(`Backend startup failed: ${message}`);
  await closeDB().catch(() => {});
  process.exit(1);
});
