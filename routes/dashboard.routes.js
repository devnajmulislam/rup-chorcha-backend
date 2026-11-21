import { Router } from "express";

import { protect } from "../middleware/auth.js";
import {
  getAdminDashboardHandler,
  getCustomerDashboardHandler,
} from "../modules/dashboard/dashboard.controller.js";

const dashboardRouter = Router();

dashboardRouter.get(
  "/customer",
  ...protect("customer"),
  getCustomerDashboardHandler
);

dashboardRouter.get("/admin", ...protect("admin"), getAdminDashboardHandler);

export { dashboardRouter };
