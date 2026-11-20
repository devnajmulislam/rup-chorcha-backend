import { ObjectId } from "mongodb";

import { getCollections } from "./mongo.js";
import { normalizeRole } from "../utils/password.js";

function buildUserIdFilter(userId) {
  const trimmed = String(userId || "").trim();

  if (!trimmed) {
    return { _id: null };
  }

  return ObjectId.isValid(trimmed)
    ? { $or: [{ _id: new ObjectId(trimmed) }, { id: trimmed }] }
    : { id: trimmed };
}

function toSafeUser(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: typeof doc.id === "string" && doc.id.trim() ? doc.id.trim() : doc._id.toString(),
    name: typeof doc.name === "string" ? doc.name : "",
    email: typeof doc.email === "string" ? doc.email : "",
    image: typeof doc.image === "string" && doc.image.trim() ? doc.image : null,
    phone: typeof doc.phone === "string" && doc.phone.trim() ? doc.phone : null,
    role: normalizeRole(doc.role),
    isBlocked: doc.isBlocked === true,
    emailVerified: Boolean(doc.emailVerified),
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null,
  };
}

async function findUserById(userId) {
  const { users } = getCollections();
  const doc = await users.findOne(buildUserIdFilter(userId));
  return toSafeUser(doc);
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const { users } = getCollections();
  const doc = await users.findOne({ email: normalizedEmail });
  return toSafeUser(doc);
}

export { buildUserIdFilter, findUserByEmail, findUserById, toSafeUser };
