import { env } from '../config/env.js';

export class CookieService {
  /**
   * Set secure HttpOnly authentication cookie containing the JWT.
   */
  static setAuthCookie(res, token) {
    const isSameSiteNone = String(env.COOKIE_SAME_SITE).toLowerCase() === 'none';
    const secure = env.COOKIE_SECURE || isSameSiteNone || env.isProduction;

    res.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
      maxAge: env.JWT_EXPIRATION_MS,
    });
  }

  /**
   * Clear authentication cookie.
   */
  static clearAuthCookie(res) {
    const isSameSiteNone = String(env.COOKIE_SAME_SITE).toLowerCase() === 'none';
    const secure = env.COOKIE_SECURE || isSameSiteNone || env.isProduction;

    res.cookie(env.COOKIE_NAME, '', {
      httpOnly: true,
      secure,
      sameSite: env.COOKIE_SAME_SITE,
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
  }
}

