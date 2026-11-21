import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { uploadRateLimiter } from "../middleware/rateLimiter.js";
import { uploadSingleServiceImage } from "../middleware/upload.js";
import { createServicesControllers } from "../modules/services/services.controller.js";

function createAdminUploadsRouter({ uploadImage } = {}) {
  const router = Router();
  const controllers = createServicesControllers({ uploadImage });

  router.post(
    "/service-image",
    ...protect("admin"),
    uploadRateLimiter,
    uploadSingleServiceImage,
    controllers.uploadServiceImageHandler
  );

  return router;
}

const adminUploadsRouter = createAdminUploadsRouter();

export { adminUploadsRouter, createAdminUploadsRouter };
