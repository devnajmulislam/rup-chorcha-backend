import { ObjectId } from "mongodb";
import { z } from "zod";

import { env, validateAdminSeedEnv } from "../config/env.js";
import { closeDB, connectDB, getClient, getCollections } from "../db/mongo.js";
import { buildUserIdFilter, findUserByEmail } from "../db/users.js";
import { initAuth } from "../lib/auth.js";
import { validatePasswordStrength } from "../utils/password.js";

async function seedAdmin() {
  validateAdminSeedEnv();

  const emailCheck = z.string().email().safeParse(env.adminEmail);
  if (!emailCheck.success) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }

  const passwordCheck = validatePasswordStrength(env.adminPassword);
  if (!passwordCheck.valid) {
    throw new Error(`ADMIN_PASSWORD is invalid: ${passwordCheck.message}`);
  }

  const db = await connectDB();
  const auth = initAuth({ db, client: getClient() });
  const { users } = getCollections();

  const existing = await findUserByEmail(env.adminEmail);

  if (existing) {
    if (existing.role === "admin") {
      if (existing.isBlocked) {
        await users.updateOne(buildUserIdFilter(existing.id), {
          $set: { isBlocked: false, updatedAt: new Date() },
        });
      }
      console.log(
        `Admin account already exists for ${env.adminEmail}. Skipping creation.`
      );
      return;
    }

    if (process.env.SEED_ADMIN_PROMOTE !== "true") {
      throw new Error(
        `A non-admin account already exists for ${env.adminEmail}. Refusing to overwrite role unless SEED_ADMIN_PROMOTE=true.`
      );
    }

    await users.updateOne(buildUserIdFilter(existing.id), {
      $set: { role: "admin", isBlocked: false, updatedAt: new Date() },
    });
    console.log(
      `Existing account promoted to admin for ${env.adminEmail}.`
    );
    return;
  }

  const created = await auth.api.signUpEmail({
    body: {
      name: env.adminName,
      email: env.adminEmail,
      password: env.adminPassword,
    },
  });

  if (!created?.user?.id) {
    throw new Error("Better Auth did not return a created admin user.");
  }

  const userFilter = buildUserIdFilter(created.user.id);
  await users.updateOne(userFilter, {
    $set: { role: "admin", isBlocked: false, updatedAt: new Date() },
  });

  // Clean up any auto-created session (Better Auth MongoDB adapter stores ObjectId userId).
  const sessionUserIds = ObjectId.isValid(created.user.id)
    ? [created.user.id, new ObjectId(created.user.id)]
    : [created.user.id];
  await db.collection("session").deleteMany({ userId: { $in: sessionUserIds } });

  console.log(`Admin account seeded successfully for ${env.adminEmail}.`);
}

seedAdmin()
  .catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Admin seed failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDB().catch(() => {});
  });
