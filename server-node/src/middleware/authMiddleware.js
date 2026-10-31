import { env } from '../config/env.js';
import { JwtService } from '../services/jwtService.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/errors.js';

/**
 * Extracts JWT token from cookie or Authorization header.
 */
export function extractToken(req) {
  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    return req.cookies[env.COOKIE_NAME];
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  return null;
}

/**
 * Middleware: Requires valid authentication.
 */
export async function authenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return next(ApiError.unauthorized('Full authentication is required to access this resource'));
  }

  const decoded = JwtService.verifyToken(token);
  if (!decoded) {
    return next(ApiError.unauthorized('Invalid or expired authentication token'));
  }

  try {
    const user = await User.findById(decoded.id || decoded.sub);
    if (!user) {
      return next(ApiError.unauthorized('User account not found'));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: Optionally populates req.user if a valid token is provided.
 */
export async function optionalAuthenticate(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    req.user = null;
    return next();
  }

  const decoded = JwtService.verifyToken(token);
  if (!decoded) {
    req.user = null;
    return next();
  }

  try {
    const user = await User.findById(decoded.id || decoded.sub);
    req.user = user || null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

/**
 * Middleware: Requires ADMIN role.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('Access denied: Administrator privileges required'));
  }
  next();
}

