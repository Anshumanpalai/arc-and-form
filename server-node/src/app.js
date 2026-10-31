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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(configureRoutes) {
  const app = express();

  // Basic security & parsing
  app.disable('x-powered-by');

  // CORS matching Spring Boot configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (env.CORS_ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept'],
      maxAge: 3600,
    })
  );

  app.use(cookieParser());

  // Webhook routes mounted BEFORE global express.json() to preserve raw payload
  app.use('/api/webhooks', webhookRoutes);

  // Global JSON parser for REST API routes
  app.use(express.json());

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

