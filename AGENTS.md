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

### Step 4A: Express Dashboard, Admin & Profile APIs (commit `7405266`) — **COMPLETED**

- [x] **Customer & Admin Dashboards (`modules/dashboard/*`, `routes/dashboard.routes.js`):**
  - `GET /api/dashboard/customer` (`...protect("customer")`): strictly scoped to `req.user.id` (ignores client query spoofing), parallel `$group` appointment/payment counters + filtered `Asia/Dhaka` upcoming active appointments + recent 5 history items.
  - `GET /api/dashboard/admin` (`...protect("admin")`): parallel aggregations across `user` (`active`/`blocked` customers), `services` (`active`/`inactive`), `appointments` (all status & payment counts), `transactions` (`totalRevenueCents`, `successfulPayments`, `failedPayments`, explicit `hasRecordedTransactions` flag), and recent 5 hydrated appointments.
- [x] **Admin Appointments Management (`modules/appointments/*`, `routes/admin.appointments.routes.js`):**
  - `GET /api/admin/appointments` (status, `paymentStatus`, `date`, regex-escaped `search`, `$facet` pagination + global `meta.counts`), `GET /api/admin/appointments/:id`, `PATCH /api/admin/appointments/:id/confirm` (`pending -> confirmed`), `PATCH /api/admin/appointments/:id/cancel` (`pending|confirmed -> cancelled`, preserves `paymentStatus` & fees/history), and `PATCH /api/admin/appointments/:id/status` (`.strict()` schema preventing `"pending"` revert or price/customer/service/payment tampering).
- [x] **Admin User Management (`modules/users/*`, `routes/admin.users.routes.js`):**
  - `GET /api/admin/users` (customers only `role: { $ne: "admin" }`, search across name/email/phone, `active|blocked` filter, pagination, `appointmentCount`), `GET /api/admin/users/:id` (with `appointmentStats` + recent appointments; returns `404` for admins), `PATCH /api/admin/users/:id/block`, `PATCH /api/admin/users/:id/unblock` (blocks admins/self with `403 CANNOT_BLOCK_ADMIN`, deletes Better Auth `session` docs across `ObjectId`/`string` `userId` on block, and enforces live DB `isBlocked` denial).
- [x] **Profile & Profile Image Upload (`modules/profile/*`, `routes/profile.routes.js`, `routes/uploads.routes.js`, reused `lib/imgbb.js` & `middleware/upload.js`):**
  - `GET /api/profile` & `PATCH /api/profile` (`...protect()`, `.strict()` Zod schema permitting only `name`, `phone`, `image`, rejecting protected fields like `role`, `isBlocked`, `email`, `password`, `id`).
  - `POST /api/uploads/profile-image` (`...protect()`, `uploadRateLimiter`, `uploadSingleProfileImage`) reusing shared Multer + magic-byte validation + ImgBB helper and saving the HTTPS URL exclusively on `req.user.id`.
- [x] **MongoDB Collections, Safe Projections & Indexes (`db/mongo.js`, `db/users.js`, `db/indexes.js`):** Added `sessions` collection accessor, `SAFE_USER_PROJECTION`, `buildUserCandidateIds()`, and compound indexes `idx_appointments_status_created` + `idx_appointments_customer_status_date_slot`.
- [x] **Verification:** `node --check` passed on all `.js` files; `npm test` passed **20/20 tests across 4 suites** (`tests/dashboard-admin-profile.test.js` + existing suites); live ImgBB `POST /api/uploads/profile-image` smoke test passed (`200`, hosted URL persisted & fetched cleanly).

### Step 4B: Frontend Dashboard, Admin & Profile Migration (`rup-chorcha`) — **COMPLETED**

- [x] Customer/Admin dashboards (`/customer`, `/customer/appointments`, `/customer/profile`, `/admin`, `/admin/services*`, `/admin/appointments`, `/admin/users`, `/admin/profile`), Server Actions, `ProfileForm` (with `uploadMyProfileImage`), `/api/auth/profile` (`GET`/`PATCH`), `/api/backend/uploads/profile-image`, `/api/admin/uploads/service-image`, `/api/backend/appointments/[id]/cancel`, and `/api/backend/admin/{appointments,users}/[id]` now run on Express APIs via authenticated Bearer JWTs.
- [x] Obsolete Next.js direct-MongoDB modules (`src/lib/{services,appointments,admin}.ts`) and `IMGBB_API_KEY` usage removed from Next.js code and `.env.example`; `src/lib/transactions-legacy.ts` (`src/lib/db.ts`) retained strictly for Step 5 deferred `getCustomerTransactions`, `verifyPayableAppointment`, and `getAllTransactions`.

