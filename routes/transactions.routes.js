import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { createPaymentsController } from "../modules/payments/payments.controller.js";

const transactionsRouter = Router();
const controller = createPaymentsController();

transactionsRouter.use(...protect("customer"));

transactionsRouter.get("/my", controller.getMyTransactions);

export { transactionsRouter };
