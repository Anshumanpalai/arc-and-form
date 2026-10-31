import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { ProcessedEvent } from '../models/ProcessedEvent.js';
import { seedDatabase } from '../seed/seeder.js';
import { StripeService } from '../services/stripeService.js';
import { OrderService } from '../services/orderService.js';

let app;
let server;
let baseUrl;
let customerCookie;
let customer2Cookie;
let adminCookie;
let customerUser;
let customer2User;
let testProduct;
let limitedStockProduct;

test.before(async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    ProcessedEvent.deleteMany({}),
  ]);

  await seedDatabase({ silent: true });

  // Create a second customer for cross-customer authorization testing
  customer2User = await User.create({
    name: 'Second Customer',
    email: 'customer2@arcandform.com',
    passwordHash: await User.hashPassword('Customer2@123!'),
    role: 'CUSTOMER',
  });

  customerUser = await User.findOne({ email: 'customer@arcandform.com' });
  testProduct = await Product.findOne({ slug: 'heavyweight-organic-cotton-tee' });

  // Create product with exactly 1 unit of stock for concurrency/oversell test
  const category = await Category.findOne({ slug: 'essentials' });
  limitedStockProduct = await Product.create({
    name: 'Limited Edition Silk Scarf',
    slug: 'limited-edition-silk-scarf',
    description: 'Only 1 left in world stock',
    price: 120.0,
    stock: 1,
    featured: false,
    category: category._id,
  });

  app = createApp();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  // Login as Customer 1
  const c1Login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@arcandform.com', password: 'Customer@123!' }),
  });
  customerCookie = c1Login.headers.get('set-cookie').split(';')[0];

  // Login as Customer 2
  const c2Login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer2@arcandform.com', password: 'Customer2@123!' }),
  });
  customer2Cookie = c2Login.headers.get('set-cookie').split(';')[0];

  // Login as Admin
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@arcandform.com', password: 'Admin@123!' }),
  });
  adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    ProcessedEvent.deleteMany({}),
  ]);
  await disconnectDB();
});

