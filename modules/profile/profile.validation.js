import { z } from "zod";

import {
  MAX_PROFILE_IMAGE_URL_LENGTH,
  MAX_PROFILE_NAME_LENGTH,
  PHONE_PATTERN,
} from "../../config/constants.js";

function isSafeHttpUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PROFILE_IMAGE_URL_LENGTH) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const updateProfileSchema = z
  .object({
    name: z
      .string({ error: "Full name must be text." })
      .trim()
      .min(1, "Enter your full name.")
      .max(
        MAX_PROFILE_NAME_LENGTH,
        `Keep your name under ${MAX_PROFILE_NAME_LENGTH} characters.`
      )
      .optional(),
    phone: z
      .union([z.string({ error: "Phone number must be text." }), z.null()])
      .optional()
      .transform((val) => {
        if (val === undefined) {
          return undefined;
        }
        if (val === null) {
          return null;
        }
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      })
      .refine(
        (val) => val === undefined || val === null || PHONE_PATTERN.test(val),
        "Enter a valid phone number with 6 to 20 digits."
      ),
    image: z
      .union([
        z.string({ error: "Profile image URL must be text." }),
        z.null(),
      ])
      .optional()
      .transform((val) => {
        if (val === undefined) {
          return undefined;
        }
        if (val === null) {
          return null;
        }
        const trimmed = val.trim();
        return trimmed === "" ? null : trimmed;
      })
      .refine(
        (val) => val === undefined || val === null || isSafeHttpUrl(val),
        "Enter a valid image URL starting with http:// or https://."
      ),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.phone !== undefined ||
      data.image !== undefined,
    { message: "Provide at least one profile field to update." }
  );

export { isSafeHttpUrl, updateProfileSchema };
