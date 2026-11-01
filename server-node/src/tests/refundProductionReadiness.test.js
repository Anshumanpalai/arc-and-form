import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { seedDatabase } from '../seed/seeder.js';
import { StripeService } from '../services/stripeService.js';
import { OrderService } from '../services/orderService.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerUser;
let testProduct;

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'refund-prod-readiness-secret-key-32-chars!';

  await connectDB();
  await seedDatabase({ silent: true });

  customerUser = await User.findOne({ role: 'CUSTOMER' });
  testProduct = await Product.findOne({ slug: 'heavyweight-organic-cotton-tee' });

  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  // Login admin to obtain cookie
  const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@arcandform.com', password: 'Admin@123!' }),
  });
  adminCookie = adminLoginRes.headers.get('set-cookie').split(';')[0];
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

test.beforeEach(() => {
  StripeService.resetMockLedger();
});

// Helper to create order in DB
async function createTestOrder({ status = 'PAID', paymentStatus = 'PAID', stockReserved = true, qty = 2 } = {}) {
  await Product.findByIdAndUpdate(testProduct._id, { $inc: { stock: -qty } });

  const randomNum = Math.floor(100000 + Math.random() * 900000);
  const orderNumber = `AF-${randomNum}`;
  const total = Number((testProduct.price * qty).toFixed(2));

  const order = new Order({
    orderNumber,
    user: customerUser._id,
    status,
    paymentStatus,
    stockReserved,
    total,
    currency: 'usd',
    stripePaymentIntentId: `pi_readiness_${orderNumber}`,
    shippingAddress: {
      fullName: 'Readiness Tester',
      addressLine1: '200 Form Blvd',
      city: 'Portland',
      state: 'OR',
      postalCode: '97201',
      country: 'US',
    },
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: qty,
        unitPrice: testProduct.price,
        subtotal: total,
      },
    ],
  });

  return await order.save();
}

test('Readiness 1: Duplicate refund webhook delivery returns duplicate: true and does not double-count amount', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const totalMinor = Math.round(order.total * 100);
  const eventId = `evt_dup_${Date.now()}`;

  const payload = {
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_${order.orderNumber}`,
        payment_intent: order.stripePaymentIntentId,
        amount: totalMinor,
        amount_refunded: totalMinor,
        currency: 'usd',
      },
    },
  };

  // First delivery
  const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(payload),
  });
  const data1 = await res1.json();
  assert.equal(res1.status, 200);
  assert.equal(data1.received, true);
  assert.notEqual(data1.duplicate, true);

  // Second duplicate delivery
  const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(payload),
  });
  const data2 = await res2.json();
  assert.equal(res2.status, 200);
  assert.equal(data2.received, true);
  assert.equal(data2.duplicate, true);

  // Verify amount is not double-counted
  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.refundDetails.amountRefundedMinor, totalMinor);
  assert.equal(finalOrder.paymentStatus, 'REFUNDED');
});

test('Readiness 2: Concurrent duplicate refund events are serialized without race conditions', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const totalMinor = Math.round(order.total * 100);
  const eventId = `evt_concurrent_${Date.now()}`;

  const payload = JSON.stringify({
    id: eventId,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_${order.orderNumber}`,
        payment_intent: order.stripePaymentIntentId,
        amount: totalMinor,
        amount_refunded: totalMinor,
        currency: 'usd',
      },
    },
  });

  // Send two requests simultaneously
  const [res1, res2] = await Promise.all([
    fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    }),
    fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    }),
  ]);

  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200);

  const [d1, d2] = await Promise.all([res1.json(), res2.json()]);
  // One must be fresh, one must be duplicate
  assert.ok(d1.duplicate === true || d2.duplicate === true);

  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.refundDetails.amountRefundedMinor, totalMinor);
});

