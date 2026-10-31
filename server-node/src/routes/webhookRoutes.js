import { Router } from 'express';
import express from 'express';
import { StripeService } from '../services/stripeService.js';
import { OrderService } from '../services/orderService.js';

const router = Router();

// Raw body parser specifically for Stripe webhook signature verification
router.post(
  '/stripe',
  express.raw({ type: '*/*' }),
  async (req, res, next) => {
    try {
      const sigHeader = req.headers['stripe-signature'];
      const rawBody = req.body;

      const event = StripeService.constructWebhookEvent(rawBody, sigHeader);
      const result = await OrderService.handleStripeWebhook(event);

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;

