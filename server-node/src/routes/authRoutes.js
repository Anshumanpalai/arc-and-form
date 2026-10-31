import { Router } from 'express';
import { AuthService } from '../services/authService.js';
import { CookieService } from '../services/cookieService.js';
import { rateLimitAuth } from '../middleware/rateLimiter.js';
import { validateRegister, validateLogin } from '../middleware/validateRequest.js';
import { optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/register', rateLimitAuth, validateRegister, async (req, res, next) => {
  try {
    const { user, token } = await AuthService.register(req.body);
    CookieService.setAuthCookie(res, token);
    res.status(201).json({
      user: user.toJSON(),
      message: 'Registration successful',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', rateLimitAuth, validateLogin, async (req, res, next) => {
  try {
    const { user, token } = await AuthService.login(req.body);
    CookieService.setAuthCookie(res, token);
    res.status(200).json({
      user: user.toJSON(),
      message: 'Login successful',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  CookieService.clearAuthCookie(res);
  res.status(200).json({
    user: null,
    message: 'Logged out successfully',
  });
});

router.get('/me', optionalAuthenticate, (req, res) => {
  if (!req.user) {
    return res.status(200).json(null);
  }
  res.status(200).json(req.user.toJSON());
});

export default router;

