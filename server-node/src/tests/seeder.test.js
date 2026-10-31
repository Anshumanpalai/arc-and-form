import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { seedDatabase } from '../seed/seeder.js';

test.before(async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);
  await Promise.all([
    User.syncIndexes(),
    Category.syncIndexes(),
    Product.syncIndexes(),
  ]);
});

test.after(async () => {
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);
  await disconnectDB();
});

test.describe('Database Seeder & Idempotency', () => {
  test('initial seeding creates 4 categories, 2 users, and 20 products accurately', async () => {
    const stats = await seedDatabase({ silent: true });

    assert.equal(stats.categoriesCreated, 4);
    assert.equal(stats.usersCreated, 2);
    assert.equal(stats.productsCreated, 20);

    const [catCount, userCount, prodCount] = await Promise.all([
      Category.countDocuments(),
      User.countDocuments(),
      Product.countDocuments(),
    ]);

    assert.equal(catCount, 4);
    assert.equal(userCount, 2);
    assert.equal(prodCount, 20);

    // Verify Categories
    const categories = await Category.find().sort({ slug: 1 });
    const slugs = categories.map((c) => c.slug);
    assert.deepEqual(slugs, ['accessories', 'essentials', 'home-and-desk', 'outerwear']);

    // Verify Demo Admin
    const admin = await User.findOne({ email: 'admin@arcandform.com' });
    assert.ok(admin);
    assert.equal(admin.role, 'ADMIN');
    assert.equal(admin.name, 'Arc & Form Admin');
    assert.equal(await admin.comparePassword('Admin@123!'), true);
    assert.equal(await admin.comparePassword('WrongPassword'), false);

    // Verify Demo Customer
    const customer = await User.findOne({ email: 'customer@arcandform.com' });
    assert.ok(customer);
    assert.equal(customer.role, 'CUSTOMER');
    assert.equal(customer.name, 'Demo Customer');
    assert.equal(await customer.comparePassword('Customer@123!'), true);

    // Verify Products and category linkage
    const products = await Product.find().populate('category');
    assert.equal(products.length, 20);

    for (const prod of products) {
      assert.ok(prod.category, `Product ${prod.slug} must have a populated category`);
      assert.ok(prod.price >= 0);
      assert.ok(prod.stock >= 0);
      assert.ok(Array.isArray(prod.images));
      assert.ok(Array.isArray(prod.sizes));
    }

    // Verify specific products ported from DataSeeder.java
    const parka = await Product.findOne({ slug: 'technical-shell-parka' });
    assert.ok(parka);
    assert.equal(parka.stock, 0); // Out of stock

    const choreJacket = await Product.findOne({ slug: 'boiled-wool-chore-jacket' });
    assert.ok(choreJacket);
    assert.equal(choreJacket.stock, 2); // Low stock
    assert.equal(choreJacket.featured, true);

    const deskTray = await Product.findOne({ slug: 'solid-walnut-desk-tray' });
    assert.ok(deskTray);
    assert.equal(deskTray.price, 52.0);
  });

  test('subsequent execution is completely idempotent (no duplicates, preserves passwords)', async () => {
    // Run second time
    const secondStats = await seedDatabase({ silent: true });

    assert.equal(secondStats.categoriesCreated, 0);
    assert.equal(secondStats.categoriesSkipped, 4);
    assert.equal(secondStats.usersCreated, 0);
    assert.equal(secondStats.usersSkipped, 2);
    assert.equal(secondStats.productsCreated, 0);
    assert.equal(secondStats.productsSkipped, 20);

    const [catCount, userCount, prodCount] = await Promise.all([
      Category.countDocuments(),
      User.countDocuments(),
      Product.countDocuments(),
    ]);

    assert.equal(catCount, 4);
    assert.equal(userCount, 2);
    assert.equal(prodCount, 20);

    // Ensure demo accounts were not corrupted or passwords overwritten
    const admin = await User.findOne({ email: 'admin@arcandform.com' });
    assert.equal(await admin.comparePassword('Admin@123!'), true);

    const customer = await User.findOne({ email: 'customer@arcandform.com' });
    assert.equal(await customer.comparePassword('Customer@123!'), true);
  });
});

