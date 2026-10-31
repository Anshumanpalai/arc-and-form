import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import mongoose from 'mongoose';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { ProcessedEvent } from '../models/ProcessedEvent.js';
import { seedDatabase } from '../seed/seeder.js';
import { CloudinaryService } from '../services/cloudinaryService.js';

let app;
let server;
let baseUrl;
let customerCookie;
let adminCookie;
let seededAdmin;
let seededCustomer;
let sampleCategory;
let testProduct;

// Authentic binary fixtures for image magic byte validation
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x01, 0x00, 0x60,
]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const WEBP_HEADER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56,
  0x50, 0x38, 0x20,
]);
const GIF_HEADER = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00,
  0x00, 0x00, 0x00,
]);

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

  seededCustomer = await User.findOne({ email: 'customer@arcandform.com' });
  seededAdmin = await User.findOne({ email: 'admin@arcandform.com' });
  sampleCategory = await Category.findOne({ slug: 'essentials' });
  testProduct = await Product.findOne({ slug: 'heavyweight-organic-cotton-tee' });

  app = createApp();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  // Login as Customer
  const custRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'customer@arcandform.com',
      password: 'Customer@123!',
    }),
  });
  customerCookie = custRes.headers.get('set-cookie').split(';')[0];

  // Login as Admin
  const adminRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@arcandform.com',
      password: 'Admin@123!',
    }),
  });
  adminCookie = adminRes.headers.get('set-cookie').split(';')[0];
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

