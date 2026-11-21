import { getCollections } from "../../db/mongo.js";
import {
  SAFE_USER_PROJECTION,
  buildUserIdFilter,
  toSafeUser,
} from "../../db/users.js";
import { ApiError } from "../../utils/ApiError.js";

function getOwnProfile(user) {
  return user;
}

async function updateOwnProfile({ userId, updates }) {
  const { users } = getCollections();
  const allowedSet = { updatedAt: new Date() };

  if (updates.name !== undefined) {
    allowedSet.name = updates.name;
  }

  if (updates.phone !== undefined) {
    allowedSet.phone = updates.phone;
  }

  if (updates.image !== undefined) {
    allowedSet.image = updates.image;
  }

  const updated = await users.findOneAndUpdate(
    buildUserIdFilter(userId),
    { $set: allowedSet },
    {
      returnDocument: "after",
      projection: SAFE_USER_PROJECTION,
    }
  );

  if (!updated) {
    throw new ApiError("Authenticated user no longer exists.", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  return toSafeUser(updated);
}

async function updateOwnProfileImage({ userId, imageUrl }) {
  const { users } = getCollections();

  const updated = await users.findOneAndUpdate(
    buildUserIdFilter(userId),
    {
      $set: {
        image: imageUrl,
        updatedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      projection: SAFE_USER_PROJECTION,
    }
  );

  if (!updated) {
    throw new ApiError("Authenticated user no longer exists.", 404, {
      code: "USER_NOT_FOUND",
    });
  }

  return toSafeUser(updated);
}

export { getOwnProfile, updateOwnProfile, updateOwnProfileImage };
