
# RupChorcha - Backend API

**Backend API for RupChorcha, a salon appointment booking platform.**

This is the Express.js REST API that powers RupChorcha. It handles authentication, salon services, appointments, user management, image uploads, and secure payments.

## Live Links

- **Live Website:** https://rup-chorcha.vercel.app
- **Backend API:** https://rup-chorcha-backend.vercel.app
- **Frontend Repository:** https://github.com/devnajmulislam/rup-chorcha
- **Backend Repository:** https://github.com/devnajmulislam/rup-chorcha-backend

## Features

### Authentication & Security

- Email and password authentication.
- Google sign-in support.
- JWT-based API authentication.
- Role-based access for customers and admins.
- Protected routes and authorization middleware.
- Blocked-user access control and session revocation.
- Request rate limiting and security headers.

### Services Management

- Get available salon services.
- Search and filter services by category.
- Sort services by price, name, and date.
- Pagination support.
- Admin service creation, editing, activation, and deletion.
- Image uploads using ImgBB.

### Appointment Management

- Check available appointment slots.
- Create and manage appointments.
- Validate booking schedules using the Asia/Dhaka timezone.
- Prevent duplicate active bookings for the same customer and time slot.
- Cancel pending appointments.
- Admin appointment confirmation and cancellation.

### Dashboard & User Management

- **Customer** and **admin** dashboard data.
- Appointment and business statistics.
- Customer profile management.
- Profile image uploads.
- Admin customer search and account management.
- Block and unblock customer accounts.

### Payment System

- Stripe Checkout integration.
- Secure webhook signature verification.
- Payment status tracking.
- Duplicate webhook event protection.
- Customer payment history.
- Admin transaction management.

## Technology Stack

| Area | Technologies |
|---|---|
| Runtime | Node.js 24 |
| Backend | Express.js 5 |
| Language | JavaScript (ES Modules) |
| Database | MongoDB Atlas |
| Authentication | Better Auth, JWT, jose |
| Validation | Zod |
| Payments | Stripe |
| Image Hosting | ImgBB |
| Security | Helmet, CORS, Express Rate Limit |
| File Uploads | Multer |
| Deployment | Vercel |

## Project Structure

The backend follows a modular structure to keep routes, controllers, services, and validation logic organized.

```text
rup-chorcha-backend/
├── config/          # Environment, constants, and Stripe setup
├── db/              # MongoDB connection, indexes, and user helpers
├── lib/             # Authentication, JWT, and ImgBB helpers
├── middleware/      # Authentication, validation, uploads, and errors
├── modules/         # Feature-based controllers, services, and validation
│   ├── appointments/
│   ├── dashboard/
│   ├── payments/
│   ├── profile/
│   ├── services/
│   └── users/
├── routes/          # API route definitions
├── scripts/         # Admin account seeding
├── tests/           # Backend integration tests
├── utils/           # Shared utilities
├── .env.example
├── AGENTS.md
├── app.js
└── index.js
```

## Local Installation

### Prerequisites

- Node.js 20.19 or later
- npm
- MongoDB Atlas account
- Stripe account
- ImgBB API key

### 1. Clone the repository

```bash
git clone https://github.com/devnajmulislam/rup-chorcha-backend.git
cd rup-chorcha-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Add the required configuration values to your `.env` file. See the Environment Variables section below.

### 4. Create the admin account

```bash
npm run seed:admin
```

The script uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your environment variables. It is safe to run again without creating duplicate admin accounts.

### 5. Start the server

For development:

```bash
npm run dev
```

For production:

```bash
npm start
```

The local API runs at:

```text
http://localhost:5000
```

## Environment Variables

Configure the following variables in your backend `.env` file.

| Variable | Description |
|---|---|
| `PORT` | Server port (default: `5000`) |
| `NODE_ENV` | Application environment |
| `CLIENT_URL` | Allowed frontend origins |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB_NAME` | Database name |
| `BETTER_AUTH_SECRET` | Better Auth secret |
| `BETTER_AUTH_URL` | Backend authentication URL |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | JWT expiration time |
| `JWT_ISSUER` | JWT issuer |
| `JWT_AUDIENCE` | JWT audience |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ADMIN_EMAIL` | Initial admin email |
| `ADMIN_PASSWORD` | Initial admin password |
| `ADMIN_NAME` | Initial admin display name |
| `STRIPE_SECRET_KEY` | Stripe secret API key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_CURRENCY` | Payment currency (default: `usd`) |
| `IMGBB_API_KEY` | ImgBB image upload API key |
| `MAX_UPLOAD_MB` | Maximum image upload size |
| `CLIENT_APP_URL` | Frontend URL for payment redirects |

Some variables are optional or have defaults. Check `.env.example` for the complete configuration.

**Important:** Never commit your `.env` file or expose secret keys in your repository.

## API Overview

All API responses follow a consistent JSON structure.

**Success response:**

```json
{
  "success": true,
  "data": {}
}
```

**Error response:**

```json
{
  "success": false,
  "message": "Something went wrong",
  "code": "ERROR_CODE"
}
```

### Main API Routes

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Check API and database status |
| ALL | `/api/auth/*` | Authentication and session management |
| POST | `/api/jwt/token` | Generate an API JWT |
| GET | `/api/services` | Get available services |
| GET | `/api/services/:id` | Get service details |
| GET | `/api/services/:id/availability` | Check appointment availability |
| POST | `/api/appointments` | Create an appointment |
| GET | `/api/appointments/my` | Get customer appointments |
| PATCH | `/api/appointments/my/:id/cancel` | Cancel an appointment |
| GET | `/api/dashboard/customer` | Customer dashboard data |
| GET | `/api/dashboard/admin` | Admin dashboard data |
| `/api/admin/services` | Admin | Manage salon services |
| `/api/admin/appointments` | Admin | Manage appointments |
| `/api/admin/users` | Admin | Manage customer accounts |
| `/api/profile` | Customer/Admin | Manage own profile |
| POST | `/api/payments/checkout` | Create Stripe Checkout session |
| POST | `/api/payments/webhook` | Verify Stripe payment events |
| GET | `/api/transactions/my` | Get customer payment history |
| GET | `/api/admin/transactions` | View payment transactions |

For the complete endpoint list, access rules, and supported methods, check the route files in the `routes/` directory.

## Testing

Run the backend integration tests:

```bash
npm test
```

Check the API health endpoint after starting the server:

```text
http://localhost:5000/api/health
```

## Deployment

The backend is deployed on Vercel and uses MongoDB Atlas for database storage.

When deploying your own instance:

1. Push the backend repository to GitHub.
2. Import the repository into Vercel.
3. Configure all required environment variables in Vercel.
4. Set the production frontend URL in `CLIENT_URL` and `CLIENT_APP_URL`.
5. Configure the Stripe webhook endpoint and signing secret.
6. Deploy and verify the `/api/health` endpoint.

## Notes

- Appointment schedules use the `Asia/Dhaka` timezone.
- Appointment dates are stored in UTC.
- Payment amounts are stored in integer cents.
- Stripe webhook events are verified using the raw request body.
- Customer and admin access is enforced on the server.
- MongoDB credentials and API secrets are never exposed to frontend code.

---

Built as part of my journey to improve my full-stack development skills.
