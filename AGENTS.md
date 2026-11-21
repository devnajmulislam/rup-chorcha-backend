# RupChorcha Backend — AGENTS.md

> Single source of truth for the Express REST API backend repository (`rup-chorcha-backend`).
> Brand rule: always use **RupChorcha** (`Beauty, Elegance & Confidence`) across all user-facing strings, seeds, metadata, and docs — never `SalonBook`.

---

## 1. Permanent Project Rules & Constraints

- **Separate repositories:** Keep `rup-chorcha-backend` (Express REST API) separate from `rup-chorcha` (Next.js App Router client + same-origin BFF). Never merge them into a monorepo.
- **Database & driver:** Use the native `mongodb` driver (`mongodb` `^7.9.0`) targeting database `rup-chorcha`. Do **not** add Mongoose. Preserve Better Auth's `user`/`session`/`account`/`verification` collections and `customerId` string compatibility.
- **Currency & timezone:** Store all money (`services.price`, future `appointments.servicePrice`, `transactions.amount`) as **integer USD cents**. Never accept client-supplied prices for bookings/payments. Salon dates/slots validate in `Asia/Dhaka` and store in UTC.
- **Authentication & authorization architecture:** Better Auth mounted at `/api/auth/*splat` + Express `jose` HS256 JWT bridge (`/api/jwt/*`) + Express middleware (`requireAuth`, `requireNotBlocked`, `requireRole`, `protect`). Do not introduce a duplicate auth system.
- **Security invariants:**
  - Public sign-up can never assign `admin` (`role` and `isBlocked` remain server-controlled).
  - Blocked users (`isBlocked === true`) are denied both new sessions and all protected API routes immediately (checked live in MongoDB per request).
  - Never expose internal DB fields (`_id`, secrets, ImgBB API keys, or upstream `delete_url`) in API responses or logs.
  - Never commit `.env`, API keys, tokens, or credentials. Keep `.env.example` synchronized with empty secret values.
- **Data safety:** Never drop collections or mutate existing seed/production-like records during tests. Clean up all temporary test documents after automated test runs.
- **Strict JSON contract:**
  - Success: `{ "success": true, "data": ..., "meta"?: ... }`
  - Error: `{ "success": false, "message": "...", "code"?: "...", "errors"?: { ... } }`

---

## 2. Completed Work & Roadmap Status

> Checkbox legend: `[x]` Completed and verified | `[ ]` Not completed | `[~]` Partially completed / environment limitation

### Step 1 — Part A: Express Backend Foundation (commit `0b2c6eb`)

- [x] Express 5 ESM application (`config/`, `db/`, `lib/`, `middleware/`, `routes/`, `scripts/`, `utils/`).
- [x] Fail-fast env validation (`config/env.js`) and singleton MongoDB Atlas client (`db/mongo.js`).
- [x] Collection index bootstrap (`db/indexes.js`) for `services`, `appointments`, and `transactions`.
- [x] Security stack: `helmet`, credentialed CORS allowlist (`CLIENT_URL`), rate limiting (`express-rate-limit`), JSON/cookie parsing, JSON 404 handler, central error handler, and `GET /api/health`.

### Step 1 — Part B: Authentication & Authorization (commit `5a961b2`)

- [x] Better Auth mounted at `/api/auth/*splat` backed by `@better-auth/mongo-adapter` (email/password min 6 chars + upper/lower, Google OAuth env support, server-controlled `role` and `isBlocked`, `phone`, blocked-user session creation hook).
- [x] `jose` HS256 JWT issuance and verification (`POST /api/jwt/token`, `GET /api/jwt/me`, `GET /api/jwt/providers`, `/customer-check`, `/admin-check`).
- [x] Route protection middleware (`requireAuth`, `requireNotBlocked`, `requireRole`, `protect`).
- [x] Idempotent `npm run seed:admin` script.

### Step 2A: Express Services APIs & ImgBB Image Upload Infrastructure (commits `449a45c`, `ede3cc1`, `1bf7ec6`) — **COMPLETED**

