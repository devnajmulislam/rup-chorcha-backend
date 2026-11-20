# RupChorcha — Backend API

Backend REST API server for the **RupChorcha** salon appointment booking platform (`Assignment 9 - Category 002`).

## Project Status

- **Implemented (Step 1 — Part A Foundation):** Express 5 application factory, environment validation, MongoDB Atlas connection & ping helper, idempotent collection index creation (`services`, `appointments`, `transactions`), Helmet security headers, credentialed CORS allowlist, global API rate limiting, JSON/cookie parsing, `GET /api/health`, JSON 404 handler, and central JSON error handler.
- **Planned (Upcoming Steps):** Better Auth + Google OAuth + JWT verification middleware (Part B), public/admin service CRUD & ImgBB uploads, appointment booking & availability APIs, customer/admin dashboard & user management APIs, and Stripe Checkout + raw-body webhook processing.

## Technology Stack

- **Runtime:** Node.js (`>=20.19.0`), JavaScript ESM
- **Framework:** Express `5.3.0`
- **Database:** MongoDB native driver (`mongodb` `7.9.0`) targeting database `rup-chorcha`
- **Security & Middleware:** `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `dotenv`

## Folder Structure

```text
rup-chorcha-backend/
├── config/
│   └── env.js              # Environment parsing and fail-fast validation
├── db/
│   ├── indexes.js          # Idempotent MongoDB indexes for business collections
│   └── mongo.js            # Singleton MongoClient, Db handle, ping, and collections
├── middleware/
│   ├── errorHandler.js     # Central JSON error handler
│   ├── notFound.js         # JSON 404 handler
│   └── rateLimiter.js      # Global /api rate limiter
├── routes/
│   ├── health.routes.js    # GET /api/health
│   └── index.js            # /api router mount
├── utils/
│   ├── ApiError.js         # Operational error class with HTTP status & error code
│   └── apiResponse.js      # Standard { success, data | message } helpers
├── .env.example            # Variable names only (never commit real .env)
├── app.js                  # Express middleware stack and routes
└── index.js                # Server bootstrap, DB/index init, graceful shutdown
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
3. Run the server:
   - Development (auto-reloads on file changes):
     ```bash
     npm run dev
     ```
   - Production:
     ```bash
     npm start
     ```

## Required Environment Variables

Names only — never commit real credentials or secrets to version control.

- `PORT` — HTTP port for the Express server (default: `5000`)
- `NODE_ENV` — `development` or `production`
- `CLIENT_URL` — Comma-separated allowed browser origins (required in production; defaults to `http://localhost:3000` locally)
- `MONGODB_URI` — MongoDB Atlas connection string (legacy `DB_URI` is also accepted as a fallback)
- `MONGODB_DB_NAME` — Target database name (default: `rup-chorcha`)
- `BETTER_AUTH_SECRET` *(Part B)* — Secret key for Better Auth
- `BETTER_AUTH_URL` *(Part B)* — Public/local origin URL of the auth backend
- `JWT_SECRET` *(Part B)* — Signing/verification secret for API JWTs
- `JWT_EXPIRES_IN` *(Part B, optional)* — Token lifetime (e.g. `15m`)
- `GOOGLE_CLIENT_ID` *(Part B)* — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` *(Part B)* — Google OAuth client secret
- `ADMIN_EMAIL` *(Part B)* — Seeded administrator email
- `ADMIN_PASSWORD` *(Part B)* — Seeded administrator password
- `STRIPE_SECRET_KEY` *(Phase 5)* — Stripe secret API key
- `STRIPE_WEBHOOK_SECRET` *(Phase 5)* — Stripe webhook signing secret
- `STRIPE_CURRENCY` *(Phase 5)* — Currency code (`usd`)
- `IMGBB_API_KEY` *(Phase 2)* — Server-only ImgBB upload API key
- `MAX_UPLOAD_MB` *(Phase 2, optional)* — Max image upload size in MB (default: `5`)

## Currently Available Endpoints

Standard JSON contract:
- Success: `{ "success": true, "data": ... }`
- Error: `{ "success": false, "message": "...", "code": "..." }`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Basic service status and health route pointer |
| `GET` | `/api/health` | Verifies active MongoDB connectivity (`200` connected, `503` unavailable) |

## Repositories & Links

- **Backend Repository:** https://github.com/devnajmulislam/rup-chorcha-backend
- **Frontend Repository:** https://github.com/devnajmulislam/rup-chorcha
- **Live Site:** Pending deployment
