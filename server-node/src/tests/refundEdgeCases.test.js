import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { seedDatabase } from '../seed/seeder.js';
import { StripeService } from '../services/stripeService.js';
import { AdminService } from '../services/adminService.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerUser;
let testProduct;

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'refund-edge-cases-jwt-secret-key-32-chars!';

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
    stripePaymentIntentId: `pi_edge_${orderNumber}`,
    shippingAddress: {
      fullName: 'Edge Case Tester',
      addressLine1: '100 Edge Lane',
      city: 'Seattle',
      state: 'WA',
      postalCode: '98101',
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

test('Edge Case 1: Partial refund via charge.refunded marks order PARTIALLY_REFUNDED and never releases full inventory', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;
  const orderTotalMinor = Math.round(order.total * 100);
  const partialAmountMinor = Math.round(orderTotalMinor / 2); // 50% partial refund

  const webhookPayload = {
    id: `evt_partial_${Date.now()}`,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_partial_${order.orderNumber}`,
        payment_intent: order.stripePaymentIntentId,
        amount: orderTotalMinor,
        amount_refunded: partialAmountMinor,
        currency: 'usd',
        refunds: {
          data: [
            {
              id: `re_part_${order.orderNumber}`,
              status: 'succeeded',
              amount: partialAmountMinor,
            },
          ],
        },
      },
    },
  };

  const webhookRes = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'test-signature',
    },
    body: JSON.stringify(webhookPayload),
  });

  assert.equal(webhookRes.status, 200);

  // DB verification: MUST NOT be marked fully REFUNDED
  const updatedOrder = await Order.findById(order._id);
  assert.equal(updatedOrder.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.notEqual(updatedOrder.paymentStatus, 'REFUNDED');
  assert.equal(updatedOrder.refundDetails.amountRefundedMinor, partialAmountMinor);
  assert.equal(updatedOrder.refundDetails.amount, Number((partialAmountMinor / 100).toFixed(2)));

  // Stock must NOT be restored on partial refund
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore);
  assert.equal(updatedOrder.stockReserved, true);
});

test('Edge Case 2: Multiple sequential refund.updated events accumulate minor units and mark REFUNDED when complete', async () => {
  const order = await createTestOrder({ status: 'CANCELLED', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;
  const totalMinor = Math.round(order.total * 100);
  const firstMinor = Math.round(totalMinor * 0.4); // 40%
  const secondMinor = totalMinor - firstMinor; // Remaining 60%

  // 1st partial refund event
  const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'test-signature',
    },
    body: JSON.stringify({
      id: `evt_seq_1_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: `re_seq_1_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount: firstMinor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });
  assert.equal(res1.status, 200);

  const orderAfterFirst = await Order.findById(order._id);
  assert.equal(orderAfterFirst.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.equal(orderAfterFirst.refundDetails.amountRefundedMinor, firstMinor);
  // Stock still not released because not fully refunded
  assert.equal((await Product.findById(testProduct._id)).stock, stockBefore);

  // 2nd partial refund event completing the refund
  const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'test-signature',
    },
    body: JSON.stringify({
      id: `evt_seq_2_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: `re_seq_2_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount: secondMinor,
          currency: 'usd',
          status: 'succeeded',
        },
      },
    }),
  });
  assert.equal(res2.status, 200);

  const orderAfterSecond = await Order.findById(order._id);
  assert.equal(orderAfterSecond.paymentStatus, 'REFUNDED');
  assert.equal(orderAfterSecond.refundDetails.amountRefundedMinor, totalMinor);
  assert.equal(orderAfterSecond.stockReserved, false);

  // Now that order is fully refunded and CANCELLED, stock is released (+2)
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore + 2);
});

test('Edge Case 3: Out-of-order webhook events (pending arriving after succeeded) never revert refunded status', async () => {
  const order = await createTestOrder({ status: 'CANCELLED', paymentStatus: 'REFUNDED', stockReserved: false, qty: 1 });
  order.refundDetails = {
    status: 'SUCCEEDED',
    refundId: `re_orig_${order.orderNumber}`,
    amount: order.total,
    amountRefundedMinor: Math.round(order.total * 100),
  };
  await order.save();

  // Send an out-of-order 'pending' event from Stripe
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'test-signature',
    },
    body: JSON.stringify({
      id: `evt_ooo_pending_${Date.now()}`,
      type: 'refund.updated',
      data: {
        object: {
          id: `re_ooo_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount: Math.round(order.total * 100),
          currency: 'usd',
          status: 'pending',
        },
      },
    }),
  });

  assert.equal(res.status, 200);

  // Verification: Order must remain REFUNDED and SUCCEEDED
  const finalOrder = await Order.findById(order._id);
  assert.equal(finalOrder.paymentStatus, 'REFUNDED');
  assert.equal(finalOrder.refundDetails.status, 'SUCCEEDED');
});