test('Readiness 3: Strict validation rejects incorrect PaymentIntent association without modifying order state or inventory', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Webhook specifies correct orderNumber in metadata but WRONG PaymentIntent
  const payload = {
    id: `evt_mismatch_pi_${Date.now()}`,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_evil_${Date.now()}`,
        payment_intent: 'pi_unrelated_attacker_payment_intent',
        amount: Math.round(order.total * 100),
        amount_refunded: Math.round(order.total * 100),
        currency: 'usd',
        metadata: {
          orderNumber: order.orderNumber,
        },
      },
    },
  };

  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(payload),
  });

  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.verified, false);

  // Order state and inventory must remain completely unmodified
  const unmodifiedOrder = await Order.findById(order._id);
  assert.equal(unmodifiedOrder.paymentStatus, 'PAID');
  assert.notEqual(unmodifiedOrder.paymentStatus, 'REFUNDED');
  assert.equal(unmodifiedOrder.refundDetails.amountRefundedMinor, 0);

  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore);
});

test('Readiness 4: Strict validation rejects wrong currency refund event without modifying order state or inventory', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Webhook with EUR currency instead of USD
  const payload = {
    id: `evt_wrong_curr_${Date.now()}`,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_curr_${Date.now()}`,
        payment_intent: order.stripePaymentIntentId,
        amount: Math.round(order.total * 100),
        amount_refunded: Math.round(order.total * 100),
        currency: 'eur', // Mismatched currency
      },
    },
  };

  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  assert.equal(result.verified, false);

  // Order state and inventory must remain completely unmodified
  const unmodifiedOrder = await Order.findById(order._id);
  assert.equal(unmodifiedOrder.paymentStatus, 'PAID');
  assert.equal((await Product.findById(testProduct._id)).stock, stockBefore);
});

