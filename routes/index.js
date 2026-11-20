import { Router } from "express";

import { healthRouter } from "./health.routes.js";
import { jwtRouter } from "./jwt.routes.js";

const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/jwt", jwtRouter);

export { apiRouter };
