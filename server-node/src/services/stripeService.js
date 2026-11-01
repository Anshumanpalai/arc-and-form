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
   * Create a refund for a paid order using Stripe Refunds API.
   * Uses persistent idempotencyKey to ensure idempotency.
   */
  static async createRefund({ paymentIntentId, amountCents, reason = 'requested_by_customer', idempotencyKey, metadata = {} } = {}) {
    if (!paymentIntentId) {
      throw ApiError.badRequest('Missing paymentIntentId for Stripe refund');
    }

    const isMock = !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('placeholder');

    if (isMock) {
      if (StripeService._forceRefundFailure) {
        const errorMsg = StripeService._forceRefundErrorMessage || 'Simulated Stripe refund failure';
        throw new ApiError(`Unable to process refund with Stripe: ${errorMsg}`, 502, 'Bad Gateway');
      }

      StripeService._mockPermanentRefunds = StripeService._mockPermanentRefunds || new Map();
      StripeService._mockIdempotencyCache = StripeService._mockIdempotencyCache || new Map();

      // Check if this idempotency key is currently cached in Stripe's short-term (24-hour) cache
      if (idempotencyKey && StripeService._mockIdempotencyCache.has(idempotencyKey)) {
        return StripeService._mockIdempotencyCache.get(idempotencyKey);
      }

      const mockRefund = {
        id: `mock_re_${crypto.randomUUID().replace(/-/g, '')}`,
        status: StripeService._mockRefundStatus || 'succeeded',
        amount: amountCents || 0,
        currency: 'usd',
        paymentIntent: paymentIntentId,
        metadata: {
          ...metadata,
          idempotencyKey,
        },
        createdAt: new Date(),
      };

      // Record in permanent ledger
      StripeService._mockPermanentRefunds.set(mockRefund.id, mockRefund);

      // Record in 24-hour short-term idempotency cache
      if (idempotencyKey) {
        StripeService._mockIdempotencyCache.set(idempotencyKey, mockRefund);
      }

      return mockRefund;
    }

    const stripe = getStripeClient();
    if (!stripe) {
      throw ApiError.badRequest('Stripe client is not configured.');
    }

    try {
      const params = {
        payment_intent: paymentIntentId,
        reason,
        metadata,
      };
      if (amountCents && Number.isInteger(amountCents) && amountCents > 0) {
        params.amount = amountCents;
      }
      const requestOptions = idempotencyKey ? { idempotencyKey } : undefined;
      const refund = await stripe.refunds.create(params, requestOptions);

      return {
        id: refund.id,
        status: refund.status,
        amount: refund.amount,
        currency: refund.currency,
        paymentIntent: refund.payment_intent,
      };
    } catch (err) {
      console.error(`[stripe] Refund failed for payment intent ${paymentIntentId}:`, err.message);
      throw new ApiError(`Unable to process refund with Stripe: ${err.message}`, 502, 'Bad Gateway');
    }
  }

  /**
   * Retrieve refund status by refund ID from Stripe.
   */
  static async getRefund(refundId) {
    if (!refundId) return null;
    const isMock = !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('placeholder');
    if (isMock) {
      StripeService._mockPermanentRefunds = StripeService._mockPermanentRefunds || new Map();
      if (StripeService._mockPermanentRefunds.has(refundId)) {
        return StripeService._mockPermanentRefunds.get(refundId);
      }
      return { id: refundId, status: 'succeeded', amount: 0, currency: 'usd' };
    }
    const stripe = getStripeClient();
    if (!stripe) return null;
    try {
      return await stripe.refunds.retrieve(refundId);
    } catch (err) {
      console.warn(`[stripe] Unable to retrieve refund ${refundId}:`, err.message);
      return null;
    }
  }

  /**
   * List all permanent refunds associated with a Stripe PaymentIntent.
   */
  static async listRefunds({ paymentIntentId } = {}) {
    if (!paymentIntentId) return [];
    const isMock = !env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.includes('placeholder');
    if (isMock) {
      StripeService._mockPermanentRefunds = StripeService._mockPermanentRefunds || new Map();
      const results = [];
      for (const refund of StripeService._mockPermanentRefunds.values()) {
        if (refund.paymentIntent === paymentIntentId || refund.payment_intent === paymentIntentId) {
          results.push(refund);
        }
      }
      return results;
    }
    const stripe = getStripeClient();
    if (!stripe) return [];
    try {
      const response = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
      return response.data || [];
    } catch (err) {
      console.warn(`[stripe] Unable to list refunds for paymentIntent ${paymentIntentId}:`, err.message);
      return [];
    }
  }

  /**
   * Find matching refund for a PaymentIntent by idempotencyKey, orderNumber, or action.
   * Enables reliable long-term recovery even after the 24-hour Stripe idempotency key retention window has expired.
   */
  static async findMatchingRefund({ paymentIntentId, idempotencyKey, orderNumber, action } = {}) {
    const refunds = await StripeService.listRefunds({ paymentIntentId });
    if (!refunds || refunds.length === 0) return null;

    // 1. Direct match on idempotencyKey in metadata
    if (idempotencyKey) {
      const match = refunds.find((r) => r.metadata?.idempotencyKey === idempotencyKey);
      if (match) return match;
    }

    // 2. Match on orderNumber + action
    if (orderNumber && action) {
      const match = refunds.find(
        (r) => r.metadata?.orderNumber === orderNumber && r.metadata?.action === action
      );
      if (match) return match;
    }

    // 3. Match on orderNumber
    if (orderNumber) {
      const match = refunds.find((r) => r.metadata?.orderNumber === orderNumber);
      if (match) return match;
    }

    return null;
  }

  /**
   * Simulate expiration of Stripe's 24-hour idempotency key cache in tests.
   * Leaves the refund in Stripe's permanent records while simulating cache eviction.
   */
  static expireIdempotencyKey(key) {
    if (StripeService._mockIdempotencyCache) {
      StripeService._mockIdempotencyCache.delete(key);
    }
  }

  /**
   * Reset mock refund ledger for test isolation.
   */
  static resetMockLedger() {
    StripeService._mockPermanentRefunds = new Map();
    StripeService._mockIdempotencyCache = new Map();
    StripeService._forceRefundFailure = false;
    StripeService._forceRefundErrorMessage = '';
    StripeService._mockRefundStatus = 'succeeded';
  }

  /**
   * Test helper to set simulated status for new mock refunds.
   */
  static setMockRefundStatus(status = 'succeeded') {
    StripeService._mockRefundStatus = status;
  }

  /**
   * Test helper to force Stripe refund failure in automated tests.
   */
  static setForceRefundFailure(shouldFail = false, message = '') {
    StripeService._forceRefundFailure = shouldFail;
    StripeService._forceRefundErrorMessage = message;
  }

  /**
   * Test helper to generate HMAC-SHA256 signature for Stripe webhook events.
   */
  static generateSignature(payload, secret) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret);
    const signedPayload = `${timestamp}.${payloadStr}`;
    const signature = hmac.update(signedPayload).digest('hex');
    return `t=${timestamp},v1=${signature}`;
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
