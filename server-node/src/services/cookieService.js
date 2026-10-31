import { env } from '../config/env.js';

export class CookieService {
  /**
   * Set secure HttpOnly authentication cookie containing the JWT.
   */
  static setAuthCookie(res, token) {
    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
      maxAge: env.JWT_EXPIRATION_MS,
    });
  }

  /**
   * Clear authentication cookie.
   */
  static clearAuthCookie(res) {
    res.cookie(env.COOKIE_NAME, '', {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

