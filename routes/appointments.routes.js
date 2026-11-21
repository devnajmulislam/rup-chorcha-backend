import { Router } from "express";

import { protect } from "../middleware/auth.js";
import {
  cancelMyAppointmentHandler,
  createAppointmentHandler,
  getMyAppointmentByIdHandler,
  getMyAppointmentsHandler,
} from "../modules/appointments/appointments.controller.js";

const appointmentsRouter = Router();

appointmentsRouter.use(...protect("customer"));

appointmentsRouter.post("/", createAppointmentHandler);
appointmentsRouter.get("/my", getMyAppointmentsHandler);
appointmentsRouter.get("/my/:id", getMyAppointmentByIdHandler);
appointmentsRouter.patch("/my/:id/cancel", cancelMyAppointmentHandler);

export { appointmentsRouter };
