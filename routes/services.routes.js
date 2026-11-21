import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { getServiceAvailabilityHandler } from "../modules/appointments/appointments.controller.js";
import { createServicesControllers } from "../modules/services/services.controller.js";

function createServicesRouter({ uploadImage } = {}) {
  const router = Router();
  const controllers = createServicesControllers({ uploadImage });

  router.get("/", controllers.getPublicServices);
  router.get(
    "/:id/availability",
    ...protect("customer"),
    getServiceAvailabilityHandler
  );
  router.get("/:id", controllers.getPublicServiceByIdHandler);

  return router;
}

const servicesRouter = createServicesRouter();

export { createServicesRouter, servicesRouter };
