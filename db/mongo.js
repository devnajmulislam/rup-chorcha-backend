import { MongoClient } from "mongodb";

import { env } from "../config/env.js";

let clientInstance = null;
let dbInstance = null;
let connectPromise = null;

async function connectDB() {
  if (dbInstance) {
    return dbInstance;
  }

  if (connectPromise) {
    return connectPromise;
  }

  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  connectPromise = (async () => {
    const client = new MongoClient(env.mongodbUri, {
      serverSelectionTimeoutMS: 10000,
    });

    try {
      await client.connect();
      const db = client.db(env.mongodbDbName);
      await db.command({ ping: 1 });

      clientInstance = client;
      dbInstance = db;
      return db;
    } catch (error) {
      await client.close().catch(() => {});
      throw error;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

function getClient() {
  if (!clientInstance) {
    throw new Error("MongoDB client has not been initialized.");
  }

  return clientInstance;
}

function getDb() {
  if (!dbInstance) {
    throw new Error("MongoDB database has not been initialized.");
  }

  return dbInstance;
}

function getCollections() {
  const db = getDb();

  return {
    users: db.collection("user"),
    sessions: db.collection("session"),
    services: db.collection("services"),
    appointments: db.collection("appointments"),
    transactions: db.collection("transactions"),
  };
}

async function pingDB() {
  const db = getDb();
  await db.command({ ping: 1 });
  return true;
}

async function closeDB() {
  if (!clientInstance) {
    dbInstance = null;
    return;
  }

  const client = clientInstance;
  clientInstance = null;
  dbInstance = null;
  await client.close();
}

export { closeDB, connectDB, getClient, getCollections, getDb, pingDB };
