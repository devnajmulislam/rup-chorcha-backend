# RupChorcha - Backend API

Backend REST API server for the **RupChorcha** salon appointment booking platform.

## Project Status

- **Implemented:**
  - Express 5 application factory, environment validation, MongoDB Atlas connection & ping helper, idempotent collection index creation (`services`, `appointments`, `transactions`), Helmet security headers, credentialed CORS allowlist, global/auth/upload/checkout rate limiting, JSON/cookie/Multer/Stripe raw-body parsing, `GET /api/health`, JSON 404 handler, and central JSON error handler.
  - Better Auth mounted at `/api/auth/*splat` with MongoDB adapter, email/password authentication (minimum 6 chars with uppercase & lowercase enforcement), Google OAuth env support, server-enforced `role` (`customer` default on all public sign-ups) and `isBlocked` fields, `phone` field, blocked-user session hook, `jose` HS256 JWT issuance/verification (`POST /api/jwt/token`, `GET /api/jwt/me`), `requireAuth` / `requireRole` / `requireNotBlocked` middleware, and idempotent `npm run seed:admin`.
  - Public Services API (`GET /api/services`, `GET /api/services/:id`) with active-only enforcement, escaped search, category filtering, price/name/date sorting, and skip/limit pagination.
  - Protected Admin Services API (`/api/admin/services*` with JSON and multipart support, safe hard-delete vs. soft-deactivate when referenced by appointments) and server-side ImgBB image upload endpoint (`POST /api/admin/uploads/service-image`).
  - Protected Customer Availability & Appointments API (`GET /api/services/:id/availability`, `POST /api/appointments`, `GET /api/appointments/my`, `GET /api/appointments/my/:id`, `PATCH /api/appointments/my/:id/cancel`) with `Asia/Dhaka` schedule validation (`09:00`–`18:00`, `90`-day window), server price snapshot (`pending`/`unpaid` defaults), strict ownership checks, and per-customer active-slot conflict protection (`409 DUPLICATE_APPOINTMENT_SLOT`).
  - Protected Dashboard, Admin Appointment/User Management, & Profile APIs (`GET /api/dashboard/customer`, `GET /api/dashboard/admin`, `GET/PATCH /api/admin/appointments*`, `GET/PATCH /api/admin/users*` with live Better Auth session revocation, `GET/PATCH /api/profile`, and `POST /api/uploads/profile-image` via ImgBB).
  - Stripe Checkout, Verified Raw-Body Webhook & Read-Only Transaction Ledger APIs (`POST /api/payments/checkout`, `POST /api/payments/webhook`, `GET /api/payments/session/:sessionId`, `GET /api/transactions/my`, `GET /api/admin/transactions`).
- **Planned (Upcoming Steps):** Frontend Step 5B payment UI integration (`rup-chorcha`), Step 6 polish/QA, and Step 7 deployment.

## Technology Stack

