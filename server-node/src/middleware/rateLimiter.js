import { ApiError } from '../utils/errors.js';

class RateLimiter {
  constructor(maxRequests = 10, windowMs = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.hits = new Map();

    // Clean up expired entries every 2 minutes
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.hits.entries()) {
        if (now - record.startTime > this.windowMs) {
          this.hits.delete(key);
        }
      }
    }, 2 * 60 * 1000);

    // Ensure timer doesn't prevent Node process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  check(req) {
    const ip = this.getClientIp(req);
    const now = Date.now();
    const record = this.hits.get(ip);

    if (!record || now - record.startTime > this.windowMs) {
      this.hits.set(ip, { count: 1, startTime: now });
      return true;
    }

    if (record.count >= this.maxRequests) {
      return false;
    }

    record.count++;
    return true;
  }

  reset() {
    this.hits.clear();
  }
}

export const authRateLimiter = new RateLimiter(10, 60 * 1000);

export function rateLimitAuth(req, res, next) {
  if (!authRateLimiter.check(req)) {
    return next(
      ApiError.tooManyRequests('Too many authentication requests. Please try again in a minute.')
    );
  }
  next();
}

