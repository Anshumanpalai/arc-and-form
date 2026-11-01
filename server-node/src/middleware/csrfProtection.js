import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * CSRF Protection Middleware for Cookie-Authenticated State-Changing Endpoints.
 *
 * Enforces:
 * 1. Safe HTTP methods (GET, HEAD, OPTIONS) are exempt.
 * 2. Cryptographically signed webhooks (/api/webhooks/*) are exempt.
 * 3. Strict Origin and Referer validation against explicit CORS allowlist.
 * 4. Custom request header validation (X-Requested-With or X-CSRF-Token) for cookie-authenticated mutations.
 * 5. Rejection of wildcard origins when credentials are used.
 */
export function csrfProtection(req, res, next) {
  // 1. Safe methods do not mutate state
  const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // 2. Stripe Webhook endpoints rely on cryptographic HMAC signatures (stripe-signature), not cookies
  if (req.originalUrl.startsWith('/api/webhooks') || req.path.startsWith('/api/webhooks')) {
    return next();
  }

  const originHeader = req.headers.origin;
  const refererHeader = req.headers.referer;
  const secFetchSite = req.headers['sec-fetch-site'];

  // 3. Strict Origin header validation (when sent by browser or client)
  if (originHeader) {
    if (originHeader === '*') {
      return next(ApiError.forbidden('CSRF validation failed: wildcard "*" origin is prohibited with credentials'));
    }

    if (!env.CORS_ALLOWED_ORIGINS.includes(originHeader)) {
      return next(ApiError.forbidden(`CSRF validation failed: untrusted origin '${originHeader}'`));
    }
  } else if (refererHeader) {
    // Fallback: validate referer origin if origin header is omitted
    try {
      const refererOrigin = new URL(refererHeader).origin;
      if (!env.CORS_ALLOWED_ORIGINS.includes(refererOrigin)) {
        return next(ApiError.forbidden(`CSRF validation failed: untrusted referer origin '${refererOrigin}'`));
      }
    } catch {
      return next(ApiError.forbidden('CSRF validation failed: malformed referer header'));
    }
  }

  // 4. Anti-CSRF Header Verification for Cookie-Authenticated Mutations
  const hasAuthCookie = Boolean(req.cookies && req.cookies[env.COOKIE_NAME]);
  if (hasAuthCookie) {
    // If browser marks request explicitly as cross-site without an approved origin, reject
    if (secFetchSite === 'cross-site' && !originHeader) {
      return next(ApiError.forbidden('CSRF validation failed: untrusted cross-site request'));
    }

    const hasCustomHeader = Boolean(
      req.headers['x-requested-with'] ||
      req.headers['x-csrf-token'] ||
      req.headers['authorization']
    );

    // In production or cross-site contexts, require an explicit allowed Origin or custom anti-CSRF header
    if (env.isProduction && !originHeader && !hasCustomHeader) {
      return next(
        ApiError.forbidden(
          'CSRF validation failed: cookie-authenticated requests require an explicit allowed Origin or X-Requested-With header'
        )
      );
    }
  }

  next();
}
