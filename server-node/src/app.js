import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { csrfProtection } from './middleware/csrfProtection.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(configureRoutes) {
  const app = express();

  // Basic security & parsing
  app.disable('x-powered-by');

  // Trust first proxy hop for Render deployment topology (SSL termination & trusted req.ip)
  app.set('trust proxy', 1);

  // CORS with strict credentials and explicit allowlist
  app.use(
    cors({
      origin: (origin, callback) => {
        // Reject wildcard '*' explicitly when credentials are enabled
        if (origin === '*') {
          const err = new Error('CORS blocked: wildcard "*" origin is prohibited when credentials are enabled.');
          err.status = 403;
          return callback(err);
        }
        // Allow requests with no origin (e.g. server-to-server, curl, tests)
        if (!origin) return callback(null, true);

        // Check against explicit allowlist
        if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        const err = new Error(`CORS blocked for untrusted origin: ${origin}`);
        err.status = 403;
        return callback(err);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept', 'X-CSRF-Token'],
      maxAge: 3600,
    })
  );

  app.use(cookieParser());

  // Webhook routes mounted BEFORE global express.json() to preserve raw payload
  app.use('/api/webhooks', webhookRoutes);

  // Global JSON parser for REST API routes
  app.use(express.json());

  // CSRF protection for cookie-authenticated state-changing endpoints
  app.use(csrfProtection);

  // Health check routes
  app.use(healthRoutes);

  // Storefront & Admin routes
  app.use('/api/auth', authRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/admin', adminRoutes);

  // Custom route registration hook (for tests or feature extensions)
  if (typeof configureRoutes === 'function') {
    configureRoutes(app);
  }

  // 404 handler
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();

