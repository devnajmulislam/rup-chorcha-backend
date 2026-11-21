import { ObjectId } from "mongodb";

import { getCollections } from "./mongo.js";
import { normalizeRole } from "../utils/password.js";

const SAFE_USER_PROJECTION = Object.freeze({
  _id: 1,
  id: 1,
  name: 1,
  email: 1,
  image: 1,
  phone: 1,
  role: 1,
  isBlocked: 1,
  emailVerified: 1,
  createdAt: 1,
  updatedAt: 1,
});

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildUserIdFilter(userId) {
  const trimmed = String(userId || "").trim();

  if (!trimmed) {
    return { _id: null };
  }

  return ObjectId.isValid(trimmed)
    ? { $or: [{ _id: new ObjectId(trimmed) }, { id: trimmed }] }
    : { id: trimmed };
}

function buildUserCandidateIds(doc, rawId = "") {
  const seenStrings = new Set();
  const seenObjectIds = new Set();
  const candidates = [];

  const addCandidate = (value) => {
    if (value === undefined || value === null) {
      return;
    }

    if (value instanceof ObjectId) {
      const hex = value.toString();
      if (!seenObjectIds.has(hex)) {
        seenObjectIds.add(hex);
        candidates.push(value);
      }
      if (!seenStrings.has(hex)) {
        seenStrings.add(hex);
        candidates.push(hex);
      }
      return;
    }

    const str = String(value).trim();
    if (!str) {
      return;
    }

    if (!seenStrings.has(str)) {
      seenStrings.add(str);
      candidates.push(str);
    }

    if (ObjectId.isValid(str) && !seenObjectIds.has(str)) {
      seenObjectIds.add(str);
      candidates.push(new ObjectId(str));
    }
  };

  if (doc) {
    addCandidate(doc._id);
    addCandidate(doc.id);
  }
  addCandidate(rawId);

  return candidates;
}

function toSafeUser(doc) {
  if (!doc) {
    return null;
  }

  return {
    id:
      typeof doc.id === "string" && doc.id.trim()
        ? doc.id.trim()
        : doc._id.toString(),
    name: typeof doc.name === "string" ? doc.name : "",
    email: typeof doc.email === "string" ? doc.email : "",
    image: typeof doc.image === "string" && doc.image.trim() ? doc.image : null,
    phone: typeof doc.phone === "string" && doc.phone.trim() ? doc.phone : null,
    role: normalizeRole(doc.role),
    isBlocked: doc.isBlocked === true,
    emailVerified: Boolean(doc.emailVerified),
    createdAt: toIsoDate(doc.createdAt),
    updatedAt: toIsoDate(doc.updatedAt),
  };
}

async function findUserById(userId) {
  const { users } = getCollections();
  const doc = await users.findOne(buildUserIdFilter(userId), {
    projection: SAFE_USER_PROJECTION,
  });
  return toSafeUser(doc);
}

async function findUserByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  const { users } = getCollections();
  const doc = await users.findOne(
    { email: normalizedEmail },
    { projection: SAFE_USER_PROJECTION }
  );
  return toSafeUser(doc);
}

export {
  SAFE_USER_PROJECTION,
  buildUserCandidateIds,
  buildUserIdFilter,
  findUserByEmail,
  findUserById,
  toSafeUser,
};
