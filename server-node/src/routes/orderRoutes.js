import { Router } from 'express';
import { OrderService } from '../services/orderService.js';
import { authenticate, optionalAuthenticate } from '../middleware/authMiddleware.js';

const router = Router();

// 1. Checkout (requires authenticated user)
router.post('/checkout', authenticate, async (req, res, next) => {
  try {
    const result = await OrderService.createCheckout(req.body, req.user._id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// 2. Order History (requires authenticated user)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await OrderService.getOrdersForUser(
      req.user._id,
      req.query.page,
      req.query.limit
    );
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 3. Order Details by order number (with customer isolation and admin override)
router.get('/:orderNumber', optionalAuthenticate, async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : null;
    const isAdmin = req.user && req.user.role === 'ADMIN';

    const order = await OrderService.getOrderByOrderNumber(
      req.params.orderNumber,
      userId,
      isAdmin
    );

    res.status(200).json({ order });
  } catch (err) {
    next(err);
  }
});

export default router;

