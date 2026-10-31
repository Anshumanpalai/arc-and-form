# ARC & FORM — Minimalist Architectural Luxury E-Commerce Storefront

<div align="center">

![ARC & FORM Minimalist Luxury E-Commerce Storefront](docs/assets/storefront-hero.jpg)

> **"Modern essentials, architectural form."**  
> *A production-grade full-stack luxury apparel storefront inspired by architectural minimalism, engineered with React 18, Node.js, Express, MongoDB (Mongoose 8), Stripe Checkout, Cloudinary, Zustand 5, TanStack Query 5, and Tailwind CSS.*

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%208-green.svg)](https://www.mongodb.com/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF.svg)](https://stripe.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Media-3448C5.svg)](https://cloudinary.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 🏛️ Architectural Overview & Design Philosophy

**ARC & FORM** is an architectural luxury apparel storefront engineered from the ground up to reflect modern production engineering standards, inspired by the visual language of **Toteme, COS, Aesop, and SSENSE**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARC & FORM ARCHITECTURE                         │
└────────────────────────────────────────────────────────────────────────┘

  CLIENT (Port 5173 / 5175)                       BACKEND (Port 5000)
┌─────────────────────────────┐                 ┌─────────────────────────────┐
│ • React 18 + Vite 6         │                 │ • Node.js 20+ (ES Modules)  │
│ • React Router v7           │  REST (Cookie)  │ • Express 4.21 REST API     │
│ • TanStack Query v5         │ ──────────────> │ • Mongoose 8 (MongoDB)      │
│ • Zustand v5 (Cart / Auth)  │                 │ • Stripe Node SDK (Webhooks)│
│ • Tailwind CSS v3           │                 │ • Cloudinary Image Uploads  │
└─────────────────────────────┘                 └──────────────┬──────────────┘
                                                               │
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │          MONGODB            │
                                                │   (Atlas / Local / Replica) │
                                                └─────────────────────────────┘
```

---

### Key Engineering Pillars

1. **Server-Side Price Authority**: Client-submitted cart prices and totals are strictly ignored during checkout. Subtotals and grand totals are calculated exclusively from server-side database records in integer minor units (cents/paise) to prevent floating-point drift and price tampering.
2. **Atomic Inventory Reservation**: Stock decrements execute under MongoDB multi-document ACID transactions with conditional stock guards:
   - Prevents overselling and race conditions under concurrent checkouts.
   - If payment session generation fails, reserved inventory is rolled back immediately.
3. **Permanent Stripe Webhook Idempotency**: Stripe webhook events are recorded in a dedicated idempotency ledger collection with a permanent unique index on `eventId`. Duplicate deliveries (e.g. from network retries) return `200 OK` idempotently without duplicate stock decrements or order re-processing.
4. **Strict Cryptographic Signature Verification**: Stripe webhook events require valid HMAC-SHA256 signatures (`Stripe-Signature`), verified cryptographically against `STRIPE_WEBHOOK_SECRET`. Test signature bypasses are strictly forbidden in production.
5. **Stateless JWT in HttpOnly Cookies**: Session tokens are isolated inside `httpOnly`, `SameSite=Lax` (or `None` with `Secure` in production) cookies (`arc_token`), eliminating client-side JavaScript XSS token exposure.
6. **Authentication Rate Limiting**: Authentication routes (`/api/auth/**`) are governed by an IP-based sliding window rate limiter (10 req/min per IP) to guard against brute-force attacks.
7. **Cloudinary Asset Pipeline with Binary Magic Byte Checks**: Product asset uploads enforce a 5MB limit, MIME type whitelisting, and binary magic byte header validation (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `52 49 46 46...57 45 42 50`, GIF `47 49 46 38`), preventing MIME-spoofing attacks.
8. **Automated Reservation Expiry Recovery**: An unref background scheduler periodically scans and releases reserved inventory from abandoned pending checkout sessions.
9. **Studio Administration Dashboard & Safe State Machine**: Admin endpoints (`/api/admin/**`) provide real-time gross revenue metrics (calculated strictly from successfully paid orders), low stock alerts, paginated order fulfillment, and strict state transitions preventing unpaid orders from being marked as paid.

---

## 🧰 Tech Stack Matrix

| Domain | Technology |
|---|---|
| **Frontend** | React 18, Vite 6, Tailwind CSS v3, React Router v7, TanStack Query v5, Zustand v5, Lucide Icons |
| **Backend** | Node.js 20+ (ES Modules), Express 4.21, Mongoose 8, JSONWebToken, Cookie-Parser, CORS |
| **Database** | MongoDB (Replica-set ACID transactions, MongoMemoryReplSet dev/test runner) |
| **Payments** | Stripe Node SDK (`stripe`), Stripe Checkout Sessions, Cryptographically Verified Webhooks |
| **Media Pipeline** | Official Cloudinary Node SDK, Multer (Memory Storage), Magic Byte Signature Verification |
| **Rate Limiter** | Sliding-window token bucket per IP address (10 req/min) |
| **Testing** | Node.js native test runner (`node:test`, `node:assert/strict`) — **110 passing automated tests across 16 suites** |

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: Local MongoDB instance, MongoDB Atlas, or Docker (`docker compose up -d`). For zero-setup offline dev/testing, `USE_MEMORY_DB=true` spins up an in-memory database automatically.

---

### 2. Clone and Install Dependencies

```bash
git clone https://github.com/anshumanpalai/arc-and-form.git
cd arc-and-form

# Install all workspace dependencies (root, backend, and frontend)
npm install
```

---

### 3. Seed Database & Launch the Full Application

```bash
# Seed the database with demo accounts, categories, and 20 curated pieces
npm run seed

# Launch both backend API (port 5000) and frontend storefront (port 5173) concurrently
npm run dev
```

- **Frontend Storefront**: [`http://localhost:5173`](http://localhost:5173)
- **Studio Administration Dashboard**: [`http://localhost:5173/admin`](http://localhost:5173/admin)
- **Backend API Health Check**: [`http://localhost:5000/health`](http://localhost:5000/health)

---

## 🔑 Demo Seed Accounts

The seeder automatically populates 4 categories and 20 architectural pieces, along with two ready-to-test accounts:

| Role | Email | Password | Access Surface |
|---|---|---|---|
| **Administrator** | `admin@arcandform.com` | `Admin@123!` | `/admin` (Studio Operations, Inventory CRUD, Order Management, Image Uploads) |
| **Customer** | `customer@arcandform.com` | `Customer@123!` | Storefront, Shopping Bag, Stripe Checkout, Order History (`/orders`) |

---

## 🗄️ Database Models & Collections (MongoDB)

Defined in [`server-node/src/models/`](server-node/src/models/):

- **`User`**: Customer & Administrator profiles with BCrypt password hashes and role validation (`CUSTOMER` / `ADMIN`).
- **`Category`**: Catalog categories (`Essentials`, `Outerwear`, `Denim & Trousers`, `Home & Desk`) with unique slugs.
- **`Product`**: Catalog pieces with prices, inventory levels, category references, sizes, images, and optimistic concurrency.
- **`Order`**: Order headers tracking human-readable order numbers (`AF-XXXXXX`), customer references, shipping address, status (`PENDING`, `PAID`, `SHIPPED`, `DELIVERED`, `CANCELLED`), carrier tracking numbers, and Stripe session/payment intent IDs.
- **`ProcessedEvent`**: Permanent Stripe webhook idempotency ledger with a unique index on `eventId` preventing duplicate transactions.

---

## 🧪 Running Automated Tests

Run the full end-to-end automated test suite with a single command from the root:

```bash
npm test
```

### Coverage: 110 tests across 16 test suites
- **Authentication Flow**: Customer registration, login, logout, cookie security, password verification.
- **Authorization & RBAC**: Customer isolation, admin route enforcement (`401`/`403`).
- **Product Catalog**: Public browsing, category filtering, search, pagination, admin CRUD.
- **Orders & Inventory**: Transactional stock reservations, concurrency guards, minor unit calculations.
- **Stripe Webhooks**: Cryptographic verification, payment status checks, permanent idempotency, duplicate race resilience.
- **Admin Dashboard**: Revenue aggregation from paid orders, low stock alerts, recent orders.
- **Admin Order Management**: Paginated admin views, status transition validation, restocking on cancellation.
- **Cloudinary Media**: MIME type validation, binary magic bytes spoofing detection, file size limits, SDK stream mocking.
- **Frontend Client Tests**: Cart persistence, threshold calculations, and currency formatting.

---

## 📦 Production Deployment

### Frontend Deployment (Vercel)
1. Link your GitHub repository to [Vercel](https://vercel.com).
2. Set root directory to `client`.
3. Set Build Command to `npm run build` and Output Directory to `dist`.
4. Configure `VITE_API_URL` to your production backend URL.

### Backend Deployment (Render / Railway / Docker)
Deploy from `server-node/` with environment variables:
```bash
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/arcandform?retryWrites=true&w=majority
JWT_SECRET=your_minimum_32_character_production_secret
COOKIE_SECURE=true
COOKIE_SAME_SITE=None
CLIENT_URL=https://your-storefront.vercel.app
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

---

## 👤 Author

**Anshuman Palai**  
- **GitHub**: [@anshumanpalai](https://github.com/anshumanpalai)  
- **LinkedIn**: [Anshuman Palai](https://www.linkedin.com/in/anshuxdev/)  
- **Email**: [mrgameryt9050@gmail.com](mailto:mrgameryt9050@gmail.com)

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
