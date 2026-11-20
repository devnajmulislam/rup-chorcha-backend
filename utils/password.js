import { z } from "zod";

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;

const passwordSchema = z
  .string({ error: "Password is required." })
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
  )
  .max(
    MAX_PASSWORD_LENGTH,
    `Password must be at most ${MAX_PASSWORD_LENGTH} characters long.`
  )
  .regex(/[A-Z]/, "Password must include at least one uppercase letter.")
  .regex(/[a-z]/, "Password must include at least one lowercase letter.");

const userRoleSchema = z.enum(["customer", "admin"]);

function validatePasswordStrength(password) {
  const result = passwordSchema.safeParse(password);

  if (result.success) {
    return { valid: true };
  }

  return {
    valid: false,
    message:
      result.error.issues[0]?.message || "Password does not meet requirements.",
  };
}

function normalizeRole(role) {
  return role === "admin" ? "admin" : "customer";
}

export {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  normalizeRole,
  passwordSchema,
  userRoleSchema,
  validatePasswordStrength,
};
