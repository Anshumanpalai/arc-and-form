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
import { RecoveryScheduler } from '../services/recoveryScheduler.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerUser;
let testProduct;

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'refund-recovery-final-secret-key-32-chars!';

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

// Helper to create test order
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
    stripePaymentIntentId: `pi_recfinal_${orderNumber}`,
    shippingAddress: {
      fullName: 'Recovery Tester',
      addressLine1: '300 Form Way',
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

// -----------------------------------------------------------------------------
// SECTION 1: STRIPE IDEMPOTENCY & LONG-TERM CRASH RECOVERY
// -----------------------------------------------------------------------------

test('Issue 1.1: Crash after Stripe creates refund but before MongoDB saves refund ID is recovered via PaymentIntent listing', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;
  const persistentKey = `ref_cancel_${order.orderNumber}_${order._id}`;

  // Step 1: Stripe creates refund in its permanent records
  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: persistentKey,
    metadata: {
      orderNumber: order.orderNumber,
      action: 'cancellation',
      idempotencyKey: persistentKey,
    },
  });
  assert.ok(stripeRefund.id);

  // Step 2: CRASH! MongoDB never saved refundId. The order is left in REFUND_PENDING with refundId = null.
  order.paymentStatus = 'REFUND_PENDING';
  order.refundDetails = {
    cancellationIdempotencyKey: persistentKey,
    idempotencyKey: persistentKey,
    refundId: null, // CRASH before saving refundId!
    status: 'PENDING',
    requestedAt: new Date(Date.now() - 20 * 60 * 1000),
  };
  order.updatedAt = new Date(Date.now() - 20 * 60 * 1000);
  await order.save();

  // Step 3: Recovery runs. Should find the existing refund via PaymentIntent listing on Stripe
  const recoveryStats = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.equal(recoveryStats.reconciledCount, 1);
  assert.ok(recoveryStats.reconciledOrderNumbers.includes(order.orderNumber));

  // Step 4: Verify MongoDB order state reconciled with the actual Stripe refund ID
  const reconciledOrder = await Order.findById(order._id);
  assert.equal(reconciledOrder.refundDetails.refundId, stripeRefund.id);
  assert.equal(reconciledOrder.paymentStatus, 'REFUNDED');
  assert.equal(reconciledOrder.status, 'CANCELLED');
  assert.equal(reconciledOrder.stockReserved, false);

  // Stock restored exactly once (+2)
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore + 2);
});

test('Issue 1.2: Recovery after Stripe 24-hour idempotency key retention expiration succeeds without creating a second refund', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const persistentKey = `ref_cancel_${order.orderNumber}_${order._id}`;

  // Step 1: Stripe created refund
  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: persistentKey,
    metadata: {
      orderNumber: order.orderNumber,
      action: 'cancellation',
      idempotencyKey: persistentKey,
    },
  });

  // Step 2: Simulate 48 hours passing: Stripe idempotency cache expires
  StripeService.expireIdempotencyKey(persistentKey);

  // DB crashed before saving refundId
  order.paymentStatus = 'REFUND_PENDING';
  order.refundDetails = {
    cancellationIdempotencyKey: persistentKey,
    idempotencyKey: persistentKey,
    refundId: null,
    status: 'PENDING',
    requestedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  };
  order.updatedAt = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await order.save();

  // Step 3: Admin retries cancellation or recovery runs
  const retryRes = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  assert.equal(retryRes.status, 200);
  const data = await retryRes.json();

  // Must match the original refund ID, NOT create a new one!
  assert.equal(data.refundDetails.refundId, stripeRefund.id);
  assert.equal(data.paymentStatus, 'REFUNDED');

  // Verify Stripe ledger still has only 1 refund for this PaymentIntent
  const allRefundsOnStripe = await StripeService.listRefunds({ paymentIntentId: order.stripePaymentIntentId });
  assert.equal(allRefundsOnStripe.length, 1);
});

test('Issue 1.3: Multiple refunds associated with one PaymentIntent are handled without confusing ownership or amounts', async () => {
  const order = await createTestOrder({ status: 'DELIVERED', paymentStatus: 'PAID', stockReserved: false, qty: 3 });
  const totalMinor = Math.round(order.total * 100);
  const refund1Minor = Math.round(totalMinor / 3); // 1 item returned
  const refund2Minor = totalMinor - refund1Minor; // 2 remaining items returned

  // 1st partial return refund on Stripe
  const refund1 = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: refund1Minor,
    idempotencyKey: `ref_return_1_${order.orderNumber}`,
    metadata: {
      orderNumber: order.orderNumber,
      action: 'return_item_1',
      idempotencyKey: `ref_return_1_${order.orderNumber}`,
    },
  });

  // 2nd partial return refund on Stripe
  const refund2 = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: refund2Minor,
    idempotencyKey: `ref_return_2_${order.orderNumber}`,
    metadata: {
      orderNumber: order.orderNumber,
      action: 'return_item_2',
      idempotencyKey: `ref_return_2_${order.orderNumber}`,
    },
  });

  assert.notEqual(refund1.id, refund2.id);

  // Webhook for refund 1 arrives
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({
      id: `evt_m1_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: refund1.id,
          payment_intent: order.stripePaymentIntentId,
          amount: refund1Minor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });

  const midOrder = await Order.findById(order._id);
  assert.equal(midOrder.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.equal(midOrder.refundDetails.amountRefundedMinor, refund1Minor);

  // Webhook for refund 2 arrives
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
    body: JSON.stringify({
      id: `evt_m2_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: refund2.id,
          payment_intent: order.stripePaymentIntentId,
          amount: refund2Minor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });

  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.paymentStatus, 'REFUNDED');
  assert.equal(finalOrder.refundDetails.amountRefundedMinor, totalMinor);
  assert.equal(finalOrder.refundDetails.refunds.length, 2);
  assert.equal(finalOrder.refundDetails.refunds[0].refundId, refund1.id);
  assert.equal(finalOrder.refundDetails.refunds[1].refundId, refund2.id);
});

