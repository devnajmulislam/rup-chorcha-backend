import { Router } from "express";

import { protect } from "../middleware/auth.js";
import { createProfileControllers } from "../modules/profile/profile.controller.js";

const profileRouter = Router();
const controllers = createProfileControllers();

profileRouter.use(...protect());

profileRouter.get("/", controllers.getProfileHandler);
profileRouter.patch("/", controllers.updateProfileHandler);

export { profileRouter };