### Exact Next Recommended Task

- **Step 5B: Frontend Payment Integration & Legacy DB Cleanup (`rup-chorcha`)** — wire Pay Now (`POST /api/payments/checkout`), `/payment/success` (polling `/api/payments/session/:sessionId`), `/payment/cancel`, Customer Payments tab (`GET /api/transactions/my`), and Admin `/admin/transactions` (`GET /api/admin/transactions`) via Next.js BFF/server helpers, and remove `src/lib/db.ts`, `src/lib/transactions-legacy.ts`, `mongodb`, and `MONGODB_URI` from `rup-chorcha` after explicit user approval.

### Remaining Backend Roadmap (Upcoming Stages)

- [x] **Step 3A — Appointments & Customer Availability APIs:** `GET /api/services/:id/availability`, `POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/my/:id`, `PATCH /api/appointments/my/:id/cancel`.
- [x] **Step 4A — Admin Management, Dashboard Stats & Profile APIs:** `/api/dashboard/*`, `/api/admin/appointments*`, `/api/admin/users*` (block/unblock customers only), `/api/profile`, `/api/uploads/profile-image`.
- [x] **Step 4B — Frontend Dashboard, Admin & Profile Migration *(in `rup-chorcha`)*:** End-to-end verified (`12/12`) against this backend.
- [x] **Step 5A — Stripe Checkout, Raw-Body Webhook & Transactions APIs:** `POST /api/payments/checkout`, raw-body `POST /api/payments/webhook` (mounted before `globalRateLimiter` & `express.json()`), `GET /api/payments/session/:sessionId`, `GET /api/transactions/my`, and strictly read-only `GET /api/admin/transactions`.
- [ ] **Step 6–7 — Production Hardening, Live Stripe Webhook Verification & Deployment.**

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

## 5. Database Indexes

Verified idempotently by `ensureIndexes(db)` in `db/indexes.js`:

- **`services`:** `idx_services_status`, `idx_services_category`, `idx_services_price`, `idx_services_name`, `idx_services_created_at`, `idx_services_status_category_price`, `idx_services_status_created_at`.
- **`appointments`:** `idx_appointments_customer_created`, `idx_appointments_service`, `idx_appointments_status`, `idx_appointments_date_slot`, `idx_appointments_status_created` (`{ status: 1, createdAt: -1 }`), `idx_appointments_customer_status_date_slot` (`{ customerId: 1, status: 1, appointmentDate: 1, timeSlot: 1 }`), and unique partial index `uniq_appointments_customer_active_slot` (`{ customerId: 1, appointmentDate: 1, timeSlot: 1 }`, `status: { $in: ["pending", "confirmed"] }`).
- **`transactions`:** `uniq_transactions_stripe_session`, `idx_transactions_customer_created`, `idx_transactions_appointment`, `idx_transactions_status`, `uniq_transactions_paid_appointment`, `uniq_transactions_pending_appointment` (unique `{ appointmentId: 1 }` where `status: "pending"`), and `idx_transactions_created_at` (`{ createdAt: -1 }`).

---

## 6. Environment Variables (Names & Purposes Only)

Never place secret values into `AGENTS.md`, `README.md`, or `.env.example`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | Optional | `5000` | Express server port |
| `NODE_ENV` | Optional | `development` | Environment (`development` / `production`) |
| `CLIENT_URL` | Required in prod | `http://localhost:3000` (dev) | Comma-separated allowed CORS origins |
| `CLIENT_APP_URL` | Optional | `CLIENT_URL[0]` or `http://localhost:3000` | Canonical frontend origin for Stripe `success_url` / `cancel_url` |
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
| `MAX_UPLOAD_MB` | Optional | `5` | Maximum image upload size in MB (max `20`) |
| `UPLOAD_RATE_LIMIT_WINDOW_MS`, `UPLOAD_RATE_LIMIT_MAX` | Optional | `900000` / `100` dev (`30` prod) | Upload endpoint rate-limit window & cap |
| `STRIPE_SECRET_KEY` | Required for Checkout | — | Server-only Stripe secret API key (`sk_test_...` / `sk_live_...` / `rk_...`) |
| `STRIPE_PUBLISHABLE_KEY` | Optional on server | — | Stripe publishable key (`pk_test_...` / `pk_live_...`); validated format if present |
| `STRIPE_WEBHOOK_SECRET` | Required for webhooks | — | Stripe webhook signing secret (`whsec_...`) for raw-body signature verification |
| `STRIPE_CURRENCY` | Optional | `usd` | Enforced lowercase Stripe Checkout currency (`usd`) |
| `CHECKOUT_RATE_LIMIT_WINDOW_MS`, `CHECKOUT_RATE_LIMIT_MAX` | Optional | `900000` / `100` dev (`30` prod) | Checkout endpoint rate-limit window & cap |

