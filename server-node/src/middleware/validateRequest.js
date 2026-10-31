import { ApiError } from '../utils/errors.js';

const EMAIL_REGEX = /^\S+@\S+\.\S+$/;

export function validateRegister(req, res, next) {
  const { name, email, password } = req.body || {};

  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return next(ApiError.badRequest('Name must be between 2 and 100 characters'));
  }

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return next(ApiError.badRequest('Invalid email format'));
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return next(ApiError.badRequest('Password must be at least 8 characters'));
  }

  req.body.name = name.trim();
  req.body.email = email.toLowerCase().trim();
  next();
}

export function validateLogin(req, res, next) {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
    return next(ApiError.badRequest('Invalid email format'));
  }

  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    return next(ApiError.badRequest('Password is required'));
  }

  req.body.email = email.toLowerCase().trim();
  next();
}

