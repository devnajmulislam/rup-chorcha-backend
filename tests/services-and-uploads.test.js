import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { ObjectId } from "mongodb";

import { createApp } from "../app.js";
import { env, validateEnv } from "../config/env.js";
import { ensureIndexes } from "../db/indexes.js";
import { closeDB, connectDB, getClient, getCollections } from "../db/mongo.js";
import { initAuth } from "../lib/auth.js";
import { uploadImageToImgBB, validateImageFile } from "../lib/imgbb.js";
import { signAccessToken } from "../lib/jwt.js";

const VALID_PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c49444154789c63f8cfc000000301010018dd8db00000000049454e44ae426082",
  "hex"
);
const VALID_JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const VALID_GIF_BYTES = Buffer.from("GIF89a\x01\x00\x01\x00", "ascii");
const VALID_WEBP_BYTES = Buffer.from("RIFF\x12\x00\x00\x00WEBP", "ascii");

const EXISTING_PRESERVED_SERVICE_ID = "6b008bfdeda8c9a56f80bc57";

let server = null;
let baseUrl = "";
let customerToken = "";
let adminToken = "";
let blockedAdminToken = "";
let existingServiceBefore = null;
let uploadBehavior = null;

const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
const createdServiceIds = [];
const createdAppointmentIds = [];
const createdUserFilters = [];

async function apiRequest(
  path,
  { method = "GET", token, jsonBody, formData } = {}
) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body;
  if (jsonBody !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(jsonBody);
  } else if (formData !== undefined) {
    body = formData;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body,
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

function makeFileBlob(buffer, type) {
  return new Blob([buffer], { type });
}

async function createSeedUser({ name, email, role, isBlocked }) {
  const { users } = getCollections();
  const id = `stage2a_${role}_${isBlocked ? "blocked_" : ""}${runSuffix}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();

  const doc = {
    id,
    name,
    email,
    image: null,
    phone: null,
    role,
    isBlocked,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };

  await users.insertOne(doc);
  createdUserFilters.push({ id });

  const { token } = await signAccessToken(doc);
  return { id, doc, token };
}

before(async () => {
  validateEnv();
  const db = await connectDB();
  await ensureIndexes(db);
  const auth = initAuth({ db, client: getClient() });

  const { services } = getCollections();
  if (ObjectId.isValid(EXISTING_PRESERVED_SERVICE_ID)) {
    existingServiceBefore = await services.findOne({
      _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
    });
  }

  const [customer, activeAdmin, blockedAdmin] = await Promise.all([
    createSeedUser({
      name: "Stage 2A Test Customer",
      email: `stage2a.customer.${runSuffix}@example.com`,
      role: "customer",
      isBlocked: false,
    }),
    createSeedUser({
      name: "Stage 2A Test Admin",
      email: `stage2a.admin.${runSuffix}@example.com`,
      role: "admin",
      isBlocked: false,
    }),
    createSeedUser({
      name: "Stage 2A Blocked Admin",
      email: `stage2a.blocked.admin.${runSuffix}@example.com`,
      role: "admin",
      isBlocked: true,
    }),
  ]);

  customerToken = customer.token;
  adminToken = activeAdmin.token;
  blockedAdminToken = blockedAdmin.token;

  uploadBehavior = async (file) => {
    validateImageFile(file);
    return {
      url: `https://i.ibb.co/test-upload-${runSuffix}.png`,
      displayUrl: `https://i.ibb.co/test-upload-${runSuffix}.png`,
      thumbUrl: `https://i.ibb.co/thumb-${runSuffix}.png`,
      width: 800,
      height: 600,
      size: file.size,
      mimeType: file.mimetype,
      provider: "imgbb",
    };
  };

  const app = createApp({
    auth,
    uploadImage: async (file) => uploadBehavior(file),
  });

  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

after(async () => {
  try {
    const { services, appointments, users } = getCollections();

    if (createdAppointmentIds.length > 0) {
      await appointments.deleteMany({
        _id: { $in: createdAppointmentIds.map((id) => new ObjectId(id)) },
      });
    }

    if (createdServiceIds.length > 0) {
      await services.deleteMany({
        _id: { $in: createdServiceIds.map((id) => new ObjectId(id)) },
      });
    }

    if (createdUserFilters.length > 0) {
      await users.deleteMany({ $or: createdUserFilters });
    }

    if (existingServiceBefore) {
      const afterSnapshot = await services.findOne({
        _id: new ObjectId(EXISTING_PRESERVED_SERVICE_ID),
      });
      assert.deepEqual(
        afterSnapshot,
        existingServiceBefore,
        "Pre-existing service document must remain unmodified"
      );
    }
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closeDB().catch(() => {});
  }
});

