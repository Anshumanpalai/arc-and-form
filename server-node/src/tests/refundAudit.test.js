import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { seedDatabase } from '../seed/seeder.js';
import { AdminService } from '../services/adminService.js';
import { StripeService } from '../services/stripeService.js';
import { OrderService } from '../services/orderService.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerCookie;
let customerUser;
let testProduct;

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'refund-audit-jwt-secret-key-32-chars-long!';

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

  // Login customer to obtain cookie
  const customerLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@arcandform.com', password: 'Customer@123!' }),
  });
  customerCookie = customerLoginRes.headers.get('set-cookie').split(';')[0];
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

// Helper to create order in DB
async function createTestOrder({ status = 'PAID', paymentStatus = 'PAID', stockReserved = true, qty = 2 } = {}) {
  // Decrement product stock to simulate reservation
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
    stripePaymentIntentId: `pi_test_${orderNumber}`,
    shippingAddress: {
      fullName: 'Jane Customer',
      addressLine1: '456 Form Ave',
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

test('Audit 1: Paid order cancellation triggers official Stripe refund workflow and restores inventory', async () => {
  const initialProduct = await Product.findById(testProduct._id);
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });

  const res = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.status, 'CANCELLED');
  assert.equal(data.paymentStatus, 'REFUNDED');
  assert.equal(data.refundDetails.status, 'SUCCEEDED');
  assert.ok(data.refundDetails.refundId.startsWith('mock_re_'));
  assert.ok(data.refundDetails.idempotencyKey.includes(order.orderNumber));
  assert.equal(data.refundDetails.amount, order.total);

  // Verify DB state
  const updatedOrder = await Order.findById(order._id);
  assert.equal(updatedOrder.status, 'CANCELLED');
  assert.equal(updatedOrder.paymentStatus, 'REFUNDED');
  assert.equal(updatedOrder.stockReserved, false);

  // Verify inventory restored exactly once
  const postProduct = await Product.findById(testProduct._id);
  assert.equal(postProduct.stock, initialProduct.stock); // Returned to initial
});

test('Audit 2: Failed Stripe refund does not mark order refunded or cancelled, and does NOT restore stock', async () => {
  const initialProduct = await Product.findById(testProduct._id);
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 2 });
  const stockAfterReservation = (await Product.findById(testProduct._id)).stock;

  // Simulate Stripe processing failure
  StripeService.setForceRefundFailure(true, 'Payment processor network error');

  const res = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  StripeService.setForceRefundFailure(false);

  assert.equal(res.status, 502);

  // Verify DB state: Order status remains PAID, paymentStatus marked REFUND_FAILED
  const orderInDb = await Order.findById(order._id);
  assert.equal(orderInDb.status, 'PAID');
  assert.equal(orderInDb.paymentStatus, 'REFUND_FAILED');
  assert.equal(orderInDb.refundDetails.status, 'FAILED');
  assert.ok(orderInDb.refundDetails.failureReason.includes('Payment processor network error'));
  assert.equal(orderInDb.stockReserved, true); // Stock remains reserved

  // Verify inventory was NOT restored
  const postProduct = await Product.findById(testProduct._id);
  assert.equal(postProduct.stock, stockAfterReservation);
});

test('Audit 3: Duplicate cancellation does not create duplicate refunds or duplicate stock restoration', async () => {
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });

  // First cancellation
  const res1 = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  const stockAfterFirstCancel = (await Product.findById(testProduct._id)).stock;
  const originalRefundId = data1.refundDetails.refundId;
  const originalIdempotencyKey = data1.refundDetails.idempotencyKey;

  // Second duplicate cancellation
  const res2 = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();

  assert.equal(data2.status, 'CANCELLED');
  assert.equal(data2.paymentStatus, 'REFUNDED');
  assert.equal(data2.refundDetails.refundId, originalRefundId);
  assert.equal(data2.refundDetails.idempotencyKey, originalIdempotencyKey);

  // Verify stock was NOT restored a second time
  const stockAfterSecondCancel = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfterSecondCancel, stockAfterFirstCancel);
});

