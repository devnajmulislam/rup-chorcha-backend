import { sendSuccess } from "../../utils/apiResponse.js";
import { parseWithSchema } from "../../utils/validation.js";
import { emptyStrictBodySchema } from "../appointments/appointments.validation.js";
import {
  getAdminCustomerById,
  listAdminCustomers,
  setCustomerBlocked,
} from "./users.service.js";
import {
  adminUserIdParamSchema,
  adminUsersQuerySchema,
} from "./users.validation.js";

async function getAdminUsersHandler(req, res, next) {
  try {
    const query = parseWithSchema(adminUsersQuerySchema, req.query, {
      message: "Invalid customer filter query.",
    });

    const result = await listAdminCustomers(query);

    return sendSuccess(res, result.items, { meta: result.meta });
  } catch (error) {
    return next(error);
  }
}

async function getAdminUserByIdHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(adminUserIdParamSchema, req.params, {
      message: "Invalid customer ID.",
      code: "INVALID_USER_ID",
    });

    const customer = await getAdminCustomerById(id);

    return sendSuccess(res, customer);
  } catch (error) {
    return next(error);
  }
}

async function blockAdminUserHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(adminUserIdParamSchema, req.params, {
      message: "Invalid customer ID.",
      code: "INVALID_USER_ID",
    });
    parseWithSchema(emptyStrictBodySchema, req.body, {
      message: "Invalid block request payload.",
    });

    const updated = await setCustomerBlocked({
      userId: id,
      actorId: req.user.id,
      isBlocked: true,
    });

    return sendSuccess(res, updated);
  } catch (error) {
    return next(error);
  }
}

async function unblockAdminUserHandler(req, res, next) {
  try {
    const { id } = parseWithSchema(adminUserIdParamSchema, req.params, {
      message: "Invalid customer ID.",
      code: "INVALID_USER_ID",
    });
    parseWithSchema(emptyStrictBodySchema, req.body, {
      message: "Invalid unblock request payload.",
    });

    const updated = await setCustomerBlocked({
      userId: id,
      actorId: req.user.id,
      isBlocked: false,
    });

    return sendSuccess(res, updated);
  } catch (error) {
    return next(error);
  }
}

export {
  blockAdminUserHandler,
  getAdminUserByIdHandler,
  getAdminUsersHandler,
  unblockAdminUserHandler,
};