describe("Step 2A — ImgBB utility validation and error handling", () => {
  test("accepts valid JPEG, PNG, GIF, and WebP magic bytes", () => {
    assert.equal(
      validateImageFile({
        buffer: VALID_PNG_BYTES,
        size: VALID_PNG_BYTES.length,
        mimetype: "image/png",
      }).mimeType,
      "image/png"
    );
    assert.equal(
      validateImageFile({
        buffer: VALID_JPEG_BYTES,
        size: VALID_JPEG_BYTES.length,
        mimetype: "image/jpeg",
      }).mimeType,
      "image/jpeg"
    );
    assert.equal(
      validateImageFile({
        buffer: VALID_GIF_BYTES,
        size: VALID_GIF_BYTES.length,
        mimetype: "image/gif",
      }).mimeType,
      "image/gif"
    );
    assert.equal(
      validateImageFile({
        buffer: VALID_WEBP_BYTES,
        size: VALID_WEBP_BYTES.length,
        mimetype: "image/webp",
      }).mimeType,
      "image/webp"
    );
  });

  test("rejects missing, oversized, invalid MIME, and spoofed files", () => {
    assert.throws(
      () => validateImageFile(null),
      (err) => err.statusCode === 400 && err.code === "IMAGE_REQUIRED"
    );

    assert.throws(
      () =>
        validateImageFile({
          buffer: Buffer.from("hello"),
          size: 5,
          mimetype: "text/plain",
        }),
      (err) => err.statusCode === 400 && err.code === "INVALID_IMAGE_TYPE"
    );

    assert.throws(
      () =>
        validateImageFile({
          buffer: Buffer.from("not actually a png"),
          size: 18,
          mimetype: "image/png",
        }),
      (err) => err.statusCode === 400 && err.code === "INVALID_IMAGE_CONTENT"
    );

    assert.throws(
      () =>
        validateImageFile(
          {
            buffer: VALID_PNG_BYTES,
            size: 1024,
            mimetype: "image/png",
          },
          { maxBytes: 20, maxMb: 1 }
        ),
      (err) => err.statusCode === 413 && err.code === "FILE_TOO_LARGE"
    );
  });

  test("returns 503 when IMGBB_API_KEY is missing", async () => {
    await assert.rejects(
      () =>
        uploadImageToImgBB(
          {
            buffer: VALID_PNG_BYTES,
            size: VALID_PNG_BYTES.length,
            mimetype: "image/png",
          },
          { apiKey: "" }
        ),
      (err) =>
        err.statusCode === 503 && err.code === "IMAGE_UPLOAD_NOT_CONFIGURED"
    );
  });

  test("posts base64 image to ImgBB mock and parses metadata cleanly", async () => {
    let capturedUrl = "";
    let capturedKey = "";
    let capturedBase64 = "";
    let capturedName = "";

    const result = await uploadImageToImgBB(
      {
        buffer: VALID_PNG_BYTES,
        size: VALID_PNG_BYTES.length,
        mimetype: "image/png",
        originalname: "../weird file name!!.png",
      },
      {
        apiKey: "super-secret-imgbb-key",
        fetchImpl: async (url, init) => {
          capturedUrl = url;
          capturedKey = init.body.get("key");
          capturedBase64 = init.body.get("image");
          capturedName = init.body.get("name");
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                display_url: "https://i.ibb.co/demo/salon.png",
                url: "https://i.ibb.co/demo/salon-full.png",
                thumb: { url: "https://i.ibb.co/demo/salon-thumb.png" },
                delete_url: "https://ibb.co/secret-delete-token",
                width: "640",
                height: "480",
                size: 12345,
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        },
      }
    );

    assert.equal(capturedUrl, "https://api.imgbb.com/1/upload");
    assert.equal(capturedKey, "super-secret-imgbb-key");
    assert.equal(capturedBase64, VALID_PNG_BYTES.toString("base64"));
    assert.equal(capturedName, "weird-file-name");
    assert.equal(result.url, "https://i.ibb.co/demo/salon.png");
    assert.equal(result.thumbUrl, "https://i.ibb.co/demo/salon-thumb.png");
    assert.equal(result.width, 640);
    assert.equal(result.height, 480);
    assert.equal(result.size, 12345);
    assert.equal(result.mimeType, "image/png");
    assert.equal(result.provider, "imgbb");
    assert.equal("delete_url" in result, false);
  });

  test("handles ImgBB failures and timeouts safely without leaking secrets", async () => {
    const secretKey = "top-secret-imgbb-credential";

    await assert.rejects(
      () =>
        uploadImageToImgBB(
          {
            buffer: VALID_PNG_BYTES,
            size: VALID_PNG_BYTES.length,
            mimetype: "image/png",
          },
          {
            apiKey: secretKey,
            fetchImpl: async () =>
              new Response(
                JSON.stringify({
                  success: false,
                  error: { message: `Invalid key ${secretKey}` },
                }),
                { status: 400 }
              ),
          }
        ),
      (err) =>
        err.statusCode === 502 &&
        err.code === "IMAGE_UPLOAD_FAILED" &&
        !err.message.includes(secretKey)
    );

    await assert.rejects(
      () =>
        uploadImageToImgBB(
          {
            buffer: VALID_PNG_BYTES,
            size: VALID_PNG_BYTES.length,
            mimetype: "image/png",
          },
          {
            apiKey: secretKey,
            fetchImpl: async () => {
              const abortErr = new Error("Aborted");
              abortErr.name = "AbortError";
              throw abortErr;
            },
          }
        ),
      (err) => err.statusCode === 504 && err.code === "IMAGE_UPLOAD_TIMEOUT"
    );
  });
});

