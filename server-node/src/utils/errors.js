export class ApiError extends Error {
  constructor(message, status = 500, error = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusCode = status;
    this.error = error;
  }

  static badRequest(message = 'Bad Request') {
    return new ApiError(message, 400, 'Bad Request');
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(message, 401, 'Unauthorized');
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(message, 403, 'Forbidden');
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(message, 404, 'Not Found');
  }

  static conflict(message = 'Conflict') {
    return new ApiError(message, 409, 'Conflict');
  }

  static tooManyRequests(message = 'Too many requests. Please try again later.') {
    return new ApiError(message, 429, 'Too Many Requests');
  }
}