- [x] Shared service constants (`config/constants.js`) matching `rup-chorcha` categories (`Haircut & Styling`, `Hair Coloring`, `Hair Treatment`, `Facial & Skincare`, `Makeup`, `Manicure & Pedicure`, `Spa & Massage`), approved image hosts, price/duration bounds, and pagination defaults.
- [x] Public read endpoints: `GET /api/services` (active-only, search, category filter, price/name/date sort, skip/limit pagination) and `GET /api/services/:id` (active-only).
- [x] Protected admin endpoints (`...protect("admin")`): `GET /api/admin/services`, `POST /api/admin/services`, `GET /api/admin/services/:id`, `PUT /api/admin/services/:id`, `PATCH /api/admin/services/:id/status`, `DELETE /api/admin/services/:id` (hard-delete when unreferenced, soft-deactivate when referenced by `appointments`).
- [x] ImgBB server-side upload utility (`lib/imgbb.js`), Multer memory upload middleware (`middleware/upload.js`), upload rate limiter (`uploadRateLimiter`), and `POST /api/admin/uploads/service-image`.
- [x] Added safe compound `services` indexes (`idx_services_status_category_price`, `idx_services_status_created_at`) to `db/indexes.js`.
- [x] Automated integration & unit test suite (`tests/services-and-uploads.test.js`) executed via `npm test`.

### Step 3A: Express Appointments & Customer Availability APIs (commit `fc3b1d8`) — **COMPLETED**

- [x] Added salon schedule & booking constants (`config/constants.js`): `SALON_TIMEZONE` (`Asia/Dhaka`), `SALON_UTC_OFFSET` (`+06:00`), `TIME_SLOTS` (`09:00`–`18:00`), `APPOINTMENT_STATUSES`, `ACTIVE_APPOINTMENT_STATUSES`, `PAYMENT_STATUSES`, `MAX_BOOKING_ADVANCE_DAYS` (`90`), `MAX_APPOINTMENT_MESSAGE_LENGTH` (`500`), and customer pagination defaults (`10` default, `50` max).
- [x] Added `Asia/Dhaka` / UTC date conversion utilities (`utils/salonTime.js`): strict `YYYY-MM-DD` validation, current salon date/time checks, `parseSalonDateToUtcStart()` (`00:00:00.000+06:00` -> UTC), `parseSalonSlotToUtcStart()`, advance-window range checks, and `isSlotInPast()`.
- [x] Added strict Zod validation (`modules/appointments/appointments.validation.js`): `appointmentIdParamSchema`, `availabilityQuerySchema`, `.strict()` `createAppointmentSchema` (rejects `customerId`, `servicePrice`, `status`, `paymentStatus`, or unrecognized keys), and `myAppointmentsQuerySchema`.
- [x] Implemented `GET /api/services/:id/availability?date=YYYY-MM-DD` (`...protect("customer")`) returning `{ serviceId, date, timezone, slots, bookedSlots, pastSlots, maxAdvanceDays }`, hiding inactive services (`404`) and marking same-day elapsed slots in `Asia/Dhaka`.
- [x] Implemented `POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/my/:id`, and `PATCH /api/appointments/my/:id/cancel` (`...protect("customer")`) enforcing active service existence, server-derived `servicePrice` snapshot (`pending`/`unpaid` defaults), future-date & past-slot validation (`400`), per-customer duplicate active slot protection via `uniq_appointments_customer_active_slot` (`409 DUPLICATE_APPOINTMENT_SLOT`, while allowing different customers on the same date+slot), strict ownership (`403 FORBIDDEN`), and pending-only cancellation (`409 INVALID_STATUS_TRANSITION`).
- [x] Automated integration tests (`tests/appointments.test.js`) verified via `npm test` (`13/13` passed across `3` suites).

### Exact Next Recommended Task

