import { env } from '../config/env.js';

const STATUS_TITLES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

/**
 * 404 Not Found Middleware for unhandled routes.
 */
export function notFoundHandler(req, res, next) {
  const error = new Error(`Resource not found: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
}

/**
 * Centralized Error Handler Middleware.
 * Emits error payload compatible with Spring Boot's ErrorResponse record:
 * { timestamp, status, error, message, path }
 */
export function errorHandler(err, req, res, _next) {
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600
    ? err.status
    : typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
      ? err.statusCode
      : 500;

  const errorTitle = err.error || STATUS_TITLES[status] || 'Internal Server Error';
  const message = status === 500 && env.isProduction
    ? 'An internal server error occurred.'
    : err.message || 'An unexpected error occurred.';

  if (status >= 500) {
    console.error(`[error] 500 at ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(status).json({
    timestamp: new Date().toISOString(),
    status,
    error: errorTitle,
    message,
    path: req.originalUrl,
  });
}

