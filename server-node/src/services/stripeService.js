import Stripe from 'stripe';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

let stripeClient = null;

function getStripeClient() {
  if (!stripeClient && env.STRIPE_SECRET_KEY && !env.STRIPE_SECRET_KEY.includes('placeholder')) {
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

export class StripeService {
  /**
   * Create a Stripe Checkout session.
   * If secret key is placeholder / dev mock, returns a functional mock checkout session
   * matching Spring Boot's development fallback.
   */
  static async createCheckoutSession(order, items) {
    const isMock = !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('placeholder');

    if (isMock) {
      const mockSessionId = `mock_cs_${crypto.randomUUID().replace(/-/g, '')}`;
      const mockUrl = env.STRIPE_SUCCESS_URL.replace('{CHECKOUT_SESSION_ID}', mockSessionId) +
        `&order_number=${order.orderNumber}`;
      return {
        sessionId: mockSessionId,
        checkoutUrl: mockUrl,
      };
    }

    const stripe = getStripeClient();
    if (!stripe) {
      throw ApiError.badRequest('Stripe client is not configured.');
    }

    const lineItems = items.map((item) => {
      // Minor units (cents for USD)
      const unitAmountCents = Math.round(item.unitPrice * 100);
      const name = item.selectedSize
        ? `${item.productName} (${item.selectedSize})`
        : item.productName;

      return {
        price_data: {
          currency: order.currency || 'usd',
          unit_amount: unitAmountCents,
          product_data: {
            name,
          },
        },
        quantity: item.quantity,
      };
    });

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        success_url: env.STRIPE_SUCCESS_URL,
        cancel_url: env.STRIPE_CANCEL_URL,
        client_reference_id: order.orderNumber,
        metadata: {
          orderNumber: order.orderNumber,
          orderId: order._id.toString(),
        },
        line_items: lineItems,
      });

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (err) {
      console.error(`[stripe] Checkout session creation failed for order ${order.orderNumber}:`, err.message);
      throw new ApiError(`Unable to initiate payment with Stripe: ${err.message}`, 502, 'Bad Gateway');
    }
  }

  /**
   * Expire an active Stripe checkout session (for rollback/cancellation).
   */
  static async expireSession(sessionId) {
    if (!sessionId || sessionId.startsWith('mock_cs_')) return;
    const stripe = getStripeClient();
    if (!stripe) return;

    try {
      await stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      console.warn(`[stripe] Unable to expire session ${sessionId}:`, err.message);
    }
  }

  /**
   * Verify and construct a Stripe webhook event from raw body and signature header.
   */
  static constructWebhookEvent(rawBody, sigHeader) {
    if (!sigHeader || typeof sigHeader !== 'string') {
      throw ApiError.badRequest('Missing Stripe-Signature header');
    }

    // Explicit test signature bypass for automated test harnesses (strictly forbidden in production)
    if (!env.isProduction && sigHeader === 'test-signature') {
      try {
        const payloadStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
        return JSON.parse(payloadStr);
      } catch (err) {
        throw ApiError.badRequest(`Invalid JSON payload: ${err.message}`);
      }
    }

    // In all other cases, enforce cryptographic webhook signature verification
    const secret = env.STRIPE_WEBHOOK_SECRET;
    if (!secret || secret.includes('placeholder')) {
      // If no valid webhook secret is configured and not test-signature, reject
      throw ApiError.badRequest('Invalid Stripe webhook signature');
    }

    try {
      const stripe = getStripeClient() || new Stripe('sk_test_mock_for_webhooks');
      return stripe.webhooks.constructEvent(rawBody, sigHeader, secret);
    } catch (err) {
      throw ApiError.badRequest(`Invalid Stripe webhook signature: ${err.message}`);
    }
  }
}
