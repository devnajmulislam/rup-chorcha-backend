import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { optionalMultipartServiceImage } from "../middleware/upload.js";
import { createServicesControllers } from "../modules/services/services.controller.js";

function createAdminServicesRouter({ uploadImage } = {}) {
  const router = Router();
  const controllers = createServicesControllers({ uploadImage });

  router.use(...protect("admin"));

  router.get("/", controllers.getAdminServices);
  router.post(
    "/",
    optionalMultipartServiceImage,
    controllers.createAdminServiceHandler
  );
  router.get("/:id", controllers.getAdminServiceByIdHandler);
  router.put(
    "/:id",
    optionalMultipartServiceImage,
    controllers.updateAdminServiceHandler
  );
  router.patch("/:id/status", controllers.updateAdminServiceStatusHandler);
  router.delete("/:id", controllers.deleteAdminServiceHandler);

  return router;
}

const adminServicesRouter = createAdminServicesRouter();

export { adminServicesRouter, createAdminServicesRouter };