- **Step 4: Express Dashboard, Admin & Profile APIs + Frontend Migration** — implement `/api/dashboard/customer`, `/api/dashboard/admin`, `/api/admin/appointments*`, `/api/admin/users*` (block/unblock customers only), `/api/profile`, and `/api/uploads/profile-image` on Express, and migrate the existing `rup-chorcha` dashboard pages/actions off direct MongoDB/ImgBB access to the Express API + BFF.

### Remaining Backend Roadmap (Upcoming Stages)

- [x] **Step 3A — Appointments & Customer Availability APIs:** `GET /api/services/:id/availability`, `POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/my/:id`, `PATCH /api/appointments/my/:id/cancel`.
- [ ] **Step 4A — Admin Management, Dashboard Stats & Profile APIs:** `/api/dashboard/*`, `/api/admin/appointments*`, `/api/admin/users*` (block/unblock customers only), `/api/profile`, `/api/uploads/profile-image`.
- [ ] **Step 5A — Stripe Checkout, Raw-Body Webhook & Transactions APIs:** `POST /api/payments/checkout`, raw-body `POST /api/payments/webhook` (mounted before `express.json()`), `GET /api/payments/session/:sessionId`, `/api/transactions/my`, `/api/admin/transactions` (strictly read-only).
- [ ] **Step 6–7 — Production Hardening, Backend Commit Count Target (12+) & Deployment.**

---

## 3. Step 2A API Specification

