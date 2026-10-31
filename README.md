# ARC & FORM — Minimalist Architectural Luxury E-Commerce Storefront

<div align="center">

![ARC & FORM Minimalist Luxury E-Commerce Storefront](docs/assets/storefront-hero.jpg)

> **"Modern essentials, architectural form."**  
> *A production-grade full-stack luxury e-commerce portfolio application built with React 18, Spring Boot 3.5 (Java 21), PostgreSQL, Flyway, Stripe Checkout, Zustand 5, TanStack Query 5, and Tailwind CSS.*

[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5.x-brightgreen.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-purple.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-3.4-38B2AC.svg)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## 🏛️ Architectural Overview & Design Philosophy

**ARC & FORM** is an architectural luxury apparel storefront engineered from the ground up to reflect modern production engineering standards, inspired by the visual language of **Toteme, COS, Aesop, and SSENSE**:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARC & FORM ARCHITECTURE                         │
└────────────────────────────────────────────────────────────────────────┘

  CLIENT (Port 5173 / 5175)                       SERVER (Port 5000)
┌─────────────────────────────┐                 ┌─────────────────────────────┐
│ • React 18 + Vite 6         │                 │ • Java 21 + Spring Boot 3.5 │
│ • React Router v7           │  REST (Cookie)  │ • Spring Security 6 (JWT)   │
│ • TanStack Query v5         │ ──────────────> │ • Spring Data JPA + Flyway  │
│ • Zustand v5 (Cart / Auth)  │                 │ • Stripe Java SDK (Webhook) │
│ • Tailwind CSS v3           │                 │ • Cloudinary Image Uploads  │
└─────────────────────────────┘                 └──────────────┬──────────────┘
                                                               │
                                                               ▼
                                                ┌─────────────────────────────┐
                                                │        POSTGRESQL           │
                                                │  (Local Docker / Neon DB)   │
                                                └─────────────────────────────┘
