import { User } from '../models/User.js';
import { JwtService } from './jwtService.js';
import { ApiError } from '../utils/errors.js';

export class AuthService {
  /**
   * Register a new customer account.
   * Public registration always assigns CUSTOMER role to prevent privilege escalation.
   */
  static async register({ name, email, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const passwordHash = await User.hashPassword(password);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'CUSTOMER', // Strict privilege enforcement
    });

    const token = JwtService.generateToken(user);
    return { user, token };
  }

  /**
   * Authenticate a user (Customer or Admin) with email and password.
   */
  static async login({ email, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const token = JwtService.generateToken(user);
    return { user, token };
  }

  /**
   * Fetch current user profile.
   */
  static async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return user;
  }
}

