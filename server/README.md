# Spring Boot Server

The API is a Spring Boot service backed by MongoDB.

## Setup

1. Copy `.env.example` to `.env` and provide a MongoDB connection string and JWT secret.
2. Install Java 25 (the current LTS release) and Maven 3.9+.
3. From this directory, run `mvn spring-boot:run`.

The seed command is safe to rerun: it upserts records by stable slugs/email.

## Current API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/products` — accepts `page`, `limit`, `search`, `category`, and `sort` (`newest`, `price_asc`, or `price_desc`)
- `GET /api/products/:slug`
- `GET /api/categories`

Authentication uses a signed JWT in an httpOnly cookie. The API enables Helmet, strict CORS, request-size limits, and global plus authentication-specific rate limits.

## Current models

- `User`: role-aware account with hashed-password helpers
- `Category`: slugged catalog grouping
- `Product`: price-in-cents, inventory, image metadata, and publish status
- `Order`: immutable product/price snapshots, shipping address, fulfillment/payment state, and Stripe identifiers
