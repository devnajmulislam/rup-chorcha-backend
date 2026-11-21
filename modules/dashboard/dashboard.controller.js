import { sendSuccess } from "../../utils/apiResponse.js";
import {
  getAdminDashboard,
  getCustomerDashboard,
} from "./dashboard.service.js";

async function getCustomerDashboardHandler(req, res, next) {
  try {
    const data = await getCustomerDashboard(req.user);

    return sendSuccess(res, data);
  } catch (error) {
    return next(error);
  }
}

async function getAdminDashboardHandler(_req, res, next) {
  try {
    const data = await getAdminDashboard();

    return sendSuccess(res, data);
  } catch (error) {
    return next(error);
  }
}

export { getAdminDashboardHandler, getCustomerDashboardHandler };