```

### Key Engineering Pillars
1. **Server-Side Price Authority**: Client-submitted cart prices are completely ignored during checkout. Subtotals and grand totals are recalculated directly from database entities to prevent cart tampering.
2. **Atomic Conditional Stock Decrements**: Inventory updates execute atomically via SQL conditional expressions:
   ```sql
   UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty
   ```
   This guarantees zero overselling or race conditions under concurrent checkouts.
3. **Stripe Webhook Idempotency**: Repeated webhook deliveries are cross-referenced against a dedicated `processed_stripe_events` ledger table before decrementing inventory, ensuring zero duplicate deductions.
4. **Stateless JWT in HttpOnly Cookies**: Session tokens are isolated inside `httpOnly`, `SameSite=Lax` cookies, eliminating XSS token theft.
5. **Rate Limiting via Bucket4j**: Authentication endpoints (`/api/auth/**`) are protected by a token bucket rate limiter (10 req/min per IP) to guard against brute-force credential stuffing.
6. **Optimistic Locking**: Catalog pieces utilize Hibernate `@Version` to safeguard against concurrency conflicts during studio inventory updates.
7. **Strict DTO Encapsulation**: JPA entities are never leaked into controllers. All API request and response boundaries use immutable Java 21 records (`record`).

---

## 🧰 Tech Stack Matrix

| Domain | Technology |
|---|---|
| **Frontend** | React 18, Vite 6, Tailwind CSS v3, React Router v7, TanStack Query v5, Zustand v5, Lucide Icons |
| **Backend** | Java 21, Spring Boot 3.5.x, Spring Data JPA (Hibernate 6), Spring Security 6 |
| **Database** | PostgreSQL 16 (Flyway migrations; H2 fallback for zero-dependency local runs) |
| **Payments** | Stripe Java SDK (`stripe-java`), Stripe Checkout Sessions, Cryptographically Verified Webhooks |
| **Media Assets** | Cloudinary Java SDK with image upload and fallback development storage |
| **API Docs** | Springdoc OpenAPI 2.8.5 / Swagger UI (`/swagger-ui.html`) |
| **Rate Limiter** | Bucket4j token bucket algorithm |
| **Testing** | JUnit 5, Mockito, MockMvc, AssertJ, Spring Boot Test |

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
- **Node.js**: v20 or higher
- **Java JDK**: 21 or higher
- **Docker & Docker Compose** (optional for local Postgres; zero-setup in-memory H2 database runs automatically if Docker is omitted)

### 2. Clone and Install Dependencies
```bash
git clone https://github.com/anshumanpalai/arc-and-form.git
cd arc-and-form

# Install client dependencies
npm install
```

### 3. Launch the Application
Run both the Spring Boot backend and the React Vite storefront concurrently with a single command:
```bash
npm run dev
```

- **Frontend Storefront**: [`http://localhost:5173`](http://localhost:5173) (or `http://localhost:5175`)
- **Backend API**: [`http://localhost:5000`](http://localhost:5000)
- **Interactive Swagger Documentation**: [`http://localhost:5000/swagger-ui.html`](http://localhost:5000/swagger-ui.html)
- **API Health Check**: [`http://localhost:5000/health`](http://localhost:5000/health)

---

## 🔑 Demo Seed Accounts

The application automatically seeds a catalog of curated architectural pieces across 4 categories upon startup, along with two ready-to-test accounts:

| Role | Email | Password | Access Surface |
|---|---|---|---|
| **Administrator** | `admin@arcandform.com` | `Admin@123!` | `/admin` (Studio Operations, Inventory CRUD, Order Management) |
| **Customer** | `customer@arcandform.com` | `Customer@123!` | Storefront, Shopping Bag, Stripe Checkout, Order History (`/orders`) |

---

## 🗄️ Database Schema & Relational Design

The database schema is managed via **Flyway** in `server/src/main/resources/db/migration/V1__init.sql`:

- `users`: Customer & Administrator profiles with BCrypt password hashes and roles (`CUSTOMER` / `ADMIN`).
- `categories`: Catalog categories (`Essentials`, `Outerwear`, `Denim & Trousers`, `Accessories`) with unique slugs.
- `products`: Catalog pieces with prices, stock levels, featured flag, and `@Version` optimistic locking column.
- `product_sizes` & `product_images`: Element collection tables with foreign keys and cascading deletes.
- `orders`: Order header tracking order number (`AF-XXXXXX`), user association, shipping destination, order status, carrier tracking number, and Stripe session ID.
- `order_items`: Snapshot line items preserving purchase-time unit prices and selected sizes.
- `processed_stripe_events`: Dedicated idempotency ledger storing processed Stripe webhook event IDs.

---

## 🧪 Running Automated Tests

### Backend Unit & Integration Tests (JUnit 5 & MockMvc)
```bash
cd server
./mvnw test
```
**Coverage:**
- **`AuthServiceTest`**: Password hashing, registration, duplicate rejection (409), invalid credentials (401), rate limiting.
- **`OrderServiceTest`**: Server-side price authority, inventory sufficiency, atomic conditional decrements, idempotency ledger.
- **`AdminControllerSecurityTest`**: RBAC permissions (`ROLE_ADMIN` vs `ROLE_CUSTOMER` vs unauthenticated).
- **`ProductControllerTest`**: Pagination, category filtering, search, and detail lookup.
- **`WebhookControllerTest`**: Cryptographic Stripe signature verification and checkout session handling.

### Frontend Unit Tests
```bash
cd client
npm test
```
Validates floating-point currency calculations, free shipping threshold progress, and cart accumulation.

---

## 📦 Production Deployment

### Frontend Deployment (Vercel)
1. Link your GitHub repository to [Vercel](https://vercel.com).
2. Set root directory to `client`.
3. Set Build Command to `npm run build` and Output Directory to `dist`.
4. Configure `VITE_API_URL` to your production backend URL.

### Backend Deployment (Render / Railway / Docker)
Deploy using the multi-stage `server/Dockerfile`:
```bash
# Build the production Docker image
docker build -t arc-and-form-api ./server

# Run container
docker run -p 5000:5000 \
  -e SPRING_PROFILES_ACTIVE=prod \
  -e DATABASE_URL="jdbc:postgresql://your-host.neon.tech/arc_and_form?sslmode=require" \
  -e DB_USER="your_user" \
  -e DB_PASSWORD="your_password" \
  -e JWT_SECRET="your_64_character_hex_secret" \
  -e STRIPE_SECRET_KEY="sk_live_..." \
  -e STRIPE_WEBHOOK_SECRET="whsec_..." \
  arc-and-form-api
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
