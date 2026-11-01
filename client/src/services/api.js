const baseUrl = import.meta.env.VITE_API_URL || '';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const headers = { ...options.headers };
  headers['X-Requested-With'] = headers['X-Requested-With'] || 'XMLHttpRequest';
  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const url = `${baseUrl}${path}`;
  let response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      headers,
      ...options,
    });
  } catch (networkErr) {
    throw new ApiError(
      'Network error: unable to connect to server. Please ensure the backend is running.',
      0,
      networkErr.message
    );
  }

  if (response.status === 204) return null;

  const text = await response.text();
  let data = null;
  if (text && text.trim().length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && (data.message || (typeof data.error === 'string' ? data.error : data.error?.message))) ||
      'Something went wrong. Please try again.';
    throw new ApiError(message, response.status, data?.error?.details);
  }

  return data;
}

