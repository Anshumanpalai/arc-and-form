import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from server-node directory first, fallback to root if present
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || (process.env.npm_lifecycle_event === 'test' ? 'test' : 'development');
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

const parseBool = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value).toLowerCase() === 'true';
};

const parseOrigins = (raw) => {
  const fallback = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
  ];
  if (!raw) return fallback;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : fallback;
};

// Memory DB validation: explicit opt-in only in dev/test, forbidden in production
const useMemoryDbRequested = parseBool(process.env.USE_MEMORY_DB, false);

if (isProduction && useMemoryDbRequested) {
  throw new Error('FATAL: USE_MEMORY_DB is strictly forbidden in production.');
}

const USE_MEMORY_DB = !isProduction && (useMemoryDbRequested || (isTest && !process.env.MONGODB_URI));

// MongoDB URI validation
const MONGODB_URI = process.env.MONGODB_URI || '';

if (isProduction && !MONGODB_URI) {
  throw new Error('FATAL: MONGODB_URI environment variable is required in production.');
}

if (!isProduction && !USE_MEMORY_DB && !MONGODB_URI) {
  throw new Error(
    'Configuration error: MONGODB_URI is not set. For offline development or testing without a local MongoDB service, set USE_MEMORY_DB=true in your environment.'
  );
}

// JWT Secret validation
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : 'arc_and_form_dev_secret_key_change_in_production_min_32_chars');

if (isProduction && (!JWT_SECRET || JWT_SECRET.length < 32)) {
  throw new Error('FATAL: JWT_SECRET must be at least 32 characters in production.');
}

// Stripe & Client URL configuration
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_SUCCESS_URL =
  process.env.STRIPE_SUCCESS_URL || `${CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
const STRIPE_CANCEL_URL =
  process.env.STRIPE_CANCEL_URL || `${CLIENT_URL}/checkout?cancelled=true`;

// Cloudinary Configuration (Phase 6)
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

export const env = Object.freeze({
  PORT: Number.parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV,
  isProduction,
  isTest,
  MONGODB_URI,
  USE_MEMORY_DB,
  JWT_SECRET,
  JWT_EXPIRATION_MS: Number.parseInt(process.env.JWT_EXPIRATION_MS, 10) || 604800000, // 7 days in ms
  COOKIE_NAME: process.env.COOKIE_NAME || 'arc_token',
  COOKIE_SECURE: parseBool(process.env.COOKIE_SECURE, isProduction),
  COOKIE_SAME_SITE: process.env.COOKIE_SAME_SITE || (isProduction ? 'None' : 'Lax'),
  CORS_ALLOWED_ORIGINS: parseOrigins(process.env.CORS_ALLOWED_ORIGINS),
  CLIENT_URL,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_SUCCESS_URL,
  STRIPE_CANCEL_URL,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
});