- **Runtime:** Node.js (`>=20.19.0`), JavaScript ESM
- **Framework:** Express `5.3.0`
- **Database:** MongoDB native driver (`mongodb` `7.9.0`) targeting database `rup-chorcha`
- **Payments:** `stripe` (`^23.2.0`) Checkout Sessions + raw-body webhook signature verification
- **Authentication, JWT & Validation:** `better-auth`, `@better-auth/mongo-adapter`, `jose` (HS256 JWT), `zod`
- **Uploads & Security Middleware:** `multer` (memory storage + magic-byte validation), ImgBB API integration, `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `dotenv`

## Folder Structure

```text
rup-chorcha-backend/
├── config/
│   ├── constants.js        # Shared categories, sort options, image hosts, pagination & limits
│   ├── env.js              # Environment parsing and fail-fast validation
│   └── stripe.js           # Lazy Stripe SDK client & raw-body webhook signature helper
├── db/
│   ├── indexes.js          # Idempotent MongoDB indexes for business collections
│   ├── mongo.js            # Singleton MongoClient, Db handle, ping, and collections
│   └── users.js            # MongoDB Better Auth user lookup & safe projection helpers
├── lib/
│   ├── auth.js             # Better Auth instance, password rules, Google OAuth & hooks
│   ├── imgbb.js            # Magic-byte validation & server-side ImgBB upload helper
│   └── jwt.js              # jose HS256 JWT issuance and claim verification
├── middleware/
│   ├── auth.js             # requireAuth, requireNotBlocked, requireRole, protect
│   ├── errorHandler.js     # Central JSON, Multer, and Zod error handler
│   ├── notFound.js         # JSON 404 handler
│   ├── rateLimiter.js      # Global /api, auth, and upload rate limiters
│   └── upload.js           # Multer single-image memory upload middleware
├── modules/
│   ├── appointments/
│   │   ├── appointments.controller.js
│   │   ├── appointments.service.js
│   │   └── appointments.validation.js
│   ├── dashboard/
│   │   ├── dashboard.controller.js
│   │   └── dashboard.service.js
│   ├── payments/
│   │   ├── payments.controller.js
│   │   ├── payments.service.js
│   │   └── payments.validation.js
│   ├── profile/
│   │   ├── profile.controller.js
│   │   ├── profile.service.js
│   │   └── profile.validation.js
│   ├── services/
│   │   ├── services.controller.js
│   │   ├── services.service.js
│   │   └── services.validation.js
│   └── users/
│       ├── users.controller.js
│       ├── users.service.js
│       └── users.validation.js
├── routes/
│   ├── admin.appointments.routes.js # Admin appointment list, detail, confirm & cancel
│   ├── admin.services.routes.js     # Admin service CRUD & status routes
│   ├── admin.transactions.routes.js # Read-only admin transaction ledger routes
│   ├── admin.uploads.routes.js      # Admin ImgBB upload route
│   ├── admin.users.routes.js        # Admin customer directory, detail & block/unblock
│   ├── appointments.routes.js       # Customer booking, list, detail & cancel routes
│   ├── dashboard.routes.js          # Customer & Admin dashboard overview endpoints
│   ├── health.routes.js             # GET /api/health
│   ├── index.js                     # /api router mount
│   ├── jwt.routes.js                # JWT issuance & role-verification endpoints (/api/jwt/*)
│   ├── payments.routes.js           # Stripe Checkout creation & session status lookup
│   ├── profile.routes.js            # Authenticated own profile read & PATCH update
│   ├── services.routes.js           # Public service routes & customer availability (/api/services*)
│   ├── transactions.routes.js       # Authenticated customer transaction history
│   └── uploads.routes.js            # Authenticated profile image ImgBB upload
├── scripts/
│   └── seed-admin.js       # Secure idempotent admin seeding CLI (npm run seed:admin)
├── tests/
│   ├── appointments.test.js            # Step 3 appointment & availability integration tests
│   ├── dashboard-admin-profile.test.js # Step 4A dashboard, admin & profile integration tests
│   ├── payments.test.js                # Step 5A Stripe Checkout, webhook & transactions tests
│   └── services-and-uploads.test.js    # Step 2A services & ImgBB integration tests
├── utils/
│   ├── ApiError.js         # Operational error class with HTTP status & error code
│   ├── apiResponse.js      # Standard { success, data | message } helpers
│   ├── password.js         # Zod password rules & role normalization
│   ├── salonTime.js        # Asia/Dhaka date/slot parsing & UTC normalization helpers
│   └── validation.js       # Strict ObjectId check, regex escaping, Zod parser helper
├── .env.example            # Variable names only (never commit real .env)
├── AGENTS.md               # Backend architecture & roadmap tracker
├── app.js                  # Express middleware stack and routes
└── index.js                # Server bootstrap, DB/index/auth init, graceful shutdown
```

## Installation & Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a local `.env` file from `.env.example` and populate the required values:
   ```bash
   cp .env.example .env
   ```
3. Seed the initial admin account (reads `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`):
   ```bash
   npm run seed:admin
   ```
   - Never hardcodes passwords or creates duplicate admins if re-run.
   - Refuses to alter an existing non-admin customer account unless `SEED_ADMIN_PROMOTE=true` is explicitly set.
4. Run the server:
   - Development (auto-reloads on file changes):
     ```bash
     npm run dev
     ```
   - Production:
     ```bash
     npm start
     ```

## Google OAuth Setup

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`, and register this redirect URI in Google Cloud Console:

```text
<CLIENT_APP_URL>/api/auth/callback/google
```

(Local default: `http://localhost:3000/api/auth/callback/google`; production: `https://rup-chorcha.vercel.app/api/auth/callback/google` — routed through the Next.js same-origin BFF callback.)

## Required Environment Variables

Names only — never commit real credentials or secrets to version control.

