import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { seedDatabase } from '../seed/seeder.js';
import { AdminProductService } from '../services/adminProductService.js';

let app;
let server;
let baseUrl;
let adminCookie;
let customerCookie;

test.before(async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);

  // Seed standard 4 categories, 2 users, and 20 products
  await seedDatabase({ silent: true });

  app = createApp();

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });

  // Login as admin
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@arcandform.com', password: 'Admin@123!' }),
  });
  adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

  // Login as customer
  const customerLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'customer@arcandform.com', password: 'Customer@123!' }),
  });
  customerCookie = customerLogin.headers.get('set-cookie').split(';')[0];
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);
  await disconnectDB();
});

test.describe('Public Categories API (GET /api/categories)', () => {
  test('returns all categories ordered alphabetically by name', async () => {
    const res = await fetch(`${baseUrl}/api/categories`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.categories));
    assert.equal(data.categories.length, 4);

    const names = data.categories.map((c) => c.name);
    assert.deepEqual(names, ['Accessories', 'Essentials', 'Home & Desk', 'Outerwear']);

    for (const cat of data.categories) {
      assert.ok(cat.id);
      assert.ok(cat.name);
      assert.ok(cat.slug);
      assert.equal(cat.__v, undefined);
    }
  });
});

test.describe('Public Products API (GET /api/products)', () => {
  test('returns paginated products list with pagination metadata', async () => {
    const res = await fetch(`${baseUrl}/api/products?page=1&limit=10`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.products));
    assert.equal(data.products.length, 10);
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.limit, 10);
    assert.equal(data.pagination.total, 20);
    assert.equal(data.pagination.pages, 2);

    // Verify populated category
    const first = data.products[0];
    assert.ok(first.category);
    assert.ok(first.category.name);
    assert.ok(first.category.slug);
  });

  test('filters products by category slug', async () => {
    const res = await fetch(`${baseUrl}/api/products?category=outerwear`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.products.length, 5);
    for (const prod of data.products) {
      assert.equal(prod.category.slug, 'outerwear');
    }
  });

  test('searches products by search keyword case-insensitively', async () => {
    const res = await fetch(`${baseUrl}/api/products?search=Trench`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.products.length, 1);
    assert.equal(data.products[0].slug, 'structured-twill-trench');
  });

  test('sorts products by price ascending and descending', async () => {
    const resAsc = await fetch(`${baseUrl}/api/products?sort=price_asc&limit=20`);
    const dataAsc = await resAsc.json();
    const pricesAsc = dataAsc.products.map((p) => p.price);

    for (let i = 0; i < pricesAsc.length - 1; i++) {
      assert.ok(pricesAsc[i] <= pricesAsc[i + 1], 'Prices must be non-decreasing');
    }

    const resDesc = await fetch(`${baseUrl}/api/products?sort=price_desc&limit=20`);
    const dataDesc = await resDesc.json();
    const pricesDesc = dataDesc.products.map((p) => p.price);

    for (let i = 0; i < pricesDesc.length - 1; i++) {
      assert.ok(pricesDesc[i] >= pricesDesc[i + 1], 'Prices must be non-increasing');
    }
  });

  test('handles invalid/extreme pagination parameters safely without crashing', async () => {
    const res = await fetch(`${baseUrl}/api/products?page=-5&limit=999&sort=unrecognized`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.pagination.page, 1);
    assert.equal(data.pagination.limit, 48); // Clamped to max limit
    assert.equal(data.products.length, 20);
  });
});

test.describe('Public Single Product API (GET /api/products/:slug)', () => {
  test('returns single product details by slug', async () => {
    const res = await fetch(`${baseUrl}/api/products/heavyweight-organic-cotton-tee`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(data.product);
    assert.equal(data.product.name, 'Heavyweight Organic Cotton Tee');
    assert.equal(data.product.category.slug, 'essentials');
  });

  test('returns 404 Not Found for non-existent product slug', async () => {
    const res = await fetch(`${baseUrl}/api/products/non-existent-product-slug`);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.status, 404);
    assert.equal(data.error, 'Not Found');
    assert.ok(data.message.includes('non-existent-product-slug'));
  });
});

