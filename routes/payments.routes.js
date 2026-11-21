import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { checkoutRateLimiter } from "../middleware/rateLimiter.js";
import { createPaymentsController } from "../modules/payments/payments.controller.js";

function createPaymentsRouter({ stripeClient } = {}) {
  const router = Router();
  const controller = createPaymentsController({ stripeClient });

  router.post(
    "/checkout",
    checkoutRateLimiter,
    ...protect("customer"),
    controller.createCheckoutSession
  );

  router.get("/session/:sessionId", ...protect(), controller.getPaymentSession);

  return router;
}

const paymentsRouter = createPaymentsRouter();

export { createPaymentsRouter, paymentsRouter };
