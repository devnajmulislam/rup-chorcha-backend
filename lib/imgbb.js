import path from "node:path";

import { ALLOWED_IMAGE_MIME_TYPES } from "../config/constants.js";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";
const DEFAULT_IMGBB_TIMEOUT_MS = 15_000;

function detectImageMimeFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) &&
    buffer[5] === 0x61
  ) {
    return "image/gif";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function validateImageFile(
  file,
  { maxBytes = env.maxUploadBytes, maxMb = env.maxUploadMb } = {}
) {
  if (
    !file ||
    !Buffer.isBuffer(file.buffer) ||
    file.size === 0 ||
    file.buffer.length === 0
  ) {
    throw new ApiError("Choose a service image file to upload.", 400, {
      code: "IMAGE_REQUIRED",
    });
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
    throw new ApiError("Upload a JPEG, PNG, WebP, or GIF image.", 400, {
      code: "INVALID_IMAGE_TYPE",
    });
  }

  const byteSize = Math.max(file.size ?? 0, file.buffer.length);
  if (byteSize > maxBytes) {
    throw new ApiError(`Image size must be ${maxMb} MB or smaller.`, 413, {
      code: "FILE_TOO_LARGE",
    });
  }

  const detectedMime = detectImageMimeFromBuffer(file.buffer);
  if (!detectedMime || detectedMime !== file.mimetype) {
    throw new ApiError(
      "Uploaded file content does not match a valid JPEG, PNG, WebP, or GIF image.",
      400,
      { code: "INVALID_IMAGE_CONTENT" }
    );
  }

  return {
    mimeType: detectedMime,
    size: file.buffer.length,
  };
}

function sanitizeUploadNameStem(originalname) {
  if (typeof originalname !== "string" || !originalname.trim()) {
    return "";
  }

  const stem = path.basename(originalname, path.extname(originalname));
  return stem
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function isValidHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

async function uploadImageToImgBB(
  file,
  {
    apiKey = env.imgbbApiKey,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_IMGBB_TIMEOUT_MS,
    maxBytes = env.maxUploadBytes,
    maxMb = env.maxUploadMb,
  } = {}
) {
  const { mimeType, size } = validateImageFile(file, { maxBytes, maxMb });

  if (!apiKey) {
    throw new ApiError(
      "Image upload service is not configured on the server.",
      503,
      { code: "IMAGE_UPLOAD_NOT_CONFIGURED" }
    );
  }

  const formData = new FormData();
  formData.append("key", apiKey);
  formData.append("image", file.buffer.toString("base64"));

  const sanitizedName = sanitizeUploadNameStem(file.originalname);
  if (sanitizedName) {
    formData.append("name", sanitizedName);
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(IMGBB_UPLOAD_URL, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("Image upload timed out. Please try again.", 504, {
        code: "IMAGE_UPLOAD_TIMEOUT",
      });
    }

    throw new ApiError(
      "Could not reach the image hosting provider right now. Please try again.",
      502,
      { code: "IMAGE_UPLOAD_FAILED" }
    );
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = await response.json().catch(() => null);
  const displayUrl = payload?.data?.display_url?.trim() || "";
  const rawUrl = payload?.data?.url?.trim() || "";
  const uploadedUrl = displayUrl || rawUrl;

  if (!response.ok || !payload?.success || !isValidHttpsUrl(uploadedUrl)) {
    throw new ApiError(
      "Could not store the image right now. Please try again.",
      502,
      { code: "IMAGE_UPLOAD_FAILED" }
    );
  }

  const thumbUrlRaw = payload?.data?.thumb?.url?.trim() || "";
  const widthNum = Number(payload?.data?.width);
  const heightNum = Number(payload?.data?.height);
  const sizeNum = Number(payload?.data?.size);

  return {
    url: uploadedUrl,
    displayUrl: isValidHttpsUrl(displayUrl) ? displayUrl : uploadedUrl,
    thumbUrl: isValidHttpsUrl(thumbUrlRaw) ? thumbUrlRaw : null,
    width: Number.isFinite(widthNum) && widthNum > 0 ? widthNum : null,
    height: Number.isFinite(heightNum) && heightNum > 0 ? heightNum : null,
    size: Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : size,
    mimeType,
    provider: "imgbb",
  };
}

export {
  detectImageMimeFromBuffer,
  uploadImageToImgBB,
  validateImageFile,
};
