import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { createPaymentsController } from "../modules/payments/payments.controller.js";

const adminTransactionsRouter = Router();
const controller = createPaymentsController();

adminTransactionsRouter.use(...protect("admin"));

// Strictly read-only: admins cannot create, update, or delete payment transactions.
adminTransactionsRouter.get("/", controller.getAdminTransactions);

export { adminTransactionsRouter };
