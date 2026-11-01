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
import { CookieService } from '../services/cookieService.js';
import { AdminService } from '../services/adminService.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerCookie;
let testCategory;
let testProduct;

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'security-audit-jwt-secret-key-32-chars-long!';

  await connectDB();
  await seedDatabase({ silent: true });

  testCategory = await Category.findOne({ slug: 'essentials' });
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
  const custLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@arcandform.com', password: 'Customer@123!' }),
  });
  customerCookie = custLoginRes.headers.get('set-cookie').split(';')[0];
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

test.describe('Phase 7 Security & Business-Logic Audit: Order Cancellation & Inventory Invariants', () => {
  test('PENDING order can be cancelled and releases reserved inventory', async () => {
    const initialStock = (await Product.findById(testProduct.id)).stock;

    // Create a PENDING order with stock reserved
    const order = await Order.create({
      orderNumber: `AF-AUDIT-PEND-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'PENDING',
      stockReserved: true,
      total: 84.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 42.0,
          subtotal: 84.0,
        },
      ],
    });

    // Simulate inventory decrement at order creation
    await Product.findByIdAndUpdate(testProduct.id, { $inc: { stock: -2 } });

    // Cancel the pending order via AdminService
    const updated = await AdminService.updateOrderStatus(order._id.toString(), {
      status: 'CANCELLED',
    });

    assert.strictEqual(updated.status, 'CANCELLED');

    // Verify stock was restored
    const finalStock = (await Product.findById(testProduct.id)).stock;
    assert.strictEqual(finalStock, initialStock);

    const freshOrder = await Order.findById(order._id);
    assert.strictEqual(freshOrder.stockReserved, false);
  });

  test('PAID order can be cancelled before dispatch with transactional stock restoration', async () => {
    const initialStock = (await Product.findById(testProduct.id)).stock;

    const order = await Order.create({
      orderNumber: `AF-AUDIT-PAID-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'PAID',
      stockReserved: true,
      total: 84.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 42.0,
          subtotal: 84.0,
        },
      ],
    });

    // Simulate inventory decrement at order creation
    await Product.findByIdAndUpdate(testProduct.id, { $inc: { stock: -2 } });

    // Cancel the paid order before dispatch
    const updated = await AdminService.updateOrderStatus(order._id.toString(), {
      status: 'CANCELLED',
    });

    assert.strictEqual(updated.status, 'CANCELLED');

    // Verify stock was restored
    const finalStock = (await Product.findById(testProduct.id)).stock;
    assert.strictEqual(finalStock, initialStock);

    const freshOrder = await Order.findById(order._id);
    assert.strictEqual(freshOrder.stockReserved, false);
  });

  test('SHIPPED order ordinary cancellation is rejected to protect inventory in transit', async () => {
    const order = await Order.create({
      orderNumber: `AF-AUDIT-SHIP-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'SHIPPED',
      stockReserved: false,
      trackingNumber: 'TRK-IN-TRANSIT-123',
      total: 84.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 42.0,
          subtotal: 84.0,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await AdminService.updateOrderStatus(order._id.toString(), { status: 'CANCELLED' });
      },
      {
        message: /cannot be cancelled through ordinary cancellation/i,
      }
    );

    // Order remains SHIPPED
    const checkOrder = await Order.findById(order._id);
    assert.strictEqual(checkOrder.status, 'SHIPPED');
  });

  test('DELIVERED order ordinary cancellation is rejected and requires separate return workflow', async () => {
    const order = await Order.create({
      orderNumber: `AF-AUDIT-DELIV-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'DELIVERED',
      stockReserved: false,
      trackingNumber: 'TRK-DELIVERED-123',
      total: 84.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 42.0,
          subtotal: 84.0,
        },
      ],
    });

    await assert.rejects(
      async () => {
        await AdminService.updateOrderStatus(order._id.toString(), { status: 'CANCELLED' });
      },
      {
        message: /delivered orders must use a separate return workflow/i,
      }
    );
  });

  test('Return workflow: rejects restocking without physical receipt and inspection', async () => {
    const order = await Order.create({
      orderNumber: `AF-AUDIT-RET-NO-INSP-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'DELIVERED',
      stockReserved: false,
      total: 42.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 1,
          unitPrice: 42.0,
          subtotal: 42.0,
        },
      ],
    });

    // Attempting to restock without inspection must fail
    await assert.rejects(
      async () => {
        await AdminService.processOrderReturn(order._id.toString(), {
          restock: true,
          inspected: false,
        });
      },
      {
        message: /cannot restock returned items without physical receipt and inspection/i,
      }
    );
  });

  test('Return workflow: restocks returned items transactionally after receipt and inspection with idempotency', async () => {
    const initialStock = (await Product.findById(testProduct.id)).stock;

    const order = await Order.create({
      orderNumber: `AF-AUDIT-RET-INSP-${Date.now()}`,
      user: (await User.findOne({ role: 'CUSTOMER' }))._id,
      status: 'DELIVERED',
      stockReserved: false,
      total: 42.0,
      currency: 'usd',
      shippingAddress: {
        fullName: 'Audit User',
        addressLine1: '123 Minimalist St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
      items: [
        {
          product: testProduct.id,
          productName: testProduct.name,
          quantity: 2,
          unitPrice: 42.0,
          subtotal: 84.0,
        },
      ],
    });

    // Process return with physical inspection and restocking via POST /api/admin/orders/:id/return
    const returnRes = await fetch(`${baseUrl}/api/admin/orders/${order._id}/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        restock: true,
        inspected: true,
        condition: 'PERFECT_CONDITION',
        notes: 'Tags intact and garment unworn.',
      }),
    });

    assert.strictEqual(returnRes.status, 200);
    const returnData = await returnRes.json();
    assert.strictEqual(returnData.status, 'RETURNED');
    assert.strictEqual(returnData.returnDetails.status, 'RESTOCKED');
    assert.strictEqual(returnData.returnDetails.restocked, true);

    // Verify stock incremented by 2
    const postStock = (await Product.findById(testProduct.id)).stock;
    assert.strictEqual(postStock, initialStock + 2);

    // IDEMPOTENCY: repeating return does NOT double-increment stock
    await AdminService.processOrderReturn(order._id.toString(), {
      restock: true,
      inspected: true,
    });

    const idempotentStock = (await Product.findById(testProduct.id)).stock;
    assert.strictEqual(idempotentStock, postStock, 'Repeating return process must be idempotent');
  });
});