test('Admin Access Control & Role Protection', async (t) => {
  await t.test('unauthenticated access to admin routes is rejected with 401', async () => {
    const endpoints = [
      '/api/admin/summary',
      '/api/admin/dashboard',
      '/api/admin/orders',
      '/api/admin/orders/AF-999999',
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`);
      assert.strictEqual(res.status, 401, `Expected 401 for ${ep}`);
    }
  });

  await t.test('customer access to admin routes is rejected with 403 Forbidden', async () => {
    const endpoints = [
      '/api/admin/summary',
      '/api/admin/dashboard',
      '/api/admin/orders',
    ];

    for (const ep of endpoints) {
      const res = await fetch(`${baseUrl}${ep}`, {
        headers: { Cookie: customerCookie },
      });
      assert.strictEqual(res.status, 403, `Expected 403 for ${ep}`);
    }
  });

  await t.test('admin access to admin routes is granted with 200 OK', async () => {
    const res = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.totalOrders !== undefined);
  });
});

test('Admin Dashboard Overview & Revenue Metrics', async (t) => {
  // Clear any existing orders to establish controlled test state
  await Order.deleteMany({});

  const shippingAddr = {
    fullName: 'Jane Doe',
    addressLine1: '123 Atelier Way',
    city: 'New York',
    state: 'NY',
    postalCode: '10001',
    country: 'US',
  };

  // Seed controlled orders with different statuses
  // PAID: $120.00
  await Order.create({
    orderNumber: 'AF-100001',
    user: seededCustomer._id,
    status: 'PAID',
    total: 120.0,
    shippingAddress: shippingAddr,
    stockReserved: true,
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 1,
        unitPrice: 120.0,
        subtotal: 120.0,
      },
    ],
  });

  // SHIPPED: $200.00
  await Order.create({
    orderNumber: 'AF-100002',
    user: seededCustomer._id,
    status: 'SHIPPED',
    total: 200.0,
    shippingAddress: shippingAddr,
    stockReserved: true,
    trackingNumber: 'TRK-987654',
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 2,
        unitPrice: 100.0,
        subtotal: 200.0,
      },
    ],
  });

  // DELIVERED: $80.00
  await Order.create({
    orderNumber: 'AF-100003',
    user: seededCustomer._id,
    status: 'DELIVERED',
    total: 80.0,
    shippingAddress: shippingAddr,
    stockReserved: true,
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 1,
        unitPrice: 80.0,
        subtotal: 80.0,
      },
    ],
  });

  // PENDING (Unpaid): $300.00 - MUST NOT BE INCLUDED IN REVENUE!
  await Order.create({
    orderNumber: 'AF-100004',
    user: seededCustomer._id,
    status: 'PENDING',
    total: 300.0,
    shippingAddress: shippingAddr,
    stockReserved: true,
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 3,
        unitPrice: 100.0,
        subtotal: 300.0,
      },
    ],
  });

  // CANCELLED: $150.00 - MUST NOT BE INCLUDED IN REVENUE!
  await Order.create({
    orderNumber: 'AF-100005',
    user: seededCustomer._id,
    status: 'CANCELLED',
    total: 150.0,
    shippingAddress: shippingAddr,
    stockReserved: false,
    items: [
      {
        product: testProduct._id,
        productName: testProduct.name,
        quantity: 1,
        unitPrice: 150.0,
        subtotal: 150.0,
      },
    ],
  });

  await t.test('calculates gross revenue strictly from PAID, SHIPPED, and DELIVERED orders', async () => {
    const res = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    // 120 + 200 + 80 = 400.00 (PENDING 300 and CANCELLED 150 excluded)
    assert.strictEqual(data.totalRevenue, 400.0);
    assert.strictEqual(data.totalOrders, 5);
    // Only PAID orders are pending fulfillment/shipment
    assert.strictEqual(data.pendingShipments, 1);
    assert.ok(data.totalCustomers >= 1);
    assert.ok(data.totalProducts >= 20);
    assert.strictEqual(data.recentOrders.length, 5);
  });

  await t.test('GET /api/admin/dashboard serves identical metrics as alias', async () => {
    const res = await fetch(`${baseUrl}/api/admin/dashboard`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.totalRevenue, 400.0);
    assert.strictEqual(data.pendingShipments, 1);
  });

  await t.test('populates recentOrders with formatted customer and item details', async () => {
    const res = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();
    const firstOrder = data.recentOrders[0];

    assert.ok(firstOrder.id);
    assert.ok(firstOrder.orderNumber);
    assert.strictEqual(firstOrder.customerEmail, 'customer@arcandform.com');
    assert.strictEqual(firstOrder.customerName, 'Jane Doe');
    assert.ok(Array.isArray(firstOrder.items));
    assert.ok(firstOrder.items.length > 0);
  });

  await t.test('low stock alerts include products with stock <= 3 sorted ascending', async () => {
    // Update one product to critical stock of 2
    await Product.updateOne({ slug: 'minimalist-linen-overshirt' }, { stock: 2 });
    // Update another to critical stock of 1
    await Product.updateOne({ slug: 'heavyweight-organic-cotton-tee' }, { stock: 1 });

    const res = await fetch(`${baseUrl}/api/admin/summary`, {
      headers: { Cookie: adminCookie },
    });
    const data = await res.json();

    assert.ok(data.lowStockAlerts >= 2);
    assert.ok(Array.isArray(data.lowStockProducts));
    assert.ok(data.lowStockProducts.length >= 2);
    // Verified ascending order
    assert.ok(data.lowStockProducts[0].stock <= data.lowStockProducts[1].stock);
  });
});

test('Admin Order Management, Listing & Searching', async (t) => {
  await t.test('returns paginated orders in Spring Data Page format', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders?page=0&size=2`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const page = await res.json();

    assert.ok(Array.isArray(page.content));
    assert.strictEqual(page.content.length, 2);
    assert.strictEqual(page.size, 2);
    assert.strictEqual(page.number, 0);
    assert.strictEqual(page.first, true);
    assert.strictEqual(page.empty, false);
    assert.ok(page.totalElements >= 5);
    assert.ok(page.totalPages >= 3);
  });

  await t.test('filters orders by status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders?status=SHIPPED`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const page = await res.json();

    assert.strictEqual(page.content.length, 1);
    assert.strictEqual(page.content[0].orderNumber, 'AF-100002');
    assert.strictEqual(page.content[0].status, 'SHIPPED');
  });

  await t.test('searches orders by order number', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders?query=AF-100002`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const page = await res.json();

    assert.strictEqual(page.content.length, 1);
    assert.strictEqual(page.content[0].orderNumber, 'AF-100002');
  });

  await t.test('searches orders by customer email', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders?query=customer@arcandform.com`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const page = await res.json();

    assert.ok(page.content.length >= 1);
    assert.strictEqual(page.content[0].customerEmail, 'customer@arcandform.com');
  });

  await t.test('searches orders by tracking number', async () => {
    const res = await fetch(`${baseUrl}/api/admin/orders?query=TRK-987654`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res.status, 200);
    const page = await res.json();

    assert.strictEqual(page.content.length, 1);
    assert.strictEqual(page.content[0].trackingNumber, 'TRK-987654');
  });

  await t.test('retrieves single order details by id and orderNumber', async () => {
    const targetOrder = await Order.findOne({ orderNumber: 'AF-100001' });

    // Lookup by MongoDB ObjectId
    const res1 = await fetch(`${baseUrl}/api/admin/orders/${targetOrder._id}`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res1.status, 200);
    const data1 = await res1.json();
    assert.strictEqual(data1.orderNumber, 'AF-100001');

    // Lookup by orderNumber
    const res2 = await fetch(`${baseUrl}/api/admin/orders/AF-100001`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res2.status, 200);
    const data2 = await res2.json();
    assert.strictEqual(data2.orderNumber, 'AF-100001');

    // Non-existent ID returns 404
    const res3 = await fetch(`${baseUrl}/api/admin/orders/AF-DOES-NOT-EXIST`, {
      headers: { Cookie: adminCookie },
    });
    assert.strictEqual(res3.status, 404);
  });
});