---

## 7. Executed Verification & Known Limitations

- **Syntax check:** `node --check` passed (`exit 0`) on every `.js` file outside `node_modules`.
- **Automated suite (`npm test` -> `node --test --test-concurrency=1 tests/*.test.js`):** **24/24 tests passed across 5 suites (0 failures, 0 skipped, duration 53.6s)** against real MongoDB Atlas + ephemeral Express servers (`services-and-uploads.test.js`, `appointments.test.js`, `dashboard-admin-profile.test.js`, and `payments.test.js`). Pre-existing document `"Jhanker makeup"` (`6b008bfdeda8c9a56f80bc57`) verified unchanged, and all temporary test users, sessions, services, appointments, transactions, and live Stripe Checkout Sessions were cleaned up/expired after execution.
- **Live Stripe Test-Mode Checkout (`tests/payments.test.js`):** Real `stripe.checkout.sessions.create`, open-session reuse, real `stripe.checkout.sessions.retrieve`, real `stripe.checkout.sessions.expire`, and fresh retry creation executed cleanly against Stripe test mode using `STRIPE_SECRET_KEY`.
- **Cryptographic Webhook Verification (`tests/payments.test.js`):** Raw-body `Stripe.webhooks.generateTestHeaderString` + `stripe.webhooks.constructEvent` verified signature rejection (`missing`/`invalid`/`tampered`), `checkout.session.completed` (`paid` vs async `unpaid`), idempotent duplicate event handling, `checkout.session.expired`, `checkout.session.async_payment_failed`, `checkout.session.async_payment_succeeded`, and protection against paying pending/cancelled appointments.
- **Stripe CLI Limitation / Manual Check:** `stripe` CLI is not installed on this Windows workstation and `STRIPE_WEBHOOK_SECRET` is blank in the local `.env`. Install Stripe CLI and run `stripe listen --forward-to http://localhost:5000/api/payments/webhook`, place the generated `whsec_...` into backend `.env` as `STRIPE_WEBHOOK_SECRET`, and trigger live Stripe CLI webhook tests locally.
- **Live ImgBB upload verification:**
  - Service image (`POST /api/admin/uploads/service-image`, Step 2A): `200 OK`, uploaded PNG returned `https://i.ibb.co/HLVv3C77/stage2b-1795238288564-5666.png` (`200 image/png`).
  - Profile image (`POST /api/uploads/profile-image`, Step 4A): `200 OK`, uploaded PNG persisted on temporary customer in MongoDB and returned `https://i.ibb.co/W4sYxgLq/stage4a-profile-1795248691995.png` (`200 image/png`).
- **Step 3 API summary (`fc3b1d8`):**
  - `GET /api/services/:id/availability?date=YYYY-MM-DD`, `POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/my/:id`, `PATCH /api/appointments/my/:id/cancel` (`...protect("customer")`).
- **TypeScript / ESLint:** Not configured in `rup-chorcha-backend` (repository uses plain JavaScript ESM without TypeScript or ESLint in `package.json`).

---

## 8. Step 4A & Step 5A Specifications

### Step 4A Endpoints & Authorization Rules (`commit 7405266`)