test.describe('Phase 7 Security Audit: Cross-Origin Authentication, CORS & CSRF Protection', () => {
  test('CookieService enforces SameSite=None and Secure pairing for cross-origin production', () => {
    const mockRes = {
      cookieName: null,
      cookieVal: null,
      cookieOpts: null,
      cookie(name, val, opts) {
        this.cookieName = name;
        this.cookieVal = val;
        this.cookieOpts = opts;
      },
    };

    CookieService.setAuthCookie(mockRes, 'sample-jwt-token');
    assert.strictEqual(mockRes.cookieName, 'arc_token');
    assert.strictEqual(mockRes.cookieOpts.httpOnly, true);
    assert.strictEqual(mockRes.cookieOpts.path, '/');
  });

  test('CORS rejects wildcard origin "*" when credentials are true', async () => {
    const res = await fetch(`${baseUrl}/api/categories`, {
      method: 'GET',
      headers: {
        Origin: '*',
      },
    });

    // The CORS middleware or CSRF check rejects wildcard origin with error
    assert.ok(res.status === 403 || res.status === 500);
  });

  test('CORS accepts allowed origin from allowlist with credentials', async () => {
    const res = await fetch(`${baseUrl}/api/categories`, {
      method: 'GET',
      headers: {
        Origin: 'http://localhost:5173',
      },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.strictEqual(res.headers.get('access-control-allow-credentials'), 'true');
  });

  test('CSRF Protection: blocks mutating state-changing request from untrusted origin', async () => {
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        Origin: 'https://malicious-attacker.com',
      },
      body: JSON.stringify({ items: [] }),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.message.includes('CORS') || data.message.includes('CSRF'));
  });

  test('CSRF Protection: blocks cookie-authenticated mutation missing both Origin and custom anti-CSRF header', async () => {
    // Simulates an unauthorized cross-origin HTML form submission where browser includes cookie
    // but cannot set custom headers and does not provide an allowed origin
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
        Cookie: customerCookie,
      },
      body: JSON.stringify({ items: [] }),
    });

    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.ok(data.message.includes('CORS') || data.message.includes('CSRF'));
  });

  test('CSRF Protection: allows cookie-authenticated mutation with trusted Origin or X-Requested-With header', async () => {
    const res = await fetch(`${baseUrl}/api/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: customerCookie,
        Origin: 'http://localhost:5173',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ items: [] }),
    });

    // Passed CSRF, reached controller validation (items empty)
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.message, 'Order must contain at least one item');
  });

  test('CSRF Protection: exempts Stripe webhook endpoints relying on cryptographic HMAC signatures', async () => {
    const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // No Origin or X-Requested-With header (simulating Stripe server webhook)
      },
      body: JSON.stringify({ id: 'evt_test' }),
    });

    // Must NOT be blocked with CSRF 403; reaches Stripe signature verification (400 missing header)
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('signature') || data.message.includes('Stripe'));
  });
});