- `PORT` — HTTP port for the Express server (default: `5000`)
- `NODE_ENV` — `development` or `production`
- `CLIENT_URL` — Comma-separated allowed browser origins (required in production; defaults to `http://localhost:3000` locally)
- `MONGODB_URI` — MongoDB Atlas connection string (legacy `DB_URI` is also accepted as a fallback)
- `MONGODB_DB_NAME` — Target database name (default: `rup-chorcha`)
- `BETTER_AUTH_SECRET` — Better Auth secret (minimum 32 characters)
- `BETTER_AUTH_URL` — Origin URL where the auth server is reachable (default: `http://localhost:5000`, required in production)
- `JWT_SECRET` — Secret key for Express HS256 JWT signing/verification (minimum 32 characters)
- `JWT_EXPIRES_IN` — JWT lifetime (default: `15m`)
- `JWT_ISSUER` — JWT `iss` claim (default: `rup-chorcha-api`)
- `JWT_AUDIENCE` — JWT `aud` claim (default: `rup-chorcha-client`)
- `GOOGLE_CLIENT_ID` — Google OAuth client ID (optional; enables Google sign-in)
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `ADMIN_EMAIL` — Seeded administrator email (for `npm run seed:admin`)
- `ADMIN_PASSWORD` — Seeded administrator password (must meet password rules)
- `ADMIN_NAME` — Seeded administrator display name (optional, default: `RupChorcha Admin`)
- `STRIPE_SECRET_KEY` *(Step 5A)* — Server-only Stripe secret API key (`sk_test_...` / `sk_live_...` / `rk_...`)
- `STRIPE_PUBLISHABLE_KEY` *(Step 5A, optional on server)* — Stripe publishable key (`pk_test_...` / `pk_live_...`)
- `STRIPE_WEBHOOK_SECRET` *(Step 5A)* — Stripe webhook signing secret (`whsec_...`)
- `STRIPE_CURRENCY` *(Step 5A, optional)* — Lowercase Stripe Checkout currency (`usd`)
- `CHECKOUT_RATE_LIMIT_WINDOW_MS`, `CHECKOUT_RATE_LIMIT_MAX` *(Step 5A, optional)* — Checkout rate-limit window and cap
- `CLIENT_APP_URL` *(Step 5A, optional)* — Frontend base URL override for Stripe `success_url` / `cancel_url` (defaults to `CLIENT_URL`)

## Local Stripe Webhook Testing (Stripe CLI)

1. Install the Stripe CLI on Windows (e.g., `winget install Stripe.StripeCli` or via Scoop) and verify with `stripe --version`.
2. Authenticate the CLI in your Stripe account (`stripe login`).
3. Start listening and forwarding webhooks to the local backend:
   ```bash
   stripe listen --forward-to http://localhost:5000/api/payments/webhook
   ```
4. Copy the printed webhook signing secret (`whsec_...`) into `rup-chorcha-backend/.env` as `STRIPE_WEBHOOK_SECRET`, restart the backend (`npm run dev`), and test with:
   ```bash
   stripe trigger checkout.session.completed
   ```
- `IMGBB_API_KEY` *(Step 2A)* — Server-only ImgBB upload API key
- `MAX_UPLOAD_MB` *(Step 2A, optional)* — Max image upload size in MB (default: `5`)

## Currently Available Endpoints

