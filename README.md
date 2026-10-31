# ARC & FORM — Minimalist Architectural Luxury E-Commerce Storefront

<div align="center">

![ARC & FORM Minimalist Luxury E-Commerce Storefront](docs/assets/storefront-hero.jpg)

> **"Modern essentials, architectural form."**  
> *A production-grade full-stack luxury e-commerce portfolio application built with React 18, Node.js, Express, MongoDB (with Spring Boot 3.5 / Java 21 / PostgreSQL dual-backend reference), Stripe Checkout, Cloudinary, Zustand 5, TanStack Query 5, and Tailwind CSS.*

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-brightgreen.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%208-green.svg)](https://www.mongodb.com/)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5.x-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF.svg)](https://stripe.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Media-3448C5.svg)](https://cloudinary.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 🏛️ Architectural Overview & Design Philosophy

**ARC & FORM** is an architectural luxury apparel storefront engineered from the ground up to reflect modern production engineering standards, inspired by the visual language of **Toteme, COS, Aesop, and SSENSE**.

The application features a modern dual-backend architecture where a unified, high-performance React storefront seamlessly interfaces with either a **Node.js / Express / MongoDB** backend or a **Java 21 / Spring Boot 3.5 / PostgreSQL** backend with 100% API contract parity:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARC & FORM ARCHITECTURE                         │
└────────────────────────────────────────────────────────────────────────┘

  CLIENT (Port 5173 / 5175)                       BACKEND (Port 5000)
┌─────────────────────────────┐                 ┌─────────────────────────────┐
│ • React 18 + Vite 6         │                 │ PRIMARY: Node.js + Express  │
│ • React Router v7           │  REST (Cookie)  │ • Mongoose 8 + Transactions │
│ • TanStack Query v5         │ ──────────────> │ • Stripe Node SDK (Webhooks)│
│ • Zustand v5 (Cart / Auth)  │                 │ • Cloudinary Image Uploads  │
│ • Tailwind CSS v3           │                 │ • 110 Comprehensive Tests   │
└─────────────────────────────┘                 └──────────────┬──────────────┘
                                                               │
                                                ┌──────────────┴──────────────┐
                                                │ DUAL-BACKEND REFERENCE:     │
                                                │ • Java 21 + Spring Boot 3.5 │
                                                │ • Spring Security 6 (JWT)   │
                                                │ • Spring Data JPA + Flyway  │
                                                │ • PostgreSQL 16             │
                                                └─────────────────────────────┘
```

---

### Key Engineering Pillars

1. **Server-Side Price Authority**: Client-submitted cart prices and totals are strictly ignored during checkout. Amounts are calculated exclusively from server-side database records in integer minor units (cents/paise) to prevent floating-point drift and price manipulation.
2. **Atomic Inventory Reservation**: Stock decrements run under multi-document ACID transactions with conditional stock guards:
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

| Domain | Node.js Stack (`server-node/`) | Spring Boot Stack (`server/`) |
|---|---|---|
| **Runtime & Language** | Node.js 20+ (ES Modules) | Java 21 (LTS) |
| **Framework** | Express 4.21 | Spring Boot 3.5.x |
| **Database & ODM/ORM** | MongoDB, Mongoose 8 (Replica Set ACID Transactions) | PostgreSQL 16, Hibernate 6, Flyway |
| **Authentication & Security** | JWT (`jsonwebtoken`), BCrypt, HttpOnly Cookies, CORS | Spring Security 6, BCrypt, HttpOnly Cookies |
| **Rate Limiter** | Token bucket / Sliding window per IP | Bucket4j token bucket algorithm |
| **Payments** | Stripe Node SDK (`stripe`), Webhooks | Stripe Java SDK (`stripe-java`), Webhooks |
| **Media Uploads** | Official Cloudinary Node SDK, Multer | Official Cloudinary Java SDK |
| **Testing** | Node.js native test runner (`node:test`, `node:assert`) | JUnit 5, Mockito, MockMvc, AssertJ |
| **Test Suite** | **110 passing automated tests across 16 suites** | Full Spring Boot test suite |

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or higher
- **MongoDB**: Local or hosted MongoDB (e.g. MongoDB Atlas) or set `USE_MEMORY_DB=true` for zero-setup local dev/test
- **Java 21 & Maven** (optional, only if running the Spring Boot backend)

---

### 2. Running the Node.js / Express / MongoDB Backend

```bash
# Navigate to the Node backend directory
cd server-node

# Install dependencies
npm install

# Seed the database with demo accounts, categories, and 20 curated pieces
npm run seed

# Run the automated test suite (110 tests)
npm test

# Launch the development server (with live reload)
npm run dev
```

The Node.js API runs at [`http://localhost:5000`](http://localhost:5000) with a live health check at [`http://localhost:5000/health`](http://localhost:5000/health).

---

### 3. Running the React Storefront

In a separate terminal:

```bash
# Navigate to the frontend directory
cd client

# Install dependencies
npm install

# Launch Vite storefront
npm run dev
```

- **Frontend Storefront**: [`http://localhost:5173`](http://localhost:5173)
- **Studio Administration Dashboard**: [`http://localhost:5173/admin`](http://localhost:5173/admin)

---

### 4. Running the Spring Boot / PostgreSQL Backend (Alternative)

```bash
cd server
./mvnw spring-boot:run
```

- **Interactive Swagger Documentation**: [`http://localhost:5000/swagger-ui.html`](http://localhost:5000/swagger-ui.html)
- **API Health Check**: [`http://localhost:5000/health`](http://localhost:5000/health)

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

### Node.js Backend Suite (`server-node`)
```bash
cd server-node
npm test
```
**Coverage: 110 tests across 16 test suites**:
- **Authentication Flow**: Registration, login, logout, cookie security, password verification.
- **Authorization & RBAC**: Customer isolation, admin route enforcement (`401`/`403`).
- **Product Catalog**: Public browsing, category filtering, search, pagination, admin CRUD.
- **Orders & Inventory**: Transactional stock reservations, concurrency guards, minor unit calculations.
- **Stripe Webhooks**: Cryptographic verification, payment status checks, permanent idempotency, duplicate race resilience.
- **Admin Dashboard**: Revenue aggregation from paid orders, low stock alerts, recent orders.
- **Admin Order Management**: Spring Data `Page` pagination, status transition validation, restocking on cancellation.
- **Cloudinary Media**: MIME type validation, binary magic bytes spoofing detection, file size limits, SDK stream mocking.

### Spring Boot Backend Suite (`server`)
```bash
cd server
./mvnw test
```

### Frontend Client Tests (`client`)
```bash
cd client
npm test
```

---

## 📦 Production Deployment

### Frontend Deployment (Vercel)
1. Link your GitHub repository to [Vercel](https://vercel.com).
2. Set root directory to `client`.
3. Set Build Command to `npm run build` and Output Directory to `dist`.
4. Configure `VITE_API_URL` to your production backend URL.

### Node.js Backend Deployment (Render / Railway / Docker)
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
