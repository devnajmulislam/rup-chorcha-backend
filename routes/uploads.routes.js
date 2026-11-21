import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { uploadRateLimiter } from "../middleware/rateLimiter.js";
import { uploadSingleProfileImage } from "../middleware/upload.js";
import { createProfileControllers } from "../modules/profile/profile.controller.js";

function createUploadsRouter({ uploadImage } = {}) {
  const router = Router();
  const controllers = createProfileControllers({ uploadImage });

  router.post(
    "/profile-image",
    ...protect(),
    uploadRateLimiter,
    uploadSingleProfileImage,
    controllers.uploadProfileImageHandler
  );

  return router;
}

const uploadsRouter = createUploadsRouter();

export { createUploadsRouter, uploadsRouter };
