import { Router } from "express";

import { createAdminServicesRouter } from "./admin.services.routes.js";
import { createAdminUploadsRouter } from "./admin.uploads.routes.js";
import { appointmentsRouter } from "./appointments.routes.js";
import { healthRouter } from "./health.routes.js";
import { jwtRouter } from "./jwt.routes.js";
import { createServicesRouter } from "./services.routes.js";

function createApiRouter({ uploadImage } = {}) {
  const router = Router();

  router.use("/health", healthRouter);
  router.use("/jwt", jwtRouter);
  router.use("/services", createServicesRouter({ uploadImage }));
  router.use("/appointments", appointmentsRouter);
  router.use("/admin/services", createAdminServicesRouter({ uploadImage }));
  router.use("/admin/uploads", createAdminUploadsRouter({ uploadImage }));

  return router;
}

const apiRouter = createApiRouter();

export { apiRouter, createApiRouter };
