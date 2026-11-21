import { uploadImageToImgBB, validateImageFile } from "../../lib/imgbb.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import { parseWithSchema } from "../../utils/validation.js";
import {
  createAdminService,
  deleteAdminService,
  getAdminServiceById,
  getPublicServiceById,
  listAdminServices,
  listPublicServices,
  updateAdminService,
  updateAdminServiceStatus,
} from "./services.service.js";
import {
  adminServicesQuerySchema,
  createServiceSchema,
  normalizeMultipartServiceBody,
  publicServicesQuerySchema,
  serviceIdParamSchema,
  updateServiceSchema,
  updateServiceStatusSchema,
} from "./services.validation.js";

const PRECHECK_IMAGE_URL = "https://i.ibb.co/precheck-placeholder.png";

function extractServiceBody(req) {
  return req.is("multipart/form-data")
    ? normalizeMultipartServiceBody(req.body)
    : req.body;
}

function createServicesControllers({ uploadImage = uploadImageToImgBB } = {}) {
  async function getPublicServices(req, res, next) {
    try {
      const query = parseWithSchema(publicServicesQuerySchema, req.query, {
        message: "Invalid service query parameters.",
      });
      const result = await listPublicServices(query);

      return sendSuccess(res, result.items, {
        meta: result.meta,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getPublicServiceByIdHandler(req, res, next) {
    try {
      const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
        message: "Invalid service ID.",
        code: "INVALID_SERVICE_ID",
      });
      const service = await getPublicServiceById(id);

      return sendSuccess(res, service);
    } catch (error) {
      return next(error);
    }
  }

  async function getAdminServices(req, res, next) {
    try {
      const query = parseWithSchema(adminServicesQuerySchema, req.query, {
        message: "Invalid admin service query parameters.",
      });
      const result = await listAdminServices(query);

      return sendSuccess(res, result.items, {
        meta: result.meta,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getAdminServiceByIdHandler(req, res, next) {
    try {
      const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
        message: "Invalid service ID.",
        code: "INVALID_SERVICE_ID",
      });
      const service = await getAdminServiceById(id);

      return sendSuccess(res, service);
    } catch (error) {
      return next(error);
    }
  }

  async function createAdminServiceHandler(req, res, next) {
    try {
      const rawBody = extractServiceBody(req);

      let payload;
      if (req.file) {
        validateImageFile(req.file);
        parseWithSchema(
          createServiceSchema,
          { ...rawBody, image: PRECHECK_IMAGE_URL },
          { message: "Invalid service details." }
        );
        const uploaded = await uploadImage(req.file);
        payload = parseWithSchema(
          createServiceSchema,
          { ...rawBody, image: uploaded.url },
          { message: "Invalid service details." }
        );
      } else {
        payload = parseWithSchema(createServiceSchema, rawBody, {
          message: "Invalid service details.",
        });
      }

      const created = await createAdminService(payload);

      return sendSuccess(res, created, { statusCode: 201 });
    } catch (error) {
      return next(error);
    }
  }

  async function updateAdminServiceHandler(req, res, next) {
    try {
      const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
        message: "Invalid service ID.",
        code: "INVALID_SERVICE_ID",
      });
      const rawBody = extractServiceBody(req);

      let payload;
      if (req.file) {
        await getAdminServiceById(id);
        validateImageFile(req.file);
        parseWithSchema(
          updateServiceSchema,
          { ...rawBody, image: PRECHECK_IMAGE_URL },
          { message: "Invalid service update details." }
        );
        const uploaded = await uploadImage(req.file);
        payload = parseWithSchema(
          updateServiceSchema,
          { ...rawBody, image: uploaded.url },
          { message: "Invalid service update details." }
        );
      } else {
        payload = parseWithSchema(updateServiceSchema, rawBody, {
          message: "Invalid service update details.",
        });
      }

      const updated = await updateAdminService(id, payload);

      return sendSuccess(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async function updateAdminServiceStatusHandler(req, res, next) {
    try {
      const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
        message: "Invalid service ID.",
        code: "INVALID_SERVICE_ID",
      });
      const { status } = parseWithSchema(
        updateServiceStatusSchema,
        req.body,
        { message: "Invalid service status payload." }
      );
      const updated = await updateAdminServiceStatus(id, status);

      return sendSuccess(res, updated);
    } catch (error) {
      return next(error);
    }
  }

  async function deleteAdminServiceHandler(req, res, next) {
    try {
      const { id } = parseWithSchema(serviceIdParamSchema, req.params, {
        message: "Invalid service ID.",
        code: "INVALID_SERVICE_ID",
      });
      const outcome = await deleteAdminService(id);

      return sendSuccess(res, outcome);
    } catch (error) {
      return next(error);
    }
  }

  async function uploadServiceImageHandler(req, res, next) {
    try {
      const uploaded = await uploadImage(req.file);

      return sendSuccess(res, uploaded);
    } catch (error) {
      return next(error);
    }
  }

  return {
    createAdminServiceHandler,
    deleteAdminServiceHandler,
    getAdminServiceByIdHandler,
    getAdminServices,
    getPublicServiceByIdHandler,
    getPublicServices,
    updateAdminServiceHandler,
    updateAdminServiceStatusHandler,
    uploadServiceImageHandler,
  };
}

export { createServicesControllers };