Standard JSON contract:
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "message": "...", "code": "..." }`

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/` | Public | Basic service status and health route pointer |
| `GET` | `/api/health` | Public | Verifies active MongoDB connectivity (`200` connected, `503` unavailable) |
| `ALL` | `/api/auth/*` | Public/Session | Better Auth handler (sign-up, sign-in, sign-out, Google OAuth, session) |
| `GET` | `/api/jwt/providers` | Public | Reports configured auth providers (`emailPassword`, `google`) |
| `POST` | `/api/jwt/token` | Active Session | Exchanges valid Better Auth session cookie for a short-lived HS256 JWT |
| `GET` | `/api/jwt/me` | JWT (`customer` or `admin`, not blocked) | Verifies JWT + live DB user and returns user & claims |
| `GET` | `/api/jwt/customer-check` | JWT (`customer` only, not blocked) | Role guard verification endpoint for customers |
| `GET` | `/api/jwt/admin-check` | JWT (`admin` only, not blocked) | Role guard verification endpoint for admins |
| `GET` | `/api/services` | Public | List active services with search, category filter, sort, and pagination |
| `GET` | `/api/services/:id` | Public | Retrieve one active service by ID |
| `GET` | `/api/services/:id/availability` | JWT (`customer`, not blocked) | Retrieve slot schedule, customer's booked slots, and past `Asia/Dhaka` slots for a date |
| `POST` | `/api/appointments` | JWT (`customer`, not blocked) | Create an appointment (`pending`/`unpaid`, server price snapshot, duplicate active slot 409 guard) |
| `GET` | `/api/appointments/my` | JWT (`customer`, not blocked) | List authenticated customer's own appointments with optional status filter & pagination |
| `GET` | `/api/appointments/my/:id` | JWT (`customer`, not blocked) | Retrieve one customer-owned appointment with service summary |
| `PATCH` | `/api/appointments/my/:id/cancel` | JWT (`customer`, not blocked) | Cancel customer's own `pending` appointment |
| `GET` | `/api/dashboard/customer` | JWT (`customer`, not blocked) | Authenticated customer profile, appointment stats, upcoming & recent bookings |
| `GET` | `/api/dashboard/admin` | JWT (`admin`, not blocked) | Aggregate customer, service, appointment, recorded revenue & recent bookings |
| `GET` | `/api/admin/services` | JWT (`admin`, not blocked) | List all services (active & inactive) with filters and pagination |
| `POST` | `/api/admin/services` | JWT (`admin`, not blocked) | Create a service (JSON or multipart file upload) |
| `GET` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Retrieve a service for admin editing |
| `PUT` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Update a service (JSON or optional multipart image replacement) |
| `PATCH` | `/api/admin/services/:id/status` | JWT (`admin`, not blocked) | Activate or deactivate a service |
| `DELETE` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Hard-delete unreferenced service or deactivate referenced service |
| `POST` | `/api/admin/uploads/service-image` | JWT (`admin`, not blocked) | Validate and upload service image to ImgBB |
| `GET` | `/api/admin/appointments` | JWT (`admin`, not blocked) | List appointments with status, payment, date, search filters & pagination |
| `GET` | `/api/admin/appointments/:id` | JWT (`admin`, not blocked) | Retrieve full hydrated appointment details |
| `PATCH` | `/api/admin/appointments/:id/confirm` | JWT (`admin`, not blocked) | Confirm a `pending` appointment (`pending -> confirmed`) |
| `PATCH` | `/api/admin/appointments/:id/cancel` | JWT (`admin`, not blocked) | Cancel a `pending` or `confirmed` appointment (preserves history) |
| `PATCH` | `/api/admin/appointments/:id/status` | JWT (`admin`, not blocked) | Update appointment status to `"confirmed"` or `"cancelled"` |
| `GET` | `/api/admin/users` | JWT (`admin`, not blocked) | List registered customers with search, access status filter & pagination |
| `GET` | `/api/admin/users/:id` | JWT (`admin`, not blocked) | Retrieve customer details, stats & recent appointments |
| `PATCH` | `/api/admin/users/:id/block` | JWT (`admin`, not blocked) | Block a customer and revoke active Better Auth sessions |
| `PATCH` | `/api/admin/users/:id/unblock` | JWT (`admin`, not blocked) | Restore access for a blocked customer |
| `GET` | `/api/profile` | JWT (`customer` or `admin`, not blocked) | Retrieve authenticated user's safe profile |
| `PATCH` | `/api/profile` | JWT (`customer` or `admin`, not blocked) | Update own `name`, `phone`, and/or `image` URL (strict schema) |
| `POST` | `/api/uploads/profile-image` | JWT (`customer` or `admin`, not blocked) | Validate, upload profile image to ImgBB, and save URL on caller's account |
| `POST` | `/api/payments/checkout` | JWT (`customer`, not blocked, rate-limited) | Create or reuse Stripe Checkout Session for an eligible confirmed unpaid appointment |
| `POST` | `/api/payments/webhook` | Stripe `Stripe-Signature` (raw Buffer body) | Verify Stripe event signature and idempotently record paid/failed outcomes |
| `GET` | `/api/payments/session/:sessionId` | JWT (`customer` owner, not blocked) | Read-only payment session and linked appointment status lookup |
| `GET` | `/api/transactions/my` | JWT (`customer`, not blocked) | Paginated payment history scoped to the authenticated customer |
| `GET` | `/api/admin/transactions` | JWT (`admin`, not blocked) | Strictly read-only admin transaction ledger with status, search, pagination & totals |

## Repositories & Links

- **Backend Repository:** https://github.com/devnajmulislam/rup-chorcha-backend
- **Frontend Repository:** https://github.com/devnajmulislam/rup-chorcha
- **Live Website:** https://rup-chorcha.vercel.app
- **Live Backend API:** https://rup-chorcha-backend.vercel.app
