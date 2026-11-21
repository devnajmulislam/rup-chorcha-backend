import { Router } from "express";

import { createServicesControllers } from "../modules/services/services.controller.js";

function createServicesRouter({ uploadImage } = {}) {
  const router = Router();
  const controllers = createServicesControllers({ uploadImage });

  router.get("/", controllers.getPublicServices);
  router.get("/:id", controllers.getPublicServiceByIdHandler);

  return router;
}

const servicesRouter = createServicesRouter();

export { createServicesRouter, servicesRouter };