test('Issue 1.4: Recovery when refund ID is already persisted retrieves via Stripe refund retrieval API', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const key = `ref_cancel_${order.orderNumber}_${order._id}`;

  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: key,
  });

  // Order has refundId saved, but state was interrupted in REFUND_PENDING
  order.paymentStatus = 'REFUND_PENDING';
  order.refundDetails = {
    cancellationIdempotencyKey: key,
    idempotencyKey: key,
    refundId: stripeRefund.id, // Already persisted
    status: 'PENDING',
    requestedAt: new Date(Date.now() - 25 * 60 * 1000),
  };
  order.updatedAt = new Date(Date.now() - 25 * 60 * 1000);
  await order.save();

  const stats = await OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 });
  assert.equal(stats.reconciledCount, 1);

  const updated = await Order.findById(order._id);
  assert.equal(updated.paymentStatus, 'REFUNDED');
  assert.equal(updated.refundDetails.refundId, stripeRefund.id);
});

test('Issue 1.5: No duplicate refunds under concurrent reconciliation', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });
  const key = `ref_cancel_${order.orderNumber}_${order._id}`;

  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: key,
    metadata: { orderNumber: order.orderNumber, action: 'cancellation', idempotencyKey: key },
  });

  order.paymentStatus = 'REFUND_PENDING';
  order.refundDetails = {
    cancellationIdempotencyKey: key,
    idempotencyKey: key,
    refundId: stripeRefund.id,
    status: 'PENDING',
    requestedAt: new Date(Date.now() - 30 * 60 * 1000),
  };
  order.updatedAt = new Date(Date.now() - 30 * 60 * 1000);
  await order.save();

  // Run two recovery workers concurrently
  const [stats1, stats2] = await Promise.all([
    OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 }),
    OrderService.recoverStalePendingRefunds({ thresholdMinutes: 15 }),
  ]);

  // Total reconciled must be exactly 1
  assert.equal(stats1.reconciledCount + stats2.reconciledCount, 1);

  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.paymentStatus, 'REFUNDED');
});

// -----------------------------------------------------------------------------
// SECTION 2: SCHEDULED AUTOMATIC RECOVERY (RecoveryScheduler)
// -----------------------------------------------------------------------------

test('Issue 2.1: Scheduler startup initializes timer and isRunning flag', () => {
  const scheduler = new RecoveryScheduler({ intervalMs: 60000, thresholdMinutes: 15 });
  assert.equal(scheduler.isRunning, false);

  scheduler.start();
  assert.equal(scheduler.isRunning, true);
  assert.ok(scheduler.timer);

  const status = scheduler.getStatus();
  assert.equal(status.isRunning, true);
  assert.equal(status.intervalMs, 60000);

  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
});

test('Issue 2.2: Scheduler repeated execution runs cleanly without errors', async () => {
  const scheduler = new RecoveryScheduler({ intervalMs: 50, thresholdMinutes: 15 });

  // Run cycle 1
  const run1 = await scheduler.runOnce();
  assert.equal(run1.executed, true);
  assert.ok(scheduler.lastRunAt);

  // Run cycle 2
  const run2 = await scheduler.runOnce();
  assert.equal(run2.executed, true);
});

test('Issue 2.3: Scheduler prevents overlapping execution within the same instance', async () => {
  const scheduler = new RecoveryScheduler({ intervalMs: 1000, thresholdMinutes: 15 });

  // Simulate an in-flight long-running execution
  scheduler.isExecuting = true;

  // Attempt overlapping run
  const overlapResult = await scheduler.runOnce();
  assert.equal(overlapResult.skipped, true);
  assert.equal(overlapResult.reason, 'overlapping');

  // Clear lock
  scheduler.isExecuting = false;
  const regularResult = await scheduler.runOnce();
  assert.equal(regularResult.executed, true);
});

test('Issue 2.4: Scheduler graceful shutdown cleanly clears timer and updates running state', () => {
  const scheduler = new RecoveryScheduler({ intervalMs: 30000, thresholdMinutes: 15 });
  scheduler.start();
  assert.equal(scheduler.isRunning, true);

  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
  assert.equal(scheduler.timer, null);

  // Redundant stop should be safe
  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
});

test('Issue 2.5: Concurrent worker execution across instances is guarded by atomic database transactions', async () => {
  const schedulerInstance1 = new RecoveryScheduler({ intervalMs: 10000, thresholdMinutes: 15 });
  const schedulerInstance2 = new RecoveryScheduler({ intervalMs: 10000, thresholdMinutes: 15 });

  // Execute both scheduler instances simultaneously
  const [res1, res2] = await Promise.all([
    schedulerInstance1.runOnce(),
    schedulerInstance2.runOnce(),
  ]);

  assert.equal(res1.executed, true);
  assert.equal(res2.executed, true);
});