### Public Services Endpoints

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/services` | Public | List active services only (`status: "active"`) with search, category filter, sorting, and pagination |
| `GET` | `/api/services/:id` | Public | Retrieve one active service by ObjectId (`404` if missing or inactive; `400` if invalid ObjectId) |

#### Query Parameters — `GET /api/services`

- `search` *(optional string, trimmed, max 100 chars)*: Case-insensitive partial match on `serviceName`; regex metacharacters escaped via `escapeRegex()`.
- `category` *(optional enum; `""` or `"all"` clears filter)*: One of `SALON_CATEGORIES`. Invalid values return `400 VALIDATION_ERROR`.
- `sort` *(optional enum, default `"newest"`)*: `"newest"` | `"oldest"` | `"price_asc"` | `"price_desc"` | `"name_asc"` | `"name_desc"`.
- `page` *(optional positive integer, default `1`, max `10000`)*.
- `limit` *(optional positive integer, default `12`, max `50`)*.

#### Example Success Response — `GET /api/services`

```json
{
  "success": true,
  "data": [
    {
      "id": "6b008bfdeda8c9a56f80bc57",
      "serviceName": "Jhanker makeup",
      "category": "Facial & Skincare",
      "description": "Aut voluptatum aut p",
      "price": 15900,
      "duration": 44,
      "image": "https://i.ibb.co/jkR1fh6x/1c0a229cba7b.jpg",
      "status": "active",
      "createdAt": "2026-11-20T18:05:49.495Z",
      "updatedAt": "2026-11-20T18:06:25.376Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 12,
    "total": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false,
    "filters": {
      "search": null,
      "category": null,
      "sort": "newest"
    }
  }
}
```

### Protected Admin Services & Upload Endpoints

All `/api/admin/services*` and `/api/admin/uploads/*` routes execute `requireAuth` -> `requireNotBlocked` -> `requireRole("admin")` before request handlers or Multer memory parsing run.

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/services` | Admin | List active & inactive services (`search`, `category`, `status`: `active\|inactive\|all`, `sort`, `page`, `limit` default `10` max `100`) |
| `POST` | `/api/admin/services` | Admin | Create service (`201`). Accepts JSON or `multipart/form-data` with `image` file upload |
| `GET` | `/api/admin/services/:id` | Admin | Fetch single active or inactive service (`400 INVALID_SERVICE_ID` / `404 SERVICE_NOT_FOUND`) |
| `PUT` | `/api/admin/services/:id` | Admin | Update whitelisted service fields (`image` optional to preserve existing photo); supports JSON or multipart |
| `PATCH` | `/api/admin/services/:id/status` | Admin | Toggle `"active"` / `"inactive"` (`{ "status": "active" | "inactive" }`) |
| `DELETE` | `/api/admin/services/:id` | Admin | Hard-delete if 0 referencing `appointments`; soft-deactivate (`status: "inactive"`) if referenced |
| `POST` | `/api/admin/uploads/service-image` | Admin | Upload single `image` file (`multipart/form-data`, rate-limited) to ImgBB and return hosted HTTPS URL + metadata |

---

## 4. Validation, Authorization & ImgBB Rules

- **ObjectId validation (`utils/validation.js`):** Strict `/^[0-9a-fA-F]{24}$/` + `ObjectId.isValid` prevents 12-byte arbitrary strings from being treated as valid IDs (`400 INVALID_SERVICE_ID`).
- **Strict body schemas (`modules/services/services.validation.js`):**
  - `createServiceSchema`, `updateServiceSchema`, and `updateServiceStatusSchema` all use `.strict()`, rejecting unrecognized or unauthorized fields with `400 VALIDATION_ERROR`.
  - `price`: whole integer cents (`1` to `10_000_000`).
  - `duration`: whole integer minutes (`1` to `1440`).
  - `status`: defaults to `"active"` on create.
  - `image` URL (when provided as URL instead of multipart upload): requires `https:` URL hosted in `ALLOWED_SERVICE_IMAGE_HOSTS` (`i.ibb.co`, `i.ibb.co.com`, `images.unsplash.com`, `lh3–lh6.googleusercontent.com`).
  - Duplicate prevention: case-insensitive exact match of `serviceName` within the same `category` returns `409 DUPLICATE_SERVICE`.
- **Safe projection:** MongoDB queries project only the 10 whitelisted fields and return `id` instead of raw `_id`.
- **ImgBB integration (`lib/imgbb.js`, `middleware/upload.js`, `middleware/errorHandler.js`):**
  - Multer `memoryStorage()` enforces max 1 file (`image` field), allowed MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/gif`), and `MAX_UPLOAD_MB` (`5 MB` default -> `413 FILE_TOO_LARGE`).
  - `validateImageFile()` verifies non-empty buffers and matches binary magic bytes (JPEG, PNG, GIF87a/89a, WebP RIFF+WEBP) against declared MIME (`400 INVALID_IMAGE_CONTENT`).
  - `uploadImageToImgBB()` encodes base64 and `POST`s to `https://api.imgbb.com/1/upload` with a 15s `AbortController` timeout (`504 IMAGE_UPLOAD_TIMEOUT`), returns `503 IMAGE_UPLOAD_NOT_CONFIGURED` if `IMGBB_API_KEY` is empty, returns `502 IMAGE_UPLOAD_FAILED` on upstream errors, and never leaks `IMGBB_API_KEY` or `delete_url` in responses/logs.

---

## 5. Database Indexes (`services` collection)

Verified idempotently by `ensureIndexes(db)` in `db/indexes.js`:

- `idx_services_status`: `{ status: 1 }`
- `idx_services_category`: `{ category: 1 }`
- `idx_services_price`: `{ price: 1 }`
- `idx_services_name`: `{ serviceName: 1 }`
- `idx_services_created_at`: `{ createdAt: -1 }`
- `idx_services_status_category_price`: `{ status: 1, category: 1, price: 1 }`
- `idx_services_status_created_at`: `{ status: 1, createdAt: -1 }`

---

## 6. Environment Variables (Names & Purposes Only)

Never place secret values into `AGENTS.md`, `README.md`, or `.env.example`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` | Express server port |
| `NODE_ENV` | Optional | `development` | Environment (`development` / `production`) |
| `CLIENT_URL` | Required in prod | `http://localhost:3000` (dev) | Comma-separated allowed CORS origins |
| `MONGODB_URI` | Required | — | MongoDB Atlas connection string (`DB_URI` fallback supported) |
| `MONGODB_DB_NAME` | Optional | `rup-chorcha` | Target MongoDB database name |
| `BETTER_AUTH_SECRET` | Required | — | Better Auth session/state secret (`>=32` chars) |
| `BETTER_AUTH_URL` | Required in prod | `http://localhost:<PORT>` | Canonical Better Auth origin |
| `JWT_SECRET` | Required | — | HS256 JWT signing/verification secret (`>=32` chars) |
| `JWT_EXPIRES_IN` | Optional | `15m` | Access JWT lifetime |
| `JWT_ISSUER` | Optional | `rup-chorcha-api` | JWT `iss` claim |
| `JWT_AUDIENCE` | Optional | `rup-chorcha-client` | JWT `aud` claim |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | — | Enables Google OAuth in Better Auth when both set |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Seed CLI | `RupChorcha Admin` | Admin provisioning via `npm run seed:admin` |
| `IMGBB_API_KEY` | Required for upload | — | Server-side ImgBB API key (`503` on upload if unset) |
| `MAX_UPLOAD_MB` | Optional | `5` | Maximum service image upload size in MB (max `20`) |
| `UPLOAD_RATE_LIMIT_WINDOW_MS` | Optional | `900000` | Upload endpoint rate-limit window (ms) |
| `UPLOAD_RATE_LIMIT_MAX` | Optional | `100` dev / `30` prod | Upload endpoint rate limit per window |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | Phase 5 | `usd` | Reserved for Step 5 Stripe Checkout & webhooks |

---

## 7. Executed Verification & Known Limitations

- **Syntax check:** `node --check` passed (`exit 0`) on every `.js` file in `rup-chorcha-backend`.
- **Automated suite (`npm test` -> `node --test tests/*.test.js`):** **13/13 tests passed across 3 suites (0 failures, 0 skipped)** against real MongoDB Atlas + ephemeral Express server (`port 0`), using `uploadImageToImgBB` mock HTTP transport for upload unit/error injection tests. Includes `tests/appointments.test.js` (5 tests covering customer-only RBAC, blocked users, `Asia/Dhaka` past slots, payload spoofing, price snapshot, concurrent duplicate/overlapping `409`, multi-customer same-slot `201`, and customer list/detail/cancel/rebook). Pre-existing document `"Jhanker makeup"` (`6b008bfdeda8c9a56f80bc57`) verified unchanged, and all temporary test documents are cleaned up after runs.
- **Live ImgBB upload verification:** `IMGBB_API_KEY` was added to local `rup-chorcha-backend/.env` and verified via `POST /api/admin/uploads/service-image` on an ephemeral Express instance loaded from current `.env` (`200 OK`, uploaded PNG returned `https://i.ibb.co/HLVv3C77/stage2b-1795238288564-5666.png`, and `GET` on that URL returned `200 image/png`).
- **Step 3 API summary (`fc3b1d8`):**
  - `GET /api/services/:id/availability?date=YYYY-MM-DD` (`...protect("customer")`): returns `{ serviceId, date, timezone, slots, bookedSlots, pastSlots, maxAdvanceDays }`.
  - `POST /api/appointments` (`...protect("customer")`): `.strict()` Zod body (`serviceId`, `appointmentDate`, `timeSlot`, optional `message`), active service lookup, UTC normalized salon date (`00:00:00.000+06:00`), server `servicePrice` snapshot, `pending` / `unpaid` defaults, and `uniq_appointments_customer_active_slot` (`409 DUPLICATE_APPOINTMENT_SLOT`).
  - `GET /api/appointments/my`, `GET /api/appointments/my/:id`, `PATCH /api/appointments/my/:id/cancel` (`...protect("customer")`): ownership-enforced customer history (with populated service summary + filter/pagination), single-record lookup (`403 FORBIDDEN` on another customer's record), and pending-only cancellation (`409 INVALID_STATUS_TRANSITION` if confirmed/cancelled).
- **TypeScript / ESLint:** Not configured in `rup-chorcha-backend` (repository uses plain JavaScript ESM without TypeScript or ESLint in `package.json`).
