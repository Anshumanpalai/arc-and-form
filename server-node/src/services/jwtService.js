import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export class JwtService {
  /**
   * Generate signed JWT token with user details.
   */
  static generateToken(user) {
    const payload = {
      sub: user._id.toString(),
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    // Calculate expiry in seconds matching env.JWT_EXPIRATION_MS
    const expiresInSeconds = Math.floor(env.JWT_EXPIRATION_MS / 1000);

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: expiresInSeconds,
    });
  }

  /**
   * Verify and decode a JWT token. Returns decoded payload or null if invalid.
   */
  static verifyToken(token) {
    try {
      return jwt.verify(token, env.JWT_SECRET);
    } catch {
      return null;
    }
  }
}