test.describe('Order Checkout & Inventory Reservation', () => {
  test('rejects unauthenticated checkout requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ productId: testProduct.id, quantity: 1 }],
        shippingAddress: {
          fullName: 'Anon',
          addressLine1: '123 St',
          city: 'City',
          state: 'State',
          postalCode: '10001',
          country: 'US',
        },
      }),
    });
    assert.equal(res.status, 401);
  });

  test('successfully creates order, reserves stock transactionally, and recalculates price server-side in minor units', async () => {
    const initialStock = (await Product.findById(testProduct.id)).stock;

    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
      },
      body: JSON.stringify({
        items: [
          {
            productId: testProduct.id,
            quantity: 2,
            selectedSize: 'M',
            price: 1.0, // Client attempting price tampering!
          },
        ],
        shippingAddress: {
          fullName: 'Jane Customer',
          addressLine1: '456 Fashion Ave',
          city: 'New York',
          state: 'NY',
          postalCode: '10002',
          country: 'United States',
        },
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.orderNumber.startsWith('AF-'));
    assert.ok(data.checkoutUrl);
    assert.ok(data.sessionId);

    // Client price $1 was ignored; actual DB price is 42.00 * 2 = 84.00
    assert.equal(data.total, 84.0);

    // Stock was decremented transactionally by 2
    const updatedProd = await Product.findById(testProduct.id);
    assert.equal(updatedProd.stock, initialStock - 2);

    // Verify stored snapshot
    const savedOrder = await Order.findOne({ orderNumber: data.orderNumber });
    assert.equal(savedOrder.status, 'PENDING');
    assert.equal(savedOrder.stockReserved, true);
    assert.equal(savedOrder.items[0].productName, 'Heavyweight Organic Cotton Tee');
    assert.equal(savedOrder.items[0].unitPrice, 42.0);
    assert.equal(savedOrder.items[0].quantity, 2);
    assert.equal(savedOrder.items[0].subtotal, 84.0);
  });

  test('rejects checkout when item quantity exceeds available stock', async () => {
    const prod = await Product.findById(testProduct.id);
    const excessiveQuantity = prod.stock + 10;

    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
      },
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: excessiveQuantity }],
        shippingAddress: {
          fullName: 'Jane Customer',
          addressLine1: '456 Fashion Ave',
          city: 'New York',
          state: 'NY',
          postalCode: '10002',
          country: 'United States',
        },
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('Insufficient stock'));
  });

  test('rejects checkout with invalid quantity, negative numbers, or missing shipping address', async () => {
    // Negative quantity
    const resNegative = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({
        items: [{ productId: testProduct.id, quantity: -2 }],
        shippingAddress: { fullName: 'Test', addressLine1: 'St', city: 'C', state: 'S', postalCode: 'Z', country: 'US' },
      }),
    });
    assert.equal(resNegative.status, 400);

    // Missing shipping address
    const resNoAddress = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({
        items: [{ productId: testProduct.id, quantity: 1 }],
      }),
    });
    assert.equal(resNoAddress.status, 400);
  });

  test('concurrent checkouts cannot oversell inventory (multi-document replica set transaction)', async () => {
    // limitedStockProduct has exactly stock = 1
    const checkoutPayload = {
      items: [{ productId: limitedStockProduct.id, quantity: 1 }],
      shippingAddress: {
        fullName: 'Concurrency Racer',
        addressLine1: '1 Race Track',
        city: 'Indy',
        state: 'IN',
        postalCode: '46201',
        country: 'US',
      },
    };

    // Run 2 checkouts simultaneously
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/api/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
        body: JSON.stringify(checkoutPayload),
      }),
      fetch(`${baseUrl}/api/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: customer2Cookie },
        body: JSON.stringify(checkoutPayload),
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    assert.deepEqual(statuses, [201, 400], 'Exactly one checkout must succeed and one must be rejected');

    const updatedProd = await Product.findById(limitedStockProduct.id);
    assert.equal(updatedProd.stock, 0, 'Stock must never fall below 0');
  });

  test('rolls back stock reservation if Stripe session creation fails', async () => {
    const prod = await Product.findOne({ slug: 'raw-selvedge-denim-trouser' });
    const stockBefore = prod.stock;

    // Temporarily mock StripeService.createCheckoutSession to throw
    const originalCreate = StripeService.createCheckoutSession;
    StripeService.createCheckoutSession = async () => {
      throw new Error('Simulated Stripe network disconnect');
    };

    try {
      const res = await fetch(`${baseUrl}/api/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
        body: JSON.stringify({
          items: [{ productId: prod.id, quantity: 2 }],
          shippingAddress: {
            fullName: 'Rollback Tester',
            addressLine1: '123 Rollback Ln',
            city: 'Austin',
            state: 'TX',
            postalCode: '78701',
            country: 'US',
          },
        }),
      });

      assert.equal(res.status, 500);

      // Stock must be restored to its original value
      const stockAfter = (await Product.findById(prod.id)).stock;
      assert.equal(stockAfter, stockBefore, 'Stock must be rolled back on session failure');
    } finally {
      StripeService.createCheckoutSession = originalCreate;
    }
  });
});

test.describe('Customer Order History & Customer Isolation', () => {
  let customer1OrderNumber;

  test.before(async () => {
    await Order.deleteMany({});
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({
        items: [{ productId: testProduct.id, quantity: 1 }],
        shippingAddress: {
          fullName: 'Customer 1',
          addressLine1: '1 Customer St',
          city: 'Boston',
          state: 'MA',
          postalCode: '02108',
          country: 'US',
        },
      }),
    });
    const data = await res.json();
    customer1OrderNumber = data.orderNumber;
  });

  test('GET /api/orders returns orders for the authenticated customer only', async () => {
    const res = await fetch(`${baseUrl}/api/orders?page=1&limit=20`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.content));
    assert.ok(data.content.length >= 1);
    assert.ok(data.totalElements >= 1);

    // Customer 2 should have 0 orders
    const res2 = await fetch(`${baseUrl}/api/orders?page=1&limit=20`, {
      headers: { Cookie: customer2Cookie },
    });
    const data2 = await res2.json();
    assert.equal(data2.totalElements, 0);
  });

  test('customer cannot view another customer order (403 Forbidden)', async () => {
    const res = await fetch(`${baseUrl}/api/orders/${customer1OrderNumber}`, {
      headers: { Cookie: customer2Cookie }, // Customer 2 attempts to view Customer 1's order
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, 'Forbidden');
    assert.equal(data.message, 'You do not have permission to view this order');
  });

  test('customer can view their own order details with populated item snapshots', async () => {
    const res = await fetch(`${baseUrl}/api/orders/${customer1OrderNumber}`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.order);
    assert.equal(data.order.orderNumber, customer1OrderNumber);
    assert.equal(data.order.shippingAddress.fullName, 'Customer 1');
    assert.ok(data.order.items.length >= 1);
  });

  test('admin can view any customer order', async () => {
    const res = await fetch(`${baseUrl}/api/orders/${customer1OrderNumber}`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.order.orderNumber, customer1OrderNumber);
  });
});

