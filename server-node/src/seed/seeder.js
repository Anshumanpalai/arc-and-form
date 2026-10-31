import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { initialCategories, initialUsers, initialProducts } from './seedData.js';

/**
 * Idempotently seed ARC & FORM categories, demo users, and products.
 * Never creates duplicate records or overwrites existing user passwords.
 */
export async function seedDatabase(options = {}) {
  const silent = options.silent ?? false;
  const log = (...args) => {
    if (!silent) console.log('[seeder]', ...args);
  };

  const stats = {
    usersCreated: 0,
    usersSkipped: 0,
    categoriesCreated: 0,
    categoriesSkipped: 0,
    productsCreated: 0,
    productsSkipped: 0,
  };

  log('Beginning database seeding verification...');

  // 1. Seed Categories idempotently
  const categoryMap = new Map();
  for (const cat of initialCategories) {
    let existing = await Category.findOne({ slug: cat.slug });
    if (!existing) {
      existing = await Category.create({
        name: cat.name,
        slug: cat.slug,
      });
      stats.categoriesCreated++;
      log(`Created category: ${cat.name} (${cat.slug})`);
    } else {
      stats.categoriesSkipped++;
    }
    categoryMap.set(cat.slug, existing);
  }

  // 2. Seed Users idempotently (preserve existing passwords without re-hashing)
  for (const user of initialUsers) {
    const normalizedEmail = user.email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (!existing) {
      const passwordHash = await User.hashPassword(user.password);
      await User.create({
        name: user.name,
        email: normalizedEmail,
        passwordHash,
        role: user.role,
      });
      stats.usersCreated++;
      log(`Created user: ${user.name} <${normalizedEmail}> [${user.role}]`);
    } else {
      stats.usersSkipped++;
    }
  }

  // 3. Seed Products idempotently
  for (const prod of initialProducts) {
    const categoryDoc = categoryMap.get(prod.categorySlug);
    if (!categoryDoc) {
      throw new Error(`Category not found for slug: ${prod.categorySlug}`);
    }

    const existing = await Product.findOne({ slug: prod.slug });
    if (!existing) {
      await Product.create({
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price,
        stock: prod.stock,
        featured: prod.featured,
        category: categoryDoc._id,
        sizes: prod.sizes,
        images: prod.images,
      });
      stats.productsCreated++;
      log(`Created product: ${prod.name} (${prod.slug})`);
    } else {
      stats.productsSkipped++;
    }
  }

  log('Seeding summary:', stats);
  return stats;
}