describe("Step 2A — Express Services & Admin Upload HTTP APIs", () => {
  test("enforces auth, role, and blocked-user guards on admin service and upload routes", async () => {
    const unauthList = await apiRequest("/api/admin/services");
    assert.equal(unauthList.status, 401);

    const unauthUpload = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
    });
    assert.equal(unauthUpload.status, 401);

    const customerList = await apiRequest("/api/admin/services", {
      token: customerToken,
    });
    assert.equal(customerList.status, 403);
    assert.equal(customerList.json?.code, "FORBIDDEN");

    const customerCreate = await apiRequest("/api/admin/services", {
      method: "POST",
      token: customerToken,
      jsonBody: {
        serviceName: "Customer Attempt",
        category: "Makeup",
        description: "Not allowed",
        price: 5000,
        duration: 45,
        image: "https://i.ibb.co/demo/cut.png",
      },
    });
    assert.equal(customerCreate.status, 403);
    assert.equal(customerCreate.json?.code, "FORBIDDEN");

    const customerUploadForm = new FormData();
    customerUploadForm.append(
      "image",
      makeFileBlob(VALID_PNG_BYTES, "image/png"),
      "cut.png"
    );
    const customerUpload = await apiRequest(
      "/api/admin/uploads/service-image",
      {
        method: "POST",
        token: customerToken,
        formData: customerUploadForm,
      }
    );
    assert.equal(customerUpload.status, 403);

    const blockedList = await apiRequest("/api/admin/services", {
      token: blockedAdminToken,
    });
    assert.equal(blockedList.status, 403);
    assert.equal(blockedList.json?.code, "USER_BLOCKED");

    const blockedUploadForm = new FormData();
    blockedUploadForm.append(
      "image",
      makeFileBlob(VALID_PNG_BYTES, "image/png"),
      "cut.png"
    );
    const blockedUpload = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: blockedAdminToken,
      formData: blockedUploadForm,
    });
    assert.equal(blockedUpload.status, 403);
    assert.equal(blockedUpload.json?.code, "USER_BLOCKED");
  });

  test("handles valid upload, missing file, invalid type, spoofed image, oversized upload, and ImgBB failure", async () => {
    const validForm = new FormData();
    validForm.append(
      "image",
      makeFileBlob(VALID_PNG_BYTES, "image/png"),
      "salon.png"
    );
    const validRes = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: adminToken,
      formData: validForm,
    });
    assert.equal(validRes.status, 200);
    assert.equal(validRes.json?.success, true);
    assert.match(validRes.json?.data?.url ?? "", /^https:\/\/i\.ibb\.co\//);
    assert.equal(validRes.json?.data?.mimeType, "image/png");

    const emptyRes = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: adminToken,
      formData: new FormData(),
    });
    assert.equal(emptyRes.status, 400);
    assert.equal(emptyRes.json?.code, "IMAGE_REQUIRED");

    const txtForm = new FormData();
    txtForm.append(
      "image",
      makeFileBlob(Buffer.from("plain text"), "text/plain"),
      "notes.txt"
    );
    const txtRes = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: adminToken,
      formData: txtForm,
    });
    assert.equal(txtRes.status, 400);
    assert.equal(txtRes.json?.code, "INVALID_IMAGE_TYPE");

    const spoofForm = new FormData();
    spoofForm.append(
      "image",
      makeFileBlob(Buffer.from("fake png content"), "image/png"),
      "spoof.png"
    );
    const spoofRes = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: adminToken,
      formData: spoofForm,
    });
    assert.equal(spoofRes.status, 400);
    assert.equal(spoofRes.json?.code, "INVALID_IMAGE_CONTENT");

    const oversizedBuf = Buffer.alloc(env.maxUploadBytes + 1024, 0);
    VALID_PNG_BYTES.copy(oversizedBuf, 0);
    const bigForm = new FormData();
    bigForm.append("image", makeFileBlob(oversizedBuf, "image/png"), "big.png");
    const bigRes = await apiRequest("/api/admin/uploads/service-image", {
      method: "POST",
      token: adminToken,
      formData: bigForm,
    });
    assert.equal(bigRes.status, 413);
    assert.equal(bigRes.json?.code, "FILE_TOO_LARGE");

    const previousUploadBehavior = uploadBehavior;
    uploadBehavior = (file) =>
      uploadImageToImgBB(file, {
        apiKey: "secret-leak-guard-key",
        fetchImpl: async () =>
          new Response("upstream failure secret-leak-guard-key", {
            status: 500,
          }),
      });
    try {
      const failForm = new FormData();
      failForm.append(
        "image",
        makeFileBlob(VALID_PNG_BYTES, "image/png"),
        "fail.png"
      );
      const failRes = await apiRequest("/api/admin/uploads/service-image", {
        method: "POST",
        token: adminToken,
        formData: failForm,
      });
      assert.equal(failRes.status, 502);
      assert.equal(failRes.json?.code, "IMAGE_UPLOAD_FAILED");
      assert.equal(failRes.text.includes("secret-leak-guard-key"), false);
    } finally {
      uploadBehavior = previousUploadBehavior;
    }
  });

  test("validates payloads and runs full admin CRUD + public search/filter/sort/pagination + delete/deactivate lifecycle", async () => {
    // 1. Invalid admin creation payloads rejected
    const invalidCreate = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceName: "X",
        category: "Invalid Category",
        description: "",
        price: -50,
        duration: 0,
        image: "http://evil.example.com/bad.jpg",
        unauthorizedField: "nope",
      },
    });
    assert.equal(invalidCreate.status, 400);
    assert.equal(invalidCreate.json?.code, "VALIDATION_ERROR");

    // 2. Seed 4 test services (3 active across 2 categories, 1 inactive)
    const activeCutRes = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceName: `Stage2A Silk Cut ${runSuffix}`,
        category: "Haircut & Styling",
        description: "Precision haircut and finish",
        price: 4500,
        duration: 45,
        image: "https://i.ibb.co/demo/cut.jpg",
      },
    });
    assert.equal(activeCutRes.status, 201);
    assert.equal(activeCutRes.json?.data?.status, "active");
    assert.equal("_id" in activeCutRes.json.data, false);
    const activeCutId = activeCutRes.json.data.id;
    createdServiceIds.push(activeCutId);

    // Duplicate check (409, case-insensitive)
    const duplicateRes = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceName: `stage2a silk cut ${runSuffix}`,
        category: "Haircut & Styling",
        description: "Duplicate name in same category",
        price: 4500,
        duration: 45,
        image: "https://i.ibb.co/demo/cut.jpg",
      },
    });
    assert.equal(duplicateRes.status, 409);
    assert.equal(duplicateRes.json?.code, "DUPLICATE_SERVICE");

    // Multipart service create with uploaded image
    const multipartForm = new FormData();
    multipartForm.append("serviceName", `Stage2A Blossom Glow [VIP] ${runSuffix}`);
    multipartForm.append("category", "Facial & Skincare");
    multipartForm.append("description", "Relaxing facial glow");
    multipartForm.append("price", "9200");
    multipartForm.append("duration", "75");
    multipartForm.append(
      "image",
      makeFileBlob(VALID_PNG_BYTES, "image/png"),
      "facial.png"
    );
    const multipartRes = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      formData: multipartResFormOrThrow(multipartForm),
    });
    assert.equal(multipartRes.status, 201);
    assert.match(multipartRes.json?.data?.image ?? "", /^https:\/\/i\.ibb\.co\//);
    const activeFacialId = multipartRes.json.data.id;
    createdServiceIds.push(activeFacialId);

    const activeSpaRes = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceName: `Stage2A Aroma Spa ${runSuffix}`,
        category: "Spa & Massage",
        description: "Full calming spa ritual",
        price: 2500,
        duration: 60,
        image: "https://i.ibb.co/demo/spa.jpg",
        status: "active",
      },
    });
    assert.equal(activeSpaRes.status, 201);
    const activeSpaId = activeSpaRes.json.data.id;
    createdServiceIds.push(activeSpaId);

    const inactiveHairRes = await apiRequest("/api/admin/services", {
      method: "POST",
      token: adminToken,
      jsonBody: {
        serviceName: `Stage2A Hidden Color ${runSuffix}`,
        category: "Hair Coloring",
        description: "Hidden service",
        price: 15000,
        duration: 120,
        image: "https://i.ibb.co/demo/color.jpg",
        status: "inactive",
      },
    });
    assert.equal(inactiveHairRes.status, 201);
    assert.equal(inactiveHairRes.json?.data?.status, "inactive");
    const inactiveId = inactiveHairRes.json.data.id;
    createdServiceIds.push(inactiveId);

    // 3. Public listing hides inactive and returns valid active items
    const publicAll = await apiRequest(
      `/api/services?search=${encodeURIComponent(`Stage2A`)}&limit=50`
    );
    assert.equal(publicAll.status, 200);
    const publicIds = publicAll.json.data.map((item) => item.id);
    assert.ok(publicIds.includes(activeCutId));
    assert.ok(publicIds.includes(activeFacialId));
    assert.ok(publicIds.includes(activeSpaId));
    assert.equal(publicIds.includes(inactiveId), false);
    assert.ok(publicAll.json.data.every((item) => !("_id" in item)));

    // 4. Regex-safe search
    const escapedSearch = await apiRequest(
      `/api/services?search=${encodeURIComponent(`[VIP] ${runSuffix}`)}`
    );
    assert.equal(escapedSearch.status, 200);
    assert.deepEqual(
      escapedSearch.json.data.map((s) => s.id),
      [activeFacialId]
    );

    // 5. Category filter & invalid category
    const catFilter = await apiRequest(
      `/api/services?search=${encodeURIComponent(runSuffix)}&category=${encodeURIComponent("Haircut & Styling")}`
    );
    assert.equal(catFilter.status, 200);
    assert.deepEqual(
      catFilter.json.data.map((s) => s.id),
      [activeCutId]
    );

    const badCat = await apiRequest("/api/services?category=NotARealCategory");
    assert.equal(badCat.status, 400);
    assert.equal(badCat.json?.code, "VALIDATION_ERROR");

    // 6. Sorting (price_asc & price_desc) & invalid sort
    const sortedAsc = await apiRequest(
      `/api/services?search=${encodeURIComponent(runSuffix)}&sort=price_asc`
    );
    assert.equal(sortedAsc.status, 200);
    assert.deepEqual(
      sortedAsc.json.data.map((s) => s.price),
      [2500, 4500, 9200]
    );

    const sortedDesc = await apiRequest(
      `/api/services?search=${encodeURIComponent(runSuffix)}&sort=price_desc`
    );
    assert.equal(sortedDesc.status, 200);
    assert.deepEqual(
      sortedDesc.json.data.map((s) => s.price),
      [9200, 4500, 2500]
    );

    const badSort = await apiRequest("/api/services?sort=price_sideways");
    assert.equal(badSort.status, 400);

    // 7. Pagination & invalid query limits
    const page1 = await apiRequest(
      `/api/services?search=${encodeURIComponent(runSuffix)}&sort=price_asc&page=1&limit=2`
    );
    assert.equal(page1.status, 200);
    assert.equal(page1.json.data.length, 2);
    assert.equal(page1.json.meta.total, 3);
    assert.equal(page1.json.meta.totalPages, 2);
    assert.equal(page1.json.meta.hasNextPage, true);
    assert.equal(page1.json.meta.hasPrevPage, false);

    const page2 = await apiRequest(
      `/api/services?search=${encodeURIComponent(runSuffix)}&sort=price_asc&page=2&limit=2`
    );
    assert.equal(page2.status, 200);
    assert.equal(page2.json.data.length, 1);
    assert.equal(page2.json.meta.hasNextPage, false);
    assert.equal(page2.json.meta.hasPrevPage, true);
    assert.notEqual(page2.json.data[0].id, page1.json.data[0].id);

    const badPage = await apiRequest("/api/services?page=0");
    assert.equal(badPage.status, 400);

    // 8. Public GET /:id edge cases
    const activeDetail = await apiRequest(`/api/services/${activeCutId}`);
    assert.equal(activeDetail.status, 200);
    assert.equal(activeDetail.json.data.id, activeCutId);

    const inactivePublicDetail = await apiRequest(`/api/services/${inactiveId}`);
    assert.equal(inactivePublicDetail.status, 404);
    assert.equal(inactivePublicDetail.json?.code, "SERVICE_NOT_FOUND");

    const badId12Char = await apiRequest("/api/services/123456789012");
    assert.equal(badId12Char.status, 400);
    assert.equal(badId12Char.json?.code, "INVALID_SERVICE_ID");

    const missingId = await apiRequest("/api/services/000000000000000000000000");
    assert.equal(missingId.status, 404);
    assert.equal(missingId.json?.code, "SERVICE_NOT_FOUND");

    // 9. Admin GET all/inactive + GET /:id + PUT /:id + PATCH status
    const adminList = await apiRequest(
      `/api/admin/services?search=${encodeURIComponent(runSuffix)}&status=inactive`,
      { token: adminToken }
    );
    assert.equal(adminList.status, 200);
    assert.deepEqual(
      adminList.json.data.map((s) => s.id),
      [inactiveId]
    );

    const adminInactiveDetail = await apiRequest(
      `/api/admin/services/${inactiveId}`,
      { token: adminToken }
    );
    assert.equal(adminInactiveDetail.status, 200);
    assert.equal(adminInactiveDetail.json.data.status, "inactive");

    const updatedCut = await apiRequest(`/api/admin/services/${activeCutId}`, {
      method: "PUT",
      token: adminToken,
      jsonBody: {
        serviceName: `Stage2A Silk Cut Updated ${runSuffix}`,
        category: "Haircut & Styling",
        description: "Updated precision cut",
        price: 5200,
        duration: 50,
      },
    });
    assert.equal(updatedCut.status, 200);
    assert.equal(updatedCut.json.data.price, 5200);
    assert.equal(updatedCut.json.data.image, "https://i.ibb.co/demo/cut.jpg");

    const toggleStatus = await apiRequest(
      `/api/admin/services/${activeCutId}/status`,
      {
        method: "PATCH",
        token: adminToken,
        jsonBody: { status: "inactive" },
      }
    );
    assert.equal(toggleStatus.status, 200);
    assert.equal(toggleStatus.json.data.status, "inactive");

    const hiddenAfterToggle = await apiRequest(`/api/services/${activeCutId}`);
    assert.equal(hiddenAfterToggle.status, 404);

    // 10. Hard delete unreferenced service vs soft-deactivate referenced service
    const hardDeleteRes = await apiRequest(
      `/api/admin/services/${activeSpaId}`,
      {
        method: "DELETE",
        token: adminToken,
      }
    );
    assert.equal(hardDeleteRes.status, 200);
    assert.equal(hardDeleteRes.json.data.action, "deleted");

    const afterHardDelete = await apiRequest(
      `/api/admin/services/${activeSpaId}`,
      { token: adminToken }
    );
    assert.equal(afterHardDelete.status, 404);

    const { appointments } = getCollections();
    const apptInsert = await appointments.insertOne({
      serviceId: new ObjectId(activeFacialId),
      customerId: `stage2a_ref_${runSuffix}`,
      appointmentDate: new Date(),
      timeSlot: "10:00",
      message: "Temporary Step 2A reference check",
      servicePrice: 9200,
      paymentStatus: "unpaid",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    createdAppointmentIds.push(apptInsert.insertedId.toString());

    const softDeleteRes = await apiRequest(
      `/api/admin/services/${activeFacialId}`,
      {
        method: "DELETE",
        token: adminToken,
      }
    );
    assert.equal(softDeleteRes.status, 200);
    assert.equal(softDeleteRes.json.data.action, "deactivated");
    assert.equal(softDeleteRes.json.data.service.status, "inactive");

    const hiddenAfterDeactivate = await apiRequest(
      `/api/services/${activeFacialId}`
    );
    assert.equal(hiddenAfterDeactivate.status, 404);
  });
});

function multipartResFormOrThrow(form) {
  return form;
}