test.describe('Stripe Webhook Verification & Strict Payment Auditing', () => {
  let webhookOrder;
  let webhookSessionId;

  test.beforeEach(async () => {
    const prod = await Product.findOne({ slug: 'minimalist-nylon-crossbody-pack' });
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: customerCookie },
      body: JSON.stringify({
        items: [{ productId: prod.id, quantity: 1 }],
        shippingAddress: {
          fullName: 'Webhook Tester',
          addressLine1: '789 Webhook St',
          city: 'Seattle',
          state: 'WA',
          postalCode: '98101',
          country: 'US',
        },
      }),
    });
    const data = await res.json();
    webhookOrder = await Order.findOne({ orderNumber: data.orderNumber });
    webhookSessionId = data.sessionId;
  });

  test('rejects webhook with missing signature header with 400', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'evt_test' }),
    });
    assert.equal(res.status, 400);
  });

  test('rejects webhook with invalid signature header with 400', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 't=123,v1=invalid_signature_hash',
      },
      body: JSON.stringify({ id: 'evt_test' }),
    });
    assert.equal(res.status, 400);
  });

  test('processes checkout.session.completed with verified payment and marks order PAID', async () => {
    const eventId = `evt_paid_${Date.now()}_${Math.random()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          payment_status: 'paid',
          amount_total: Math.round(webhookOrder.total * 100),
          currency: 'usd',
          payment_intent: 'pi_test_12345',
          metadata: { orderNumber: webhookOrder.orderNumber, orderId: webhookOrder._id.toString() },
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 'test-signature',
      },
      body: payload,
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.received, true);

    const updated = await Order.findById(webhookOrder.id);
    assert.equal(updated.status, 'PAID');
    assert.equal(updated.stripePaymentIntentId, 'pi_test_12345');

    // ProcessedEvent was permanently recorded (no TTL)
    const processed = await ProcessedEvent.findOne({ eventId });
    assert.ok(processed);
  });

  test('rejects completed event when payment_status is not paid (e.g. unpaid)', async () => {
    const eventId = `evt_unpaid_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          payment_status: 'unpaid', // NOT paid
          amount_total: Math.round(webhookOrder.total * 100),
          currency: 'usd',
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    });
    assert.equal(res.status, 200);

    // Order must NOT be marked PAID
    const order = await Order.findById(webhookOrder.id);
    assert.equal(order.status, 'PENDING');
  });

  test('rejects completed event with mismatched amount or currency', async () => {
    // 1. Wrong amount
    const eventWrongAmount = `evt_amt_bad_${Date.now()}`;
    await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: JSON.stringify({
        id: eventWrongAmount,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: webhookSessionId,
            payment_status: 'paid',
            amount_total: 9999999, // Mismatched amount
            currency: 'usd',
            metadata: { orderNumber: webhookOrder.orderNumber },
          },
        },
      }),
    });

    let order = await Order.findById(webhookOrder.id);
    assert.equal(order.status, 'PENDING');

    // 2. Wrong currency
    const eventWrongCurr = `evt_curr_bad_${Date.now()}`;
    await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: JSON.stringify({
        id: eventWrongCurr,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: webhookSessionId,
            payment_status: 'paid',
            amount_total: Math.round(webhookOrder.total * 100),
            currency: 'eur', // Mismatched currency
            metadata: { orderNumber: webhookOrder.orderNumber },
          },
        },
      }),
    });

    order = await Order.findById(webhookOrder.id);
    assert.equal(order.status, 'PENDING');
  });

  test('rejects completed event with wrong session ID or mismatched metadata', async () => {
    const eventMismatch = `evt_mismatch_${Date.now()}`;
    await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: JSON.stringify({
        id: eventMismatch,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_fraudulent_session_123', // Mismatched session
            payment_status: 'paid',
            amount_total: Math.round(webhookOrder.total * 100),
            currency: 'usd',
            metadata: { orderNumber: webhookOrder.orderNumber },
          },
        },
      }),
    });

    const order = await Order.findById(webhookOrder.id);
    assert.equal(order.status, 'PENDING');
  });

  test('handles race condition where webhook arrives before checkout saves stripeSessionId', async () => {
    // Create an order where stripeSessionId is not yet recorded
    const prod = await Product.findOne({ slug: 'anodized-aluminum-pen-stand' });
    const raceOrder = await Order.create({
      orderNumber: 'AF-RACE99',
      user: customerUser._id,
      status: 'PENDING',
      currency: 'usd',
      total: prod.price,
      stockReserved: true,
      stripeSessionId: null, // NOT yet saved!
      shippingAddress: {
        fullName: 'Race Tester',
        addressLine1: 'Race St',
        city: 'City',
        state: 'ST',
        postalCode: '12345',
        country: 'US',
      },
      items: [
        {
          product: prod._id,
          productName: prod.name,
          unitPrice: prod.price,
          quantity: 1,
          subtotal: prod.price,
        },
      ],
    });

    const raceSessionId = 'cs_race_session_success';
    const eventId = `evt_race_${Date.now()}`;

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: JSON.stringify({
        id: eventId,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: raceSessionId,
            client_reference_id: raceOrder.orderNumber,
            payment_status: 'paid',
            amount_total: Math.round(prod.price * 100),
            currency: 'usd',
            metadata: { orderNumber: raceOrder.orderNumber },
          },
        },
      }),
    });

    assert.equal(res.status, 200);

    const updated = await Order.findById(raceOrder._id);
    assert.equal(updated.status, 'PAID');
    // Session ID was safely associated during the race!
    assert.equal(updated.stripeSessionId, raceSessionId);
  });

  test('subsequent duplicate webhook event delivery is completely idempotent', async () => {
    const eventId = `evt_dup_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          payment_status: 'paid',
          amount_total: Math.round(webhookOrder.total * 100),
          currency: 'usd',
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    });

    // Send first time
    const res1 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    });
    assert.equal(res1.status, 200);

    // Send second time (duplicate)
    const res2 = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.duplicate, true);

    // Order status remains PAID
    const updated = await Order.findById(webhookOrder.id);
    assert.equal(updated.status, 'PAID');
  });

  test('handles concurrent duplicate webhook delivery race atomically via replica set transaction', async () => {
    const concurrentEventId = `evt_concurrent_${Date.now()}`;
    const payload = {
      id: concurrentEventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          payment_status: 'paid',
          amount_total: Math.round(webhookOrder.total * 100),
          currency: 'usd',
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    };

    // Fire 2 simultaneous webhook handler calls
    const [res1, res2] = await Promise.all([
      OrderService.handleStripeWebhook(payload),
      OrderService.handleStripeWebhook(payload),
    ]);

    assert.ok(res1.received);
    assert.ok(res2.received);

    // Exactly one duplicate event detected
    const hasDuplicate = res1.duplicate || res2.duplicate;
    assert.equal(hasDuplicate, true);

    // Order status is PAID and ProcessedEvent exists once
    const eventRecords = await ProcessedEvent.find({ eventId: concurrentEventId });
    assert.equal(eventRecords.length, 1);
  });

  test('database failure during webhook processing rolls back transaction allowing successful retry', async () => {
    const retryEventId = `evt_retry_${Date.now()}`;
    const payload = {
      id: retryEventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          payment_status: 'paid',
          amount_total: Math.round(webhookOrder.total * 100),
          currency: 'usd',
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    };

    // Temporarily inject a transient failure during order lookup
    let shouldFail = true;
    const originalFindOne = Order.findOne;
    Order.findOne = function (...args) {
      if (shouldFail) {
        throw new Error('Simulated transient DB failure');
      }
      return originalFindOne.apply(this, args);
    };

    try {
      // First attempt fails and throws
      await assert.rejects(
        OrderService.handleStripeWebhook(payload),
        /Simulated transient DB failure/
      );

      // Verify that transaction rolled back and ProcessedEvent was NOT committed
      const uncommittedEvent = await ProcessedEvent.findOne({ eventId: retryEventId });
      assert.equal(uncommittedEvent, null);

      // Now simulate Stripe retry when database has recovered
      shouldFail = false;
      const retryResult = await OrderService.handleStripeWebhook(payload);
      assert.equal(retryResult.received, true);

      // Verify successful processing
      const committedOrder = await Order.findById(webhookOrder.id);
      assert.equal(committedOrder.status, 'PAID');
      const committedEvent = await ProcessedEvent.findOne({ eventId: retryEventId });
      assert.ok(committedEvent);
    } finally {
      Order.findOne = originalFindOne;
    }
  });

  test('processes checkout.session.expired and releases reserved stock exactly once', async () => {
    const prod = await Product.findById(webhookOrder.items[0].product);
    const stockBeforeExpiration = prod.stock;

    const eventId = `evt_expired_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.expired',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    });

    assert.equal(res.status, 200);

    // Order is now CANCELLED and stockReserved is false
    const updatedOrder = await Order.findById(webhookOrder.id);
    assert.equal(updatedOrder.status, 'CANCELLED');
    assert.equal(updatedOrder.stockReserved, false);

    // Stock was returned (+1)
    const stockAfterExpiration = (await Product.findById(prod.id)).stock;
    assert.equal(stockAfterExpiration, stockBeforeExpiration + 1);
  });

  test('never releases stock if an expiration event arrives for an already-paid order', async () => {
    // Mark order as PAID first
    webhookOrder.status = 'PAID';
    await webhookOrder.save();

    const prod = await Product.findById(webhookOrder.items[0].product);
    const stockBefore = prod.stock;

    const eventId = `evt_late_expired_${Date.now()}`;
    const payload = JSON.stringify({
      id: eventId,
      type: 'checkout.session.expired',
      data: {
        object: {
          id: webhookSessionId,
          client_reference_id: webhookOrder.orderNumber,
          metadata: { orderNumber: webhookOrder.orderNumber },
        },
      },
    });

    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'test-signature' },
      body: payload,
    });
    assert.equal(res.status, 200);

    // Order remains PAID, stock is NOT increased
    const updatedOrder = await Order.findById(webhookOrder.id);
    assert.equal(updatedOrder.status, 'PAID');
    const stockAfter = (await Product.findById(prod.id)).stock;
    assert.equal(stockAfter, stockBefore);
  });

  test('reservation expiry recovery mechanism cleans up abandoned pending orders and releases stock', async () => {
    const prod = await Product.findOne({ slug: 'solid-walnut-desk-tray' });
    const stockBefore = prod.stock;

    // Create an abandoned pending order whose createdAt is in the past (e.g. 45 minutes ago)
    const abandonedOrder = await Order.create({
      orderNumber: 'AF-ABANDONED',
      user: customerUser._id,
      status: 'PENDING',
      currency: 'usd',
      total: prod.price,
      stockReserved: true,
      shippingAddress: {
        fullName: 'Abandoned User',
        addressLine1: 'Ghost St',
        city: 'City',
        state: 'ST',
        postalCode: '00000',
        country: 'US',
      },
      items: [
        {
          product: prod._id,
          productName: prod.name,
          unitPrice: prod.price,
          quantity: 2,
          subtotal: prod.price * 2,
        },
      ],
      createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 minutes ago
    });

    // Run recovery with 30 minute TTL
    const stats = await OrderService.recoverExpiredReservations({ ttlMinutes: 30 });
    assert.ok(stats.recoveredCount >= 1);
    assert.ok(stats.recoveredOrderNumbers.includes('AF-ABANDONED'));

    // Verify order is CANCELLED and stock was restored by 2
    const checked = await Order.findById(abandonedOrder._id);
    assert.equal(checked.status, 'CANCELLED');
    assert.equal(checked.stockReserved, false);

    const stockAfter = (await Product.findById(prod.id)).stock;
    assert.equal(stockAfter, stockBefore + 2);
  });
});
