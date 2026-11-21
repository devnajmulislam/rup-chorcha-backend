# RupChorcha — Backend API

Backend REST API server for the **RupChorcha** salon appointment booking platform (`Assignment 9 - Category 002`).

## Project Status

- **Implemented (Step 1 Part A, Step 1 Part B, and Step 2A):**
  - Express 5 application factory, environment validation, MongoDB Atlas connection & ping helper, idempotent collection index creation (`services`, `appointments`, `transactions`), Helmet security headers, credentialed CORS allowlist, global/auth/upload rate limiting, JSON/cookie/Multer parsing, `GET /api/health`, JSON 404 handler, and central JSON error handler.
  - Better Auth mounted at `/api/auth/*splat` with MongoDB adapter, email/password authentication (minimum 6 chars with uppercase & lowercase enforcement), Google OAuth env support, server-enforced `role` (`customer` default on all public sign-ups) and `isBlocked` fields, `phone` field, blocked-user session hook, `jose` HS256 JWT issuance/verification (`POST /api/jwt/token`, `GET /api/jwt/me`), `requireAuth` / `requireRole` / `requireNotBlocked` middleware, and idempotent `npm run seed:admin`.
  - Public Services API (`GET /api/services`, `GET /api/services/:id`) with active-only enforcement, escaped search, category filtering, price/name/date sorting, and skip/limit pagination.
  - Protected Admin Services API (`/api/admin/services*` with JSON and multipart support, safe hard-delete vs. soft-deactivate when referenced by appointments) and server-side ImgBB image upload endpoint (`POST /api/admin/uploads/service-image`).
- **Planned (Upcoming Steps):** Appointment booking & availability APIs, customer/admin dashboard & user management APIs, and Stripe Checkout + raw-body webhook processing.

## Technology Stack

- **Runtime:** Node.js (`>=20.19.0`), JavaScript ESM
- **Framework:** Express `5.3.0`
- **Database:** MongoDB native driver (`mongodb` `7.9.0`) targeting database `rup-chorcha`
- **Authentication, JWT & Validation:** `better-auth`, `@better-auth/mongo-adapter`, `jose` (HS256 JWT), `zod`
- **Uploads & Security Middleware:** `multer` (memory storage + magic-byte validation), ImgBB API integration, `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `dotenv`

## Folder Structure

```text
rup-chorcha-backend/
├── config/
│   ├── constants.js        # Shared categories, sort options, image hosts, pagination & limits
│   └── env.js              # Environment parsing and fail-fast validation
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
│   └── services/
│       ├── services.controller.js
│       ├── services.service.js
│       └── services.validation.js
├── routes/
│   ├── admin.services.routes.js  # Admin service CRUD & status routes
│   ├── admin.uploads.routes.js   # Admin ImgBB upload route
│   ├── health.routes.js          # GET /api/health
│   ├── index.js                  # /api router mount
│   ├── jwt.routes.js             # JWT issuance & role-verification endpoints (/api/jwt/*)
│   └── services.routes.js        # Public service list & detail routes (/api/services*)
├── scripts/
│   └── seed-admin.js       # Secure idempotent admin seeding CLI (npm run seed:admin)
├── tests/
│   └── services-and-uploads.test.js # Integration & unit tests (npm test)
├── utils/
│   ├── ApiError.js         # Operational error class with HTTP status & error code
│   ├── apiResponse.js      # Standard { success, data | message } helpers
│   ├── password.js         # Zod password rules & role normalization
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
<BETTER_AUTH_URL>/api/auth/callback/google
```

(Local default: `http://localhost:5000/api/auth/callback/google`, or your deployed domain when routed through a same-origin frontend proxy.)

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
- `STRIPE_SECRET_KEY` *(Phase 5)* — Stripe secret API key
- `STRIPE_WEBHOOK_SECRET` *(Phase 5)* — Stripe webhook signing secret
- `STRIPE_CURRENCY` *(Phase 5)* — Currency code (`usd`)
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
| `GET` | `/api/admin/services` | JWT (`admin`, not blocked) | List all services (active & inactive) with filters and pagination |
| `POST` | `/api/admin/services` | JWT (`admin`, not blocked) | Create a service (JSON or multipart file upload) |
| `GET` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Retrieve a service for admin editing |
| `PUT` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Update a service (JSON or optional multipart image replacement) |
| `PATCH` | `/api/admin/services/:id/status` | JWT (`admin`, not blocked) | Activate or deactivate a service |
| `DELETE` | `/api/admin/services/:id` | JWT (`admin`, not blocked) | Hard-delete unreferenced service or deactivate referenced service |
| `POST` | `/api/admin/uploads/service-image` | JWT (`admin`, not blocked) | Validate and upload service image to ImgBB |

## Repositories & Links

- **Backend Repository:** https://github.com/devnajmulislam/rup-chorcha-backend
- **Frontend Repository:** https://github.com/devnajmulislam/rup-chorcha
- **Live Site:** Pending deployment
