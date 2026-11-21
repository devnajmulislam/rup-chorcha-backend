import { Router } from "express";

import { protect } from "../middleware/auth.js";
import {
  blockAdminUserHandler,
  getAdminUserByIdHandler,
  getAdminUsersHandler,
  unblockAdminUserHandler,
} from "../modules/users/users.controller.js";

const adminUsersRouter = Router();

adminUsersRouter.use(...protect("admin"));

adminUsersRouter.get("/", getAdminUsersHandler);
adminUsersRouter.get("/:id", getAdminUserByIdHandler);
adminUsersRouter.patch("/:id/block", blockAdminUserHandler);
adminUsersRouter.patch("/:id/unblock", unblockAdminUserHandler);

export { adminUsersRouter };
