import multer from "multer";

import { ALLOWED_IMAGE_MIME_TYPES } from "../config/constants.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const serviceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadBytes,
    files: 1,
    fields: 20,
  },
  fileFilter(_req, file, callback) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return callback(
        new ApiError("Upload a JPEG, PNG, WebP, or GIF image.", 400, {
          code: "INVALID_IMAGE_TYPE",
        })
      );
    }

    return callback(null, true);
  },
});

const uploadSingleServiceImage = serviceImageUpload.single("image");

function optionalMultipartServiceImage(req, res, next) {
  if (req.is("multipart/form-data")) {
    return uploadSingleServiceImage(req, res, next);
  }

  return next();
}

export { optionalMultipartServiceImage, uploadSingleServiceImage };