test('Readiness 5: Strict validation rejects excessive cumulative refund amount exceeding order total', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const totalMinor = Math.round(order.total * 100);

  // Refund specifies 2x the order total
  const payload = {
    id: `evt_excessive_${Date.now()}`,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_excess_${Date.now()}`,
        payment_intent: order.stripePaymentIntentId,
        amount: totalMinor,
        amount_refunded: totalMinor * 2, // Excessive!
        currency: 'usd',
      },
    },
  };

  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify(payload),
  });

  const result = await res.json();
  assert.equal(result.verified, false);

  // Unmodified
  const unmodifiedOrder = await Order.findById(order._id);
  assert.equal(unmodifiedOrder.paymentStatus, 'PAID');
  assert.equal(unmodifiedOrder.refundDetails.amountRefundedMinor, 0);
});

test('Readiness 6: Refund ID uniqueness ensures repeated refund.updated events do not double-count amountRefundedMinor', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const partialMinor = Math.round((order.total * 100) / 3);
  const refundId = `re_unique_test_${Date.now()}`;

  const payload = {
    type: 'refund.updated',
    data: {
      object: {
        id: refundId,
        payment_intent: order.stripePaymentIntentId,
        amount: partialMinor,
        currency: 'usd',
        status: 'succeeded',
      },
    },
  };

  // Event 1 with unique eventId_A
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({ ...payload, id: `evt_A_${Date.now()}` }),
  });

  // Event 2 with different eventId_B but SAME refund ID
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({ ...payload, id: `evt_B_${Date.now()}` }),
  });

  // Verify refund amount was counted exactly once (not doubled)
  const updatedOrder = await Order.findById(order._id);
  assert.equal(updatedOrder.refundDetails.amountRefundedMinor, partialMinor);
  assert.equal(updatedOrder.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.equal(updatedOrder.refundDetails.refunds.length, 1);
});

test('Readiness 7: Automatic pending-refund recovery reconciles stale REFUND_PENDING order after process crash', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Simulate stale REFUND_PENDING order (e.g. crashed 30 minutes ago)
  const staleRequestedAt = new Date(Date.now() - 30 * 60 * 1000);
  const persistentKey = `ref_cancel_${order.orderNumber}_${order._id}`;

  // Pre-seed Stripe mock ledger with existing succeeded refund for this persistentKey
  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: persistentKey,
    metadata: { orderNumber: order.orderNumber },
  });

  order.paymentStatus = 'REFUND_PENDING';
  order.refundDetails = {
    cancellationIdempotencyKey: persistentKey,
    idempotencyKey: persistentKey,
    refundId: stripeRefund.id,
    status: 'PENDING',
    requestedAt: staleRequestedAt,
  };
  order.updatedAt = staleRequestedAt;
  await order.save();

  // Run automatic recovery mechanism
  const recoveryStats = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.ok(recoveryStats.reconciledCount >= 1);
  assert.ok(recoveryStats.reconciledOrderNumbers.includes(order.orderNumber));

  // Verify DB state reconciled to REFUNDED and stock restored
  const reconciledOrder = await Order.findById(order._id);
  assert.equal(reconciledOrder.status, 'CANCELLED');
  assert.equal(reconciledOrder.paymentStatus, 'REFUNDED');
  assert.equal(reconciledOrder.refundDetails.status, 'SUCCEEDED');
  assert.equal(reconciledOrder.stockReserved, false);

  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore + 2);
});

test('Readiness 8: Recovery worker running more than once is completely idempotent and restores zero extra stock', async () => {
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Run recovery worker a second time immediately
  const secondRunStats = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.equal(secondRunStats.reconciledCount, 0);

  // Stock must remain unchanged
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore);
});

test('Readiness 9: Partial refund followed by full refund correctly transitions status and releases stock only when fully refunded', async () => {
  const order = await createTestOrder({ status: 'CANCELLED', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;
  const totalMinor = Math.round(order.total * 100);
  const halfMinor = Math.round(totalMinor / 2);

  // Step 1: 50% partial refund
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({
      id: `evt_part_1_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: `re_part_1_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount: halfMinor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });

  const midOrder = await Order.findById(order._id);
  assert.equal(midOrder.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.equal(midOrder.stockReserved, true);
  assert.equal((await Product.findById(testProduct._id)).stock, stockBefore); // Stock NOT released

  // Step 2: Remaining 50% refund
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({
      id: `evt_part_2_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: `re_part_2_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount: totalMinor - halfMinor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });

  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.paymentStatus, 'REFUNDED');
  assert.equal(finalOrder.stockReserved, false);
  assert.equal((await Product.findById(testProduct._id)).stock, stockBefore + 2); // Stock released
});

test('Readiness 10: Stale pending refund recovery preserves pending state when Stripe is pending, and never restores inventory on failed refund', async () => {
  // Test 10A: Stripe refund is still pending
  const orderPending = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const stockBeforePending = (await Product.findById(testProduct._id)).stock;
  const staleTime = new Date(Date.now() - 30 * 60 * 1000);
  const keyPending = `ref_cancel_${orderPending.orderNumber}_${orderPending._id}`;

  StripeService.setMockRefundStatus('pending');
  const pendingRefund = await StripeService.createRefund({
    paymentIntentId: orderPending.stripePaymentIntentId,
    amountCents: Math.round(orderPending.total * 100),
    idempotencyKey: keyPending,
  });

  orderPending.paymentStatus = 'REFUND_PENDING';
  orderPending.refundDetails = {
    cancellationIdempotencyKey: keyPending,
    idempotencyKey: keyPending,
    refundId: pendingRefund.id,
    status: 'PENDING',
    requestedAt: staleTime,
  };
  orderPending.updatedAt = staleTime;
  await orderPending.save();

  // Run recovery: Stripe still says 'pending'
  const statsPending = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.ok(statsPending.preservedPendingOrderNumbers.includes(orderPending.orderNumber));

  // Must preserve pending state and NOT release inventory
  const orderStillPending = await Order.findById(orderPending._id);
  assert.equal(orderStillPending.paymentStatus, 'REFUND_PENDING');
  assert.equal(orderStillPending.stockReserved, true);
  assert.equal((await Product.findById(testProduct._id)).stock, stockBeforePending);

  // Test 10B: Stripe refund failed
  const orderFailed = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const stockBeforeFailed = (await Product.findById(testProduct._id)).stock;
  const keyFailed = `ref_cancel_${orderFailed.orderNumber}_${orderFailed._id}`;

  StripeService.setMockRefundStatus('failed');
  const failedRefund = await StripeService.createRefund({
    paymentIntentId: orderFailed.stripePaymentIntentId,
    amountCents: Math.round(orderFailed.total * 100),
    idempotencyKey: keyFailed,
  });

  orderFailed.paymentStatus = 'REFUND_PENDING';
  orderFailed.refundDetails = {
    cancellationIdempotencyKey: keyFailed,
    idempotencyKey: keyFailed,
    refundId: failedRefund.id,
    status: 'PENDING',
    requestedAt: staleTime,
  };
  orderFailed.updatedAt = staleTime;
  await orderFailed.save();

  // Run recovery: Stripe reports failed
  const statsFailed = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.ok(statsFailed.failedOrderNumbers.includes(orderFailed.orderNumber));

  // Must mark REFUND_FAILED and NEVER restore inventory
  const finalFailedOrder = await Order.findById(orderFailed._id);
  assert.equal(finalFailedOrder.paymentStatus, 'REFUND_FAILED');
  assert.equal(finalFailedOrder.stockReserved, true); // Inventory remains untouched
  assert.equal((await Product.findById(testProduct._id)).stock, stockBeforeFailed);
});