| Method | Path | Access | Contract Summary |
|---|---|---|---|
| `GET` | `/api/dashboard/customer` | Customer | `{ profile, stats, upcomingAppointments, recentAppointments, timezone }`; ignores query spoofing |
| `GET` | `/api/dashboard/admin` | Admin | `{ overview, recentAppointments, timezone }`; `hasRecordedTransactions` distinguishes unrecorded vs. zero revenue |
| `GET` | `/api/admin/appointments` | Admin | Filter by `status`, `paymentStatus`, `date`, regex-escaped `search`, `$facet` pagination + `meta.counts` |
| `GET` | `/api/admin/appointments/:id` | Admin | Single hydrated appointment with customer & service info (`400`/`404`) |
| `PATCH` | `/api/admin/appointments/:id/confirm` | Admin | Strict empty body; atomic `pending -> confirmed` (`409 INVALID_STATUS_TRANSITION` otherwise) |
| `PATCH` | `/api/admin/appointments/:id/cancel` | Admin | Strict empty body; atomic `pending\|confirmed -> cancelled`; preserves `paymentStatus` history |
| `PATCH` | `/api/admin/appointments/:id/status` | Admin | `.strict()` `{ status: "confirmed" \| "cancelled" }`; rejects `"pending"` or extra fields (`400`) |
| `GET` | `/api/admin/users` | Admin | Customers only (`role: { $ne: "admin" }`), `search`, `status` (`active\|blocked\|all`), pagination, `appointmentCount` |
| `GET` | `/api/admin/users/:id` | Admin | Customer detail + `appointmentStats` + recent 5 appointments (`404` for admins) |
| `PATCH` | `/api/admin/users/:id/block` | Admin | Blocks customer & deletes Better Auth `session` docs across ObjectId/string `userId` (`403` for admins/self) |
| `PATCH` | `/api/admin/users/:id/unblock` | Admin | Unblocks customer & restores protected access (`403` for admins) |
| `GET` | `/api/profile` | Authenticated | Safe own user projection (excludes `_id`, passwords, tokens) |
| `PATCH` | `/api/profile` | Authenticated | `.strict()` `{ name?, phone?, image? }`; clears optional fields on `""`/`null`; rejects `role`/`isBlocked`/`email`/`id` |
| `POST` | `/api/uploads/profile-image` | Authenticated | Rate-limited Multer + magic-byte ImgBB upload updating only `req.user.id` `image` field |

### Dashboard Aggregations, Status Rules & Restrictions

- **Customer dashboard (`modules/dashboard/dashboard.service.js`):** Single `$group` over `{ customerId: req.user.id }` plus 2 bounded queries for upcoming active appointments (filtering elapsed `Asia/Dhaka` same-day slots) and 5 recent appointments.
- **Admin dashboard:** 5 parallel aggregations across `user` (excluding admins), `services`, `appointments`, `transactions` (summing numeric positive `amount` for `status: "paid"` and setting `hasRecordedTransactions: totalTransactions > 0`), and recent 5 appointments. No revenue is estimated from unpaid appointments.
- **Admin cancellation:** Preserves `paymentStatus` on paid confirmed appointments; no automatic Stripe refund exists (deferred/documented limitation).

### Step 4B Frontend Migration Findings (`rup-chorcha`)

- **Direct MongoDB Modules to Replace:** `src/lib/db.ts`, `src/lib/admin.ts`, `src/lib/appointments.ts`, and `src/lib/services.ts`.
- **Direct ImgBB Route to Replace:** `src/app/api/admin/uploads/service-image/route.ts` reads `process.env.IMGBB_API_KEY` directly; Step 4B should remove `IMGBB_API_KEY` from Next.js and forward authenticated Bearer JWTs to Express `POST /api/admin/uploads/service-image`.
- **Customer Pages & Actions Migrating in Step 4B:** `src/app/(dashboard)/customer/page.tsx`, `src/app/(dashboard)/customer/appointments/page.tsx`, `src/app/(dashboard)/customer/appointments/actions.ts`, `src/app/(dashboard)/customer/profile/page.tsx`, `src/components/dashboard/AppointmentCard.tsx`, and `src/components/dashboard/ProfileForm.tsx`.
- **Admin Pages & Actions Migrating in Step 4B:** `src/app/(dashboard)/admin/page.tsx`, `src/app/(dashboard)/admin/services/{page.tsx,actions.ts,new/page.tsx,update/page.tsx,update/[id]/page.tsx}`, `src/app/(dashboard)/admin/appointments/{page.tsx,actions.ts}`, `src/app/(dashboard)/admin/users/{page.tsx,actions.ts}`, `src/app/(dashboard)/admin/profile/page.tsx`, and `src/components/dashboard/ServiceForm.tsx`. (`src/app/(dashboard)/admin/transactions/page.tsx` and customer `getCustomerTransactions` remain pending Step 5 Stripe transaction endpoints.)
- **Step 4B Verification Status (`rup-chorcha`):** Customer/Admin dashboards, service/appointment/user management, `/api/auth/profile` (`GET`/`PATCH`), `/api/backend/uploads/profile-image`, and `/api/admin/uploads/service-image` now call Express `Step 2A`, `Step 3`, and `Step 4A` endpoints via authenticated Bearer JWTs and BFF proxies.

---

## 9. Step 5A Payment Architecture & API Specification

### Payment & Transaction Lifecycle (`modules/payments/*`)

