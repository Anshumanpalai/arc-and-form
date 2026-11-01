import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { seedDatabase } from '../seed/seeder.js';

let app;
let server;
let baseUrl;

// Authentic binary fixture for JPEG image upload
const JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
]);

test.before(async () => {
  process.env.USE_MEMORY_DB = 'true';
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'journey-test-jwt-secret-key-32-chars-long!';

  await connectDB();
  await seedDatabase({ silent: true });

  app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

test('Complete Full-Stack Journey: Customer Experience & Studio Admin Operations (Phase 7)', async () => {
  // =========================================================================
  // PART 1: CUSTOMER JOURNEY
  // =========================================================================

  // 1. Customer Registration
  const customerEmail = `journey.customer.${Date.now()}@example.com`;
  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Elena Rostova',
      email: customerEmail,
      password: 'Password123!',
    }),
  });

  assert.strictEqual(regRes.status, 201);
  const regData = await regRes.json();
  assert.strictEqual(regData.user.name, 'Elena Rostova');
  assert.strictEqual(regData.user.email, customerEmail);
  assert.strictEqual(regData.user.role, 'CUSTOMER');

  // Extract HttpOnly cookie
  const setCookie = regRes.headers.get('set-cookie');
  assert.ok(setCookie, 'set-cookie header must be present');
  const customerCookie = setCookie.split(';')[0];
  assert.ok(customerCookie.startsWith('arc_token='), 'Must set arc_token cookie');

  // 2. Session verification via /me with cookie
  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: customerCookie },
  });
  assert.strictEqual(meRes.status, 200);
  const meData = await meRes.json();
  assert.strictEqual(meData.email, customerEmail);

  // 3. Browse Categories & Catalog
  const catRes = await fetch(`${baseUrl}/api/categories`);
  assert.strictEqual(catRes.status, 200);
  const catData = await catRes.json();
  assert.ok(Array.isArray(catData.categories));
  assert.ok(catData.categories.length > 0);

  const prodRes = await fetch(`${baseUrl}/api/products?page=1&limit=12&sort=newest`);
  assert.strictEqual(prodRes.status, 200);
  const prodData = await prodRes.json();
  assert.ok(Array.isArray(prodData.products));
  assert.ok(prodData.products.length > 0);

  // 4. Product Details
  const chosenProduct = prodData.products[0];
  const detailRes = await fetch(`${baseUrl}/api/products/${chosenProduct.slug}`);
  assert.strictEqual(detailRes.status, 200);
  const detailData = await detailRes.json();
  assert.strictEqual(detailData.product.slug, chosenProduct.slug);
  const initialStock = detailData.product.stock;
  assert.ok(initialStock >= 2, 'Product must have available inventory');

  // 5. Checkout
  const checkoutRes = await fetch(`${baseUrl}/api/orders/checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: customerCookie,
    },
    body: JSON.stringify({
      items: [
        {
          productId: chosenProduct.id,
          quantity: 2,
          selectedSize: chosenProduct.sizes?.[0] || 'M',
        },
      ],
      shippingAddress: {
        fullName: 'Elena Rostova',
        addressLine1: '450 Minimalist Blvd',
        addressLine2: 'Suite 800',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'United States',
      },
    }),
  });

  assert.strictEqual(checkoutRes.status, 201);
  const checkoutData = await checkoutRes.json();
  assert.ok(checkoutData.checkoutUrl, 'Checkout URL must be returned');
  assert.ok(checkoutData.orderNumber, 'Order number must be returned');
  const orderNumber = checkoutData.orderNumber;

  // Verify stock reserved
  const postCheckoutProd = await Product.findById(chosenProduct.id);
  assert.strictEqual(postCheckoutProd.stock, initialStock - 2, 'Stock must decrement by 2');

  // 6. Simulate Stripe Webhook Confirmation
  const createdOrder = await Order.findOne({ orderNumber });
  assert.strictEqual(createdOrder.status, 'PENDING');

  const webhookEvent = {
    id: `evt_journey_${Date.now()}`,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: createdOrder.stripeSessionId,
        payment_status: 'paid',
        amount_total: Math.round(createdOrder.total * 100),
        currency: 'usd',
        metadata: {
          orderNumber: createdOrder.orderNumber,
          orderId: createdOrder._id.toString(),
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
    body: JSON.stringify(webhookEvent),
  });

  assert.strictEqual(webhookRes.status, 200);

  // 7. Verify Order Details on Confirmation Page (/checkout/success)
  const successRes = await fetch(`${baseUrl}/api/orders/${orderNumber}`, {
    headers: { Cookie: customerCookie },
  });
  assert.strictEqual(successRes.status, 200);
  const successData = await successRes.json();
  assert.strictEqual(successData.order.orderNumber, orderNumber);
  assert.strictEqual(successData.order.status, 'PAID');
  assert.strictEqual(successData.order.items.length, 1);
  assert.strictEqual(successData.order.items[0].quantity, 2);

  // 8. Verify Customer Order History (/orders)
  const historyRes = await fetch(`${baseUrl}/api/orders?page=1&limit=20`, {
    headers: { Cookie: customerCookie },
  });
  assert.strictEqual(historyRes.status, 200);
  const historyData = await historyRes.json();
  assert.ok(Array.isArray(historyData.content));
  const found = historyData.content.find((o) => o.orderNumber === orderNumber);
  assert.ok(found, 'Order must appear in customer order history');
  assert.strictEqual(found.status, 'PAID');

  // =========================================================================
  // PART 2: ADMIN JOURNEY
  // =========================================================================

  // 1. Admin Login
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@arcandform.com',
      password: 'Admin@123!',
    }),
  });

  assert.strictEqual(loginRes.status, 200);
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.user.role, 'ADMIN');

  const adminCookie = loginRes.headers.get('set-cookie').split(';')[0];
  assert.ok(adminCookie.startsWith('arc_token='), 'Must set admin arc_token cookie');

  // 2. Dashboard Overview & KPI Metrics
  const summaryRes = await fetch(`${baseUrl}/api/admin/summary`, {
    headers: { Cookie: adminCookie },
  });
  assert.strictEqual(summaryRes.status, 200);
  const summaryData = await summaryRes.json();
  assert.ok(summaryData.totalRevenue >= createdOrder.total, 'Revenue must reflect paid orders');
  assert.ok(summaryData.totalOrders >= 1);
  assert.ok(Array.isArray(summaryData.recentOrders));
  assert.ok(Array.isArray(summaryData.lowStockProducts));

  // 3. Upload Product Image to Cloudinary (Mock/SDK)
  const formData = new FormData();
  const blob = new Blob([JPEG_HEADER], { type: 'image/jpeg' });
  formData.append('file', blob, 'minimal-coat.jpg');

  const uploadRes = await fetch(`${baseUrl}/api/admin/uploads/image`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: formData,
  });

  assert.strictEqual(uploadRes.status, 201);
  const uploadData = await uploadRes.json();
  assert.ok(uploadData.url, 'Image URL must be returned');
  assert.ok(uploadData.publicId, 'Public ID must be returned');
  const uploadedImageUrl = uploadData.url;

  // 4. Create Product with Category & Uploaded Image
  const category = await Category.findOne({ slug: 'outerwear' });
  assert.ok(category, 'Outerwear category must exist');

  const newProductRes = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      name: 'Architectural Trench Coat',
      slug: `architectural-trench-coat-${Date.now()}`,
      description: 'Double-breasted trench in water-repellent Japanese gabardine cotton.',
      price: 380.0,
      stock: 8,
      categoryId: category._id.toString(),
      featured: true,
      sizes: ['S', 'M', 'L'],
      images: [uploadedImageUrl],
    }),
  });

  assert.strictEqual(newProductRes.status, 201);
  const newProductData = await newProductRes.json();
  assert.strictEqual(newProductData.name, 'Architectural Trench Coat');
  assert.strictEqual(newProductData.price, 380);
  assert.strictEqual(newProductData.stock, 8);
  const createdProductId = newProductData.id;

  // 5. Update Product (e.g. adjust stock and price)
  const updateProdRes = await fetch(`${baseUrl}/api/admin/products/${createdProductId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      name: 'Architectural Trench Coat (Refined)',
      price: 395.0,
      stock: 12,
      categoryId: category._id.toString(),
      description: 'Double-breasted trench in water-repellent Japanese gabardine cotton with storm flap.',
      sizes: ['S', 'M', 'L', 'XL'],
      images: [uploadedImageUrl],
    }),
  });

  assert.strictEqual(updateProdRes.status, 200);
  const updateProdData = await updateProdRes.json();
  assert.strictEqual(updateProdData.price, 395);
  assert.strictEqual(updateProdData.stock, 12);

  // 6. View Orders List & Locate the Customer Order
  const ordersRes = await fetch(`${baseUrl}/api/admin/orders?status=PAID&page=0&size=20`, {
    headers: { Cookie: adminCookie },
  });

  assert.strictEqual(ordersRes.status, 200);
  const ordersData = await ordersRes.json();
  assert.ok(Array.isArray(ordersData.content));
  const targetOrder = ordersData.content.find((o) => o.orderNumber === orderNumber);
  assert.ok(targetOrder, 'Customer order must appear in admin orders listing');

  // 7. Update Order Status to SHIPPED and add Tracking Number
  const shipRes = await fetch(`${baseUrl}/api/admin/orders/${targetOrder.id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: adminCookie,
    },
    body: JSON.stringify({
      status: 'SHIPPED',
      trackingNumber: 'TRK-ARC-987654',
    }),
  });

  assert.strictEqual(shipRes.status, 200);
  const shipData = await shipRes.json();
  assert.strictEqual(shipData.status, 'SHIPPED');
  assert.strictEqual(shipData.trackingNumber, 'TRK-ARC-987654');

  // 8. Verify Status Updated in Single Order Details
  const verifyOrderRes = await fetch(`${baseUrl}/api/admin/orders/${targetOrder.id}`, {
    headers: { Cookie: adminCookie },
  });

  assert.strictEqual(verifyOrderRes.status, 200);
  const verifyOrderData = await verifyOrderRes.json();
  assert.strictEqual(verifyOrderData.status, 'SHIPPED');
  assert.strictEqual(verifyOrderData.trackingNumber, 'TRK-ARC-987654');
});
