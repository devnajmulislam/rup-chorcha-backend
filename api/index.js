import { createApp } from "../app.js";
import { validateEnv } from "../config/env.js";
import { ensureIndexes } from "../db/indexes.js";
import { connectDB, getClient } from "../db/mongo.js";
import { initAuth } from "../lib/auth.js";

let cachedApp = null;
let initPromise = null;

async function getExpressApp() {
  if (cachedApp) {
    return cachedApp;
  }

  if (!initPromise) {
    initPromise = (async () => {
      validateEnv();
      const db = await connectDB();
      await ensureIndexes(db);
      const auth = initAuth({ db, client: getClient() });
      cachedApp = createApp({ auth });
      return cachedApp;
    })().catch((error) => {
      initPromise = null;
      cachedApp = null;
      throw error;
    });
  }

  return initPromise;
}

export default async function handler(req, res) {
  const app = await getExpressApp();
  return app(req, res);
}
