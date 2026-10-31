# Client

React storefront built with Vite, React Router, TanStack Query, Tailwind CSS, and Zustand.

## Setup

1. Copy `.env.example` to `.env`.
2. From the repository root run `npm install`.
3. Start the API, then run `npm run dev --workspace=client`.

The cart is persisted locally and is intentionally treated as a convenience layer. The server will re-fetch product prices and stock before checkout.
