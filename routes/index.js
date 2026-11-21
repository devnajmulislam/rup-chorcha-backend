import { Router } from "express";

import { adminAppointmentsRouter } from "./admin.appointments.routes.js";
import { createAdminServicesRouter } from "./admin.services.routes.js";
import { createAdminUploadsRouter } from "./admin.uploads.routes.js";
import { adminUsersRouter } from "./admin.users.routes.js";
import { appointmentsRouter } from "./appointments.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";
import { healthRouter } from "./health.routes.js";
import { jwtRouter } from "./jwt.routes.js";
import { profileRouter } from "./profile.routes.js";
import { createServicesRouter } from "./services.routes.js";
import { createUploadsRouter } from "./uploads.routes.js";

function createApiRouter({ uploadImage } = {}) {
  const router = Router();

  router.use("/health", healthRouter);
  router.use("/jwt", jwtRouter);
  router.use("/dashboard", dashboardRouter);
  router.use("/profile", profileRouter);
  router.use("/uploads", createUploadsRouter({ uploadImage }));
  router.use("/services", createServicesRouter({ uploadImage }));
  router.use("/appointments", appointmentsRouter);
  router.use("/admin/appointments", adminAppointmentsRouter);
  router.use("/admin/services", createAdminServicesRouter({ uploadImage }));
  router.use("/admin/uploads", createAdminUploadsRouter({ uploadImage }));
  router.use("/admin/users", adminUsersRouter);

  return router;
}

const apiRouter = createApiRouter();

export { apiRouter, createApiRouter };
