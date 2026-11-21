import { uploadImageToImgBB } from "../../lib/imgbb.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { parseWithSchema } from "../../utils/validation.js";
import {
  getOwnProfile,
  updateOwnProfile,
  updateOwnProfileImage,
} from "./profile.service.js";
import { updateProfileSchema } from "./profile.validation.js";

function createProfileControllers({ uploadImage = uploadImageToImgBB } = {}) {
  async function getProfileHandler(req, res, next) {
    try {
      const profile = getOwnProfile(req.user);

      return sendSuccess(res, profile);
    } catch (error) {
      return next(error);
    }
  }

  async function updateProfileHandler(req, res, next) {
    try {
      const updates = parseWithSchema(updateProfileSchema, req.body, {
        message: "Invalid profile update details.",
      });

      const updated = await updateOwnProfile({
        userId: req.user.id,
        updates,
      });

      return sendSuccess(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async function uploadProfileImageHandler(req, res, next) {
    try {
      const uploaded = await uploadImage(req.file, {
        missingMessage: "Choose a profile image file to upload.",
      });

      const user = await updateOwnProfileImage({
        userId: req.user.id,
        imageUrl: uploaded.url,
      });

      return sendSuccess(res, {
        ...uploaded,
        user,
      });
    } catch (error) {
      return next(error);
    }
  }

  return {
    getProfileHandler,
    updateProfileHandler,
    uploadProfileImageHandler,
  };
}

export { createProfileControllers };