test('Edge Case 4: Idempotency separation - cancellation and return operations have distinct persistent keys', async () => {
  const order1 = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', qty: 1 });
  const order2 = await createTestOrder({ status: 'DELIVERED', paymentStatus: 'PAID', stockReserved: false, qty: 1 });

  // Trigger cancellation on order1
  const cancelRes = await fetch(`${baseUrl}/api/admin/orders/${order1.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  assert.equal(cancelRes.status, 200);
  const cancelData = await cancelRes.json();

  // Trigger return with refund on order2
  const returnRes = await fetch(`${baseUrl}/api/admin/orders/${order2.orderNumber}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ restock: true, inspected: true, refund: true }),
  });
  assert.equal(returnRes.status, 200);
  const returnData = await returnRes.json();

  // Assert distinct keys
  assert.ok(cancelData.refundDetails.cancellationIdempotencyKey);
  assert.ok(cancelData.refundDetails.cancellationIdempotencyKey.startsWith('ref_cancel_'));

  assert.ok(returnData.refundDetails.returnIdempotencyKey);
  assert.ok(returnData.refundDetails.returnIdempotencyKey.startsWith('ref_return_'));

  assert.notEqual(
    cancelData.refundDetails.cancellationIdempotencyKey,
    returnData.refundDetails.returnIdempotencyKey
  );

  // Retrying cancellation on order1 reuses the exact same cancellation key
  const retryCancelRes = await fetch(`${baseUrl}/api/admin/orders/${order1.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  const retryCancelData = await retryCancelRes.json();
  assert.equal(
    retryCancelData.refundDetails.cancellationIdempotencyKey,
    cancelData.refundDetails.cancellationIdempotencyKey
  );
});

test('Edge Case 5: Crash recovery simulation - Stripe refund succeeds but Node process fails before Phase 3 DB update', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Step 1: Simulate Phase 1 committing in DB
  const persistentKey = `ref_cancel_${order.orderNumber}_${order._id}`;
  order.refundDetails = {
    cancellationIdempotencyKey: persistentKey,
    idempotencyKey: persistentKey,
    status: 'PENDING',
    requestedAt: new Date(),
  };
  order.paymentStatus = 'REFUND_PENDING';
  await order.save();

  // Step 2: Simulate Phase 2 calling Stripe outside DB transaction
  // Stripe creates the refund and records it in its ledger under persistentKey
  const stripeRefund = await StripeService.createRefund({
    paymentIntentId: order.stripePaymentIntentId,
    amountCents: Math.round(order.total * 100),
    idempotencyKey: persistentKey,
    metadata: { orderNumber: order.orderNumber },
  });
  assert.ok(stripeRefund.id);
  assert.equal(stripeRefund.status, 'succeeded');

  // Step 3: CRASH! The Node process fails here. Phase 3 DB update never ran.
  // The database order is still in status 'PAID', paymentStatus 'REFUND_PENDING', stockReserved 'true'.
  const crashedOrder = await Order.findById(order._id);
  assert.equal(crashedOrder.status, 'PAID');
  assert.equal(crashedOrder.paymentStatus, 'REFUND_PENDING');
  assert.equal(crashedOrder.stockReserved, true);
  assert.equal((await Product.findById(testProduct._id)).stock, stockBefore);

  // Step 4: System recovers! Admin retries the cancellation PATCH request
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
  const recoveryData = await retryRes.json();

  // Step 5: Verify reconciliation
  // Reused the existing Stripe refund (same refund ID)
  assert.equal(recoveryData.refundDetails.refundId, stripeRefund.id);
  assert.equal(recoveryData.status, 'CANCELLED');
  assert.equal(recoveryData.paymentStatus, 'REFUNDED');
  assert.equal(recoveryData.refundDetails.status, 'SUCCEEDED');

  // Stock restored exactly once (+2)
  const stockAfterRecovery = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfterRecovery, stockBefore + 2);

  // Subsequent retry performs zero additional stock restoration
  await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  const stockAfterSecondRetry = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfterSecondRetry, stockAfterRecovery);
});

test('Edge Case 6: Net revenue deduction accurately subtracts partial refunds', async () => {
  // Obtain base summary
  const baseRes = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { Cookie: adminCookie, 'X-Requested-With': 'XMLHttpRequest' },
  });
  const baseSummary = await baseRes.json();

  // Create an order of 2 items ($70 total)
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const orderTotal = order.total; // e.g. 70

  // Verify revenue increased by full orderTotal
  const midRes = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { Cookie: adminCookie, 'X-Requested-With': 'XMLHttpRequest' },
  });
  const midSummary = await midRes.json();
  assert.equal(Number((midSummary.totalRevenue - baseSummary.totalRevenue).toFixed(2)), orderTotal);

  // Issue a 50% partial refund via webhook
  const partialMinor = Math.round((orderTotal * 100) / 2);
  await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': 'test-signature',
    },
    body: JSON.stringify({
      id: `evt_rev_partial_${Date.now()}`,
      type: 'charge.refunded',
      data: {
        object: {
          id: `ch_rev_${order.orderNumber}`,
          payment_intent: order.stripePaymentIntentId,
          amount_refunded: partialMinor,
          currency: 'usd',
        },
      },
    }),
  });

  // Verify net revenue now reflects orderTotal - partialRefund (50% remaining)
  const finalRes = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { Cookie: adminCookie, 'X-Requested-With': 'XMLHttpRequest' },
  });
  const finalSummary = await finalRes.json();
  const netContribution = Number((finalSummary.totalRevenue - baseSummary.totalRevenue).toFixed(2));
  assert.equal(netContribution, Number((orderTotal - partialMinor / 100).toFixed(2)));
});