test.describe('Admin Products API (/api/admin/products)', () => {
  let essentialsCategory;

  test.before(async () => {
    essentialsCategory = await Category.findOne({ slug: 'essentials' });
  });

  test('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/admin/products`);
    assert.equal(res.status, 401);
  });

  test('rejects customer requests with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/products`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(res.status, 403);
  });

  test('allows admin to list products in Spring Data Page format', async () => {
    const res = await fetch(`${baseUrl}/api/admin/products?page=0&size=50`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.ok(Array.isArray(data.content));
    assert.equal(data.totalElements, 20);
    assert.equal(data.number, 0);
    assert.equal(data.first, true);
  });

  test('allows admin to create a product with validation', async () => {
    const newProductPayload = {
      name: 'Architectural Linen Blazer',
      slug: 'architectural-linen-blazer',
      description: 'Structured lightweight Irish linen blazer.',
      price: 185.0,
      stock: 14,
      featured: true,
      categoryId: essentialsCategory.id,
      sizes: ['38', '40', '42'],
      images: ['https://images.unsplash.com/photo-1507679799987-c73779587ccf'],
    };

    const res = await fetch(`${baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify(newProductPayload),
    });

    assert.equal(res.status, 201);
    const created = await res.json();
    assert.ok(created.id);
    assert.equal(created.name, 'Architectural Linen Blazer');
    assert.equal(created.slug, 'architectural-linen-blazer');
    assert.equal(created.category.name, 'Essentials');
  });

  test('rejects creation when category does not exist', async () => {
    const res = await fetch(`${baseUrl}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Invalid Cat Prod',
        description: 'Desc',
        price: 50,
        stock: 5,
        categoryId: '64b0f0000000000000000000', // Non-existent ObjectId
      }),
    });

    assert.equal(res.status, 404);
  });

  test('allows admin to update an existing product', async () => {
    const prod = await Product.findOne({ slug: 'architectural-linen-blazer' });

    const res = await fetch(`${baseUrl}/api/admin/products/${prod.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: 'Architectural Linen Blazer Updated',
        price: 195.0,
        stock: 10,
        categoryId: essentialsCategory.id,
      }),
    });

    assert.equal(res.status, 200);
    const updated = await res.json();
    assert.equal(updated.name, 'Architectural Linen Blazer Updated');
    assert.equal(updated.price, 195.0);
    assert.equal(updated.stock, 10);
  });

  test('rejects update with duplicate slug on another product', async () => {
    const prodA = await Product.findOne({ slug: 'pima-crewneck-longsleeve' });

    const res = await fetch(`${baseUrl}/api/admin/products/${prodA.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: prodA.name,
        slug: 'heavyweight-organic-cotton-tee', // Conflicts with product B
        categoryId: essentialsCategory.id,
      }),
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.message.includes('already exists'));
  });

  test('rejects concurrent edit when outdated version key is passed', async () => {
    const prod = await Product.findOne({ slug: 'raw-selvedge-denim-trouser' });

    const res = await fetch(`${baseUrl}/api/admin/products/${prod.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        name: prod.name,
        categoryId: essentialsCategory.id,
        version: prod.__v + 999, // Stale/mismatched version
      }),
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.error, 'Conflict');
  });

  test('allows admin to delete a product', async () => {
    const prod = await Product.findOne({ slug: 'architectural-linen-blazer' });

    const res = await fetch(`${baseUrl}/api/admin/products/${prod.id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    });

    assert.equal(res.status, 204);

    const lookup = await Product.findById(prod.id);
    assert.equal(lookup, null);
  });

  test('prevents deleting a category that has products attached', async () => {
    await assert.rejects(
      AdminProductService.deleteCategory(essentialsCategory.id),
      (err) => err.status === 409 && err.message.includes('referenced by existing products')
    );
  });
});