- **Allowed Transaction Statuses:** `"pending"` | `"paid"` | `"failed"`.
- **Checkout (`POST /api/payments/checkout`):**
  - Runs `checkoutRateLimiter` -> `requireAuth` -> `requireNotBlocked` -> `requireRole("customer")`.
  - `.strict()` Zod schema accepts `{ appointmentId }` only; rejects any client-supplied `amount`, `price`, `servicePrice`, `currency`, `customerId`, `status`, `paymentStatus`, or redirect URLs (`400 VALIDATION_ERROR`).
  - Verifies ownership (`403`), eligible state (`confirmed` and `unpaid`, else `409 APPOINTMENT_NOT_CONFIRMED` / `APPOINTMENT_CANCELLED` / `APPOINTMENT_ALREADY_PAID`), and server-computed USD cents (`appointment.servicePrice` snapshot verified against `services`, `MIN_STRIPE_AMOUNT_CENTS = 50`).
  - Prevents duplicate active checkout sessions: reuses open active Stripe sessions (`200`, `reused: true`), transitions expired remote sessions to `"failed"` (`session_expired`) before creating a replacement session (`201`), and uses unique partial index `uniq_transactions_pending_appointment` + Stripe `idempotencyKey` (`checkout_<transactionId>`) to block parallel race duplicates (`409 CHECKOUT_IN_PROGRESS`).
  - Redirect URLs: `${env.clientBaseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}` and `${env.clientBaseUrl}/payment/cancel?appointmentId=<id>`.
- **Verified Raw-Body Webhook (`POST /api/payments/webhook`):**
  - Mounted in `app.js` **before** `globalRateLimiter` and **before** `express.json()` using `express.raw({ type: "application/json", limit: "1mb" })`.
  - Verifies Stripe signatures via `constructVerifiedStripeEvent()` using `STRIPE_WEBHOOK_SECRET` and raw `Buffer` payload (`400 MISSING_STRIPE_SIGNATURE` / `INVALID_STRIPE_SIGNATURE`; `503 STRIPE_WEBHOOK_NOT_CONFIGURED` if secret missing).
  - Supported events:
    - `checkout.session.completed` (`payment_status === "paid"` -> `markSessionPaid`; `"unpaid"` -> `awaiting_async_payment` without marking paid).
    - `checkout.session.async_payment_succeeded` -> `markSessionPaid`.
    - `checkout.session.expired` -> `markSessionFailed` (`session_expired`).
    - `checkout.session.async_payment_failed` -> `markSessionFailed` (`async_payment_failed`).
  - Idempotency & integrity: repeated events are no-ops (`duplicate: true`), late failures/expirations never downgrade a `paid` transaction, amounts/currencies are cross-checked, `uniq_transactions_paid_appointment` prevents multiple `paid` transactions per appointment, and pending/cancelled appointments are never marked `paid`.

### Step 5A Endpoints

| Method | Path | Access | Contract Summary |
|---|---|---|---|
| `POST` | `/api/payments/checkout` | Customer (`checkoutRateLimiter`) | Creates (`201`) or reuses (`200`) Stripe test/live Checkout Session (`{ transactionId, appointmentId, sessionId, url, amount, currency, status, expiresAt, reused }`) |
| `POST` | `/api/payments/webhook` | Stripe raw signature | Raw-body verified idempotent Stripe webhook (`200 { received, handled, eventType, outcome, duplicate }`) |
| `GET` | `/api/payments/session/:sessionId` | Authenticated owner only (`403` otherwise) | Read-only safe payment & appointment status summary (`status`, `isFinal`, `amount`, `currency`, `appointment`) |
| `GET` | `/api/transactions/my` | Customer | Own transactions paginated (`status` filter, `meta.counts`); never returns other customers' records |
| `GET` | `/api/admin/transactions` | Admin (strictly read-only `GET` only) | All customer transactions with `status`, regex-escaped `search` (customer name/email, service, session ID), pagination, `meta.counts`, `meta.totalPaidRevenueCents` |

---

## 10. Step 6 Audit & Next Recommended Task

- **Step 6 Backend Security & Regression Re-Verification:** Re-ran `npm test` (`24/24` tests passing across `5` suites) plus full-stack Step 6 E2E integration against Next.js `next start` (checking JWT verification, live `isBlocked` enforcement, RBAC isolation, `.strict()` validation, `escapeRegex()`, Helmet/CORS/rate limiting, and raw-body Stripe webhook verification with ephemeral signing secret). Zero backend code changes were needed.
- **Known Local Env Limitation:** `STRIPE_WEBHOOK_SECRET` in local `.env` remains blank until `stripe listen` or the deployed Stripe Webhook endpoint secret is configured.
- **Next Recommended Task:** **Step 7 — Production Deployment** (deploy Express API and Next.js client, configure production env vars + live Stripe webhook secret + Google OAuth callback URLs, seed production admin, and complete manual browser QA on the deployed app).