test('Audit 4: Reconciliation via Stripe webhook reconciles refund and stock', async () => {
  const order = await createTestOrder({ status: 'CANCELLED', paymentStatus: 'REFUND_PENDING', stockReserved: true, qty: 1 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  // Send charge.refunded webhook with test-signature
  const webhookPayload = {
    id: `evt_test_refund_${Date.now()}`,
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_test_${order.orderNumber}`,
        payment_intent: order.stripePaymentIntentId,
        amount: Math.round(order.total * 100),
        refunds: {
          data: [
            {
              id: `re_webhook_${order.orderNumber}`,
              status: 'succeeded',
              amount: Math.round(order.total * 100),
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
  const webhookResult = await webhookRes.json();
  assert.equal(webhookResult.received, true);

  // Check DB reconciliation
  const reconciledOrder = await Order.findById(order._id);
  assert.equal(reconciledOrder.paymentStatus, 'REFUNDED');
  assert.equal(reconciledOrder.refundDetails.status, 'SUCCEEDED');
  assert.equal(reconciledOrder.stockReserved, false);

  // Verify stock was restored
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore + 1);
});

test('Audit 5: Returned item cannot be restocked before physical inspection', async () => {
  const order = await createTestOrder({ status: 'DELIVERED', paymentStatus: 'PAID', stockReserved: false, qty: 1 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  const res = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ restock: true, inspected: false }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.message.includes('Cannot restock returned items without physical receipt and inspection'));

  // Stock remained untouched
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore);
});

test('Audit 6: Return workflow with refund=true triggers Stripe refund and restocks only after inspection', async () => {
  const order = await createTestOrder({ status: 'DELIVERED', paymentStatus: 'PAID', stockReserved: false, qty: 2 });
  const stockBefore = (await Product.findById(testProduct._id)).stock;

  const res = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      restock: true,
      inspected: true,
      refund: true,
      condition: 'PRISTINE',
      notes: 'Customer returned in original packaging with tags intact',
    }),
  });

  assert.equal(res.status, 200);
  const data = await res.json();

  assert.equal(data.status, 'RETURNED');
  assert.equal(data.paymentStatus, 'REFUNDED');
  assert.equal(data.refundDetails.status, 'SUCCEEDED');
  assert.equal(data.returnDetails.restocked, true);
  assert.equal(data.returnDetails.status, 'RESTOCKED');
  assert.equal(data.returnDetails.condition, 'PRISTINE');

  // Verify stock was restored by 2
  const stockAfter = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfter, stockBefore + 2);
});

test('Audit 7: Duplicate return requests cannot duplicate refunds or stock', async () => {
  const order = await createTestOrder({ status: 'DELIVERED', paymentStatus: 'PAID', stockReserved: false, qty: 1 });

  // First return
  const res1 = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ restock: true, inspected: true, refund: true }),
  });
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  const refundId1 = data1.refundDetails.refundId;
  const stockAfterFirstReturn = (await Product.findById(testProduct._id)).stock;

  // Duplicate return call
  const res2 = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/return`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ restock: true, inspected: true, refund: true }),
  });
  assert.equal(res2.status, 200);
  const data2 = await res2.json();

  assert.equal(data2.status, 'RETURNED');
  assert.equal(data2.paymentStatus, 'REFUNDED');
  assert.equal(data2.refundDetails.refundId, refundId1);

  // Verify stock was NOT restored again
  const stockAfterSecondReturn = (await Product.findById(testProduct._id)).stock;
  assert.equal(stockAfterSecondReturn, stockAfterFirstReturn);
});

test('Audit 8: SHIPPED order ordinary cancellation remains forbidden', async () => {
  const order = await createTestOrder({ status: 'SHIPPED', paymentStatus: 'PAID', stockReserved: false, qty: 1 });

  const res = await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  assert.equal(res.status, 400);
  const data = await res.json();
  assert.ok(data.message.includes('cannot be cancelled through ordinary cancellation'));
});

test('Audit 9: Net revenue excludes refunded orders', async () => {
  // Check summary before
  const resBefore = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: {
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const summaryBefore = await resBefore.json();

  // Create a paid order
  const order = await createTestOrder({ status: 'PAID', paymentStatus: 'PAID', stockReserved: true, qty: 1 });

  const resMid = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: {
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const summaryMid = await resMid.json();
  assert.equal(Number((summaryMid.totalRevenue - summaryBefore.totalRevenue).toFixed(2)), order.total);

  // Now cancel the order (which triggers refund)
  await fetch(`${baseUrl}/api/admin/orders/${order.orderNumber}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ status: 'CANCELLED' }),
  });

  // Verify revenue excludes refunded order
  const resAfter = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: {
      Cookie: adminCookie,
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  const summaryAfter = await resAfter.json();
  assert.equal(summaryAfter.totalRevenue, summaryBefore.totalRevenue);
});