test('Admin Order Status Transitions & Strict Invariants', async (t) => {
  await t.test('transitions PAID order to SHIPPED and updates carrier tracking number', async () => {
    const targetOrder = await Order.findOne({ orderNumber: 'AF-100001' });

    const res = await fetch(`${baseUrl}/api/admin/orders/${targetOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'SHIPPED',
        trackingNumber: 'UPS-1Z9999999999999999',
      }),
    });

    assert.strictEqual(res.status, 200);
    const updated = await res.json();
    assert.strictEqual(updated.status, 'SHIPPED');
    assert.strictEqual(updated.trackingNumber, 'UPS-1Z9999999999999999');

    // Verify DB persistence
    const refreshed = await Order.findById(targetOrder._id);
    assert.strictEqual(refreshed.status, 'SHIPPED');
    assert.strictEqual(refreshed.trackingNumber, 'UPS-1Z9999999999999999');
  });

  await t.test('transitions SHIPPED order to DELIVERED', async () => {
    const targetOrder = await Order.findOne({ orderNumber: 'AF-100001' });

    const res = await fetch(`${baseUrl}/api/admin/orders/${targetOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'DELIVERED',
      }),
    });

    assert.strictEqual(res.status, 200);
    const updated = await res.json();
    assert.strictEqual(updated.status, 'DELIVERED');
  });

  await t.test('STRICT INVARIANT: refuses to mark an unpaid PENDING order as PAID via admin update', async () => {
    const pendingOrder = await Order.findOne({ orderNumber: 'AF-100004' });
    assert.strictEqual(pendingOrder.status, 'PENDING');

    const res = await fetch(`${baseUrl}/api/admin/orders/${pendingOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'PAID',
      }),
    });

    assert.strictEqual(res.status, 400);
    const err = await res.json();
    assert.ok(err.message.includes('Cannot fulfill an unpaid order'));

    // Verify database status remains strictly PENDING
    const unchanged = await Order.findById(pendingOrder._id);
    assert.strictEqual(unchanged.status, 'PENDING');
  });

  await t.test('STRICT INVARIANT: refuses to mark an unpaid PENDING order as SHIPPED or DELIVERED', async () => {
    const pendingOrder = await Order.findOne({ orderNumber: 'AF-100004' });

    const res = await fetch(`${baseUrl}/api/admin/orders/${pendingOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'SHIPPED',
      }),
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test('STRICT INVARIANT: refuses to revert a DELIVERED order', async () => {
    const deliveredOrder = await Order.findOne({ status: 'DELIVERED' });

    const res = await fetch(`${baseUrl}/api/admin/orders/${deliveredOrder._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'PAID',
      }),
    });

    assert.strictEqual(res.status, 400);
    const err = await res.json();
    assert.ok(err.message.includes('Delivered orders are final'));
  });

  await t.test('STRICT INVARIANT: cancels order and restores reserved product inventory atomically', async () => {
    // Create a product with known stock = 10
    const cancelTestProduct = await Product.create({
      name: 'Restock Verification Piece',
      slug: 'restock-verification-piece',
      description: 'Used to verify inventory restoration on cancellation',
      price: 90.0,
      stock: 10,
      featured: false,
      category: sampleCategory._id,
    });

    // Create a PAID order reserving 3 units of this piece
    const orderToCancel = await Order.create({
      orderNumber: 'AF-CANCEL-TEST',
      user: seededCustomer._id,
      status: 'PAID',
      total: 270.0,
      shippingAddress: {
        fullName: 'Restock Customer',
        addressLine1: '456 Restock Blvd',
        city: 'Chicago',
        state: 'IL',
        postalCode: '60601',
        country: 'US',
      },
      stockReserved: true,
      items: [
        {
          product: cancelTestProduct._id,
          productName: cancelTestProduct.name,
          quantity: 3,
          unitPrice: 90.0,
          subtotal: 270.0,
        },
      ],
    });

    // Simulate inventory state after reservation (10 - 3 = 7)
    await Product.updateOne({ _id: cancelTestProduct._id }, { stock: 7 });

    // Admin cancels the order
    const res = await fetch(`${baseUrl}/api/admin/orders/${orderToCancel._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'CANCELLED',
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'CANCELLED');

    // Verify stock is restored back from 7 to 10!
    const restockedProduct = await Product.findById(cancelTestProduct._id);
    assert.strictEqual(restockedProduct.stock, 10);

    // Verify order stockReserved flag is now false
    const updatedOrder = await Order.findById(orderToCancel._id);
    assert.strictEqual(updatedOrder.stockReserved, false);
    assert.strictEqual(updatedOrder.status, 'CANCELLED');

    // Attempting to modify this cancelled order fails and never double-releases stock
    const retryRes = await fetch(`${baseUrl}/api/admin/orders/${orderToCancel._id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'PAID',
      }),
    });
    assert.strictEqual(retryRes.status, 400);

    // Stock remains unchanged at 10
    const finalProduct = await Product.findById(cancelTestProduct._id);
    assert.strictEqual(finalProduct.stock, 10);
  });
});

test('Cloudinary Image Upload & Asset Management', async (t) => {
  await t.test('uploads valid JPEG image and returns 201 with secure url and publicId', async () => {
    const formData = new FormData();
    const blob = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
    formData.append('file', blob, 'studio-piece.jpg');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.url);
    assert.ok(data.publicId);
  });

  await t.test('uploads valid PNG image and returns 201', async () => {
    const formData = new FormData();
    const blob = new Blob([PNG_HEADER], { type: 'image/png' });
    formData.append('file', blob, 'studio-piece.png');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.url);
    assert.ok(data.publicId);
  });

  await t.test('uploads valid WebP image and returns 201', async () => {
    const formData = new FormData();
    const blob = new Blob([WEBP_HEADER], { type: 'image/webp' });
    formData.append('file', blob, 'studio-piece.webp');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.url);
    assert.ok(data.publicId);
  });

  await t.test('uploads valid GIF image and returns 201', async () => {
    const formData = new FormData();
    const blob = new Blob([GIF_HEADER], { type: 'image/gif' });
    formData.append('file', blob, 'studio-piece.gif');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.url);
    assert.ok(data.publicId);
  });

  await t.test('rejects non-image MIME type (e.g. text/plain)', async () => {
    const formData = new FormData();
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    formData.append('file', blob, 'notes.txt');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 400);
    const err = await res.json();
    assert.ok(err.message.includes('Unsupported image type'));
  });

  await t.test('STRICT SECURITY: detects file spoofing (text file disguised with image/jpeg mime header)', async () => {
    const formData = new FormData();
    // Claiming image/jpeg, but body contains plain text (does not match FF D8 FF)
    const spoofedContent = Buffer.from('Plain text disguised as a picture');
    const blob = new Blob([spoofedContent], { type: 'image/jpeg' });
    formData.append('file', blob, 'fake.jpg');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 400);
    const err = await res.json();
    assert.ok(
      err.message.includes('signature') || err.message.includes('Corrupted')
    );
  });

  await t.test('rejects upload when file exceeds 5MB limit', async () => {
    const formData = new FormData();
    // Allocate 6MB buffer
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024);
    // Write valid JPEG header at the start
    JPEG_HEADER.copy(largeBuffer, 0);

    const blob = new Blob([largeBuffer], { type: 'image/jpeg' });
    formData.append('file', blob, 'oversized.jpg');

    const res = await fetch(`${baseUrl}/api/admin/uploads/image`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: formData,
    });

    assert.strictEqual(res.status, 400);
    const err = await res.json();
    assert.ok(err.message.includes('5MB'));
  });

  await t.test('deletes image via DELETE /api/admin/uploads/image/:publicId', async () => {
    const res = await fetch(`${baseUrl}/api/admin/uploads/image/mock_asset_12345`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.publicId, 'mock_asset_12345');
    assert.strictEqual(data.result, 'ok');
  });

  await t.test('Cloudinary SDK stream upload test with mocked SDK client', async () => {
    let uploadStreamCalled = false;
    let pipedFolder = '';

    const mockCloudinaryClient = {
      config: () => {},
      uploader: {
        upload_stream: (options, callback) => {
          uploadStreamCalled = true;
          pipedFolder = options.folder;
          // Return writable stream that simulates immediate Cloudinary response
          const stream = new Writable({
            write(chunk, encoding, next) {
              next();
            },
            final(callbackDone) {
              callback(null, {
                secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/mock.jpg',
                public_id: 'arc_and_form/products/mock_asset_live',
              });
              callbackDone();
            },
          });
          return stream;
        },
        destroy: async (id) => ({ result: 'ok', public_id: id }),
      },
    };

    // Temporarily inject mock SDK client into CloudinaryService
    CloudinaryService.setClient(mockCloudinaryClient);
    CloudinaryService.setForceConfigured(true);

    try {
      const result = await CloudinaryService.uploadImage(
        JPEG_HEADER,
        'test.jpg',
        'image/jpeg'
      );

      assert.strictEqual(uploadStreamCalled, true);
      assert.strictEqual(pipedFolder, 'arc_and_form/products');
      assert.strictEqual(
        result.url,
        'https://res.cloudinary.com/test-cloud/image/upload/v1/mock.jpg'
      );
      assert.strictEqual(result.publicId, 'arc_and_form/products/mock_asset_live');
    } finally {
      // Restore defaults
      CloudinaryService.setClient(null);
      CloudinaryService.setForceConfigured(false);
    }
  });
});
