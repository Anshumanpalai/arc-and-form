import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';

test.before(async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
  ]);
  // Ensure indexes are built
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

test.describe('User Model Validations & Security', () => {
  test('fails validation when required fields are missing', async () => {
    const invalidUser = new User({});
    let error;
    try {
      await invalidUser.validate();
    } catch (err) {
      error = err;
    }
    assert.ok(error);
    assert.ok(error.errors.name);
    assert.ok(error.errors.email);
    assert.ok(error.errors.passwordHash);
  });

  test('fails validation with invalid email format', async () => {
    const invalidEmailUser = new User({
      name: 'Test',
      email: 'not-an-email',
      passwordHash: 'hash123',
    });
    await assert.rejects(invalidEmailUser.validate(), /valid email/);
  });

  test('fails validation with unsupported role', async () => {
    const invalidRoleUser = new User({
      name: 'Test',
      email: 'role@test.com',
      passwordHash: 'hash123',
      role: 'SUPERADMIN',
    });
    await assert.rejects(invalidRoleUser.validate(), /not a valid role/);
  });

  test('correctly hashes password and validates with comparePassword', async () => {
    const plainPassword = 'SecretPassword!123';
    const hash = await User.hashPassword(plainPassword);
    const user = await User.create({
      name: 'Password Tester',
      email: 'password@test.com',
      passwordHash: hash,
      role: 'CUSTOMER',
    });

    const isMatch = await user.comparePassword(plainPassword);
    const isWrongMatch = await user.comparePassword('WrongPassword');

    assert.equal(isMatch, true);
    assert.equal(isWrongMatch, false);
  });

  test('never exposes passwordHash in JSON serialization and includes virtual id', async () => {
    const user = await User.create({
      name: 'Json Tester',
      email: 'json@test.com',
      passwordHash: await User.hashPassword('pass1234'),
    });

    const json = user.toJSON();
    assert.equal(json.passwordHash, undefined);
    assert.equal(json.__v, undefined);
    assert.equal(json.id, user._id.toString());
    assert.equal(json.email, 'json@test.com');
  });

  test('enforces unique email constraint', async () => {
    await User.create({
      name: 'Unique 1',
      email: 'duplicate@test.com',
      passwordHash: 'hash1',
    });

    await assert.rejects(
      User.create({
        name: 'Unique 2',
        email: 'duplicate@test.com',
        passwordHash: 'hash2',
      }),
      (err) => err.code === 11000
    );
  });
});

test.describe('Category Model Validations & Indexes', () => {
  test('fails validation when name or slug is missing', async () => {
    const emptyCat = new Category({});
    await assert.rejects(emptyCat.validate());
  });

  test('creates category successfully with id and slug', async () => {
    const cat = await Category.create({
      name: 'Test Category',
      slug: 'test-category',
    });

    assert.ok(cat._id);
    const json = cat.toJSON();
    assert.equal(json.id, cat._id.toString());
    assert.equal(json.slug, 'test-category');
  });

  test('enforces unique slug constraint', async () => {
    await Category.create({
      name: 'Slug 1',
      slug: 'unique-slug-test',
    });

    await assert.rejects(
      Category.create({
        name: 'Slug 2',
        slug: 'unique-slug-test',
      }),
      (err) => err.code === 11000
    );
  });
});

test.describe('Product Model Validations & Relationships', () => {
  let category;

  test.before(async () => {
    category = await Category.create({
      name: 'Apparel',
      slug: 'apparel',
    });
  });

  test('fails validation when required fields are missing', async () => {
    const emptyProd = new Product({});
    await assert.rejects(emptyProd.validate());
  });

  test('rejects negative price and stock', async () => {
    const prod = new Product({
      name: 'Invalid Price Prod',
      slug: 'invalid-price',
      description: 'Test',
      price: -10,
      stock: -5,
      category: category._id,
    });
    await assert.rejects(prod.validate());
  });

  test('creates product and populates category relationship', async () => {
    const prod = await Product.create({
      name: 'Oxford Shirt',
      slug: 'oxford-shirt',
      description: 'Classic tailored oxford shirt.',
      price: 65.0,
      stock: 10,
      featured: true,
      category: category._id,
      sizes: ['S', 'M', 'L'],
      images: ['https://example.com/shirt.jpg'],
    });

    const populated = await Product.findById(prod._id).populate('category');
    assert.equal(populated.category.name, 'Apparel');
    assert.equal(populated.category.slug, 'apparel');

    const json = populated.toJSON();
    assert.equal(json.id, prod._id.toString());
    assert.equal(json.category.name, 'Apparel');
    assert.equal(json.category.id, category._id.toString());
  });

  test('enforces optimistic concurrency control with version key', async () => {
    const prod = await Product.create({
      name: 'Concurrency Item',
      slug: 'concurrency-item',
      description: 'Testing concurrency',
      price: 100,
      stock: 20,
      category: category._id,
    });

    // Fetch two separate instances of the same document
    const instanceA = await Product.findById(prod._id);
    const instanceB = await Product.findById(prod._id);

    // Update instance A first
    instanceA.stock = 15;
    await instanceA.save();

    // Now update instance B with stale __v
    instanceB.stock = 10;
    await assert.rejects(instanceB.save(), (err) => err.name === 'VersionError');
  });

  test('enforces unique slug constraint', async () => {
    await Product.create({
      name: 'Prod A',
      slug: 'unique-prod-slug',
      description: 'Desc',
      price: 25,
      stock: 5,
      category: category._id,
    });

    await assert.rejects(
      Product.create({
        name: 'Prod B',
        slug: 'unique-prod-slug',
        description: 'Desc',
        price: 30,
        stock: 8,
        category: category._id,
      }),
      (err) => err.code === 11000
    );
  });
});

