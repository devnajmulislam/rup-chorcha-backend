import { Router } from "express";

import { protect } from "../middleware/auth.js";
import {
  cancelAdminAppointmentHandler,
  confirmAdminAppointmentHandler,
  getAdminAppointmentByIdHandler,
  getAdminAppointmentsHandler,
  updateAdminAppointmentStatusHandler,
} from "../modules/appointments/appointments.controller.js";

const adminAppointmentsRouter = Router();

adminAppointmentsRouter.use(...protect("admin"));

adminAppointmentsRouter.get("/", getAdminAppointmentsHandler);
adminAppointmentsRouter.get("/:id", getAdminAppointmentByIdHandler);
adminAppointmentsRouter.patch("/:id/confirm", confirmAdminAppointmentHandler);
adminAppointmentsRouter.patch("/:id/cancel", cancelAdminAppointmentHandler);
adminAppointmentsRouter.patch("/:id/status", updateAdminAppointmentStatusHandler);

export { adminAppointmentsRouter };
