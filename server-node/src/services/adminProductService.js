import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Category } from '../models/Category.js';
import { CloudinaryService } from './cloudinaryService.js';
import { ApiError } from '../utils/errors.js';
import { slugify } from '../utils/slugify.js';

export class AdminProductService {
  /**
   * Helper to resolve Category document by ObjectId, slug, or string.
   */
  static async resolveCategory(categoryRef) {
    if (!categoryRef) return null;

    if (mongoose.Types.ObjectId.isValid(categoryRef)) {
      const byId = await Category.findById(categoryRef);
      if (byId) return byId;
    }

    // Try finding by slug or stringified id
    return Category.findOne({
      $or: [
        { slug: String(categoryRef).trim() },
        { name: String(categoryRef).trim() },
      ],
    });
  }

  /**
   * Get paginated products for administration in Spring Data Page format.
   */
  static async getProducts({ search = '', categoryId = '', page = 0, size = 50 } = {}) {
    const pageIndex = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(size, 10) || 50));
    const skip = pageIndex * pageSize;

    const query = {};

    if (categoryId) {
      const categoryDoc = await this.resolveCategory(categoryId);
      if (categoryDoc) {
        query.category = categoryDoc._id;
      } else {
        // Provided category does not exist, return empty content
        return {
          content: [],
          totalElements: 0,
          totalPages: 0,
          size: pageSize,
          number: pageIndex,
          first: true,
          last: true,
          empty: true,
        };
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { slug: { $regex: escaped, $options: 'i' } },
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('category'),
      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      content: products.map((prod) => prod.toJSON()),
      totalElements: total,
      totalPages,
      size: pageSize,
      number: pageIndex,
      first: pageIndex === 0,
      last: pageIndex >= Math.max(0, totalPages - 1),
      empty: products.length === 0,
    };
  }

  /**
   * Create a new catalog product.
   */
  static async createProduct(data) {
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw ApiError.badRequest('Product name is required');
    }
    if (!data.description || typeof data.description !== 'string' || !data.description.trim()) {
      throw ApiError.badRequest('Product description is required');
    }
    if (data.price === undefined || Number(data.price) <= 0) {
      throw ApiError.badRequest('Price must be greater than zero');
    }
    if (data.stock === undefined || Number(data.stock) < 0) {
      throw ApiError.badRequest('Stock cannot be negative');
    }

    const categoryDoc = await this.resolveCategory(data.categoryId);
    if (!categoryDoc) {
      throw ApiError.notFound(`Category not found with id: ${data.categoryId}`);
    }

    let slug = data.slug ? slugify(data.slug) : slugify(data.name);
    if (!slug) {
      slug = `product-${Date.now()}`;
    }

    // Handle duplicate slug gracefully by appending unique suffix
    if (await Product.exists({ slug })) {
      slug = `${slug}-${Date.now() % 10000}`;
    }

    const product = new Product({
      name: data.name.trim(),
      slug,
      description: data.description.trim(),
      price: Number(data.price),
      stock: Number.parseInt(data.stock, 10) || 0,
      featured: Boolean(data.featured),
      category: categoryDoc._id,
      sizes: Array.isArray(data.sizes) ? data.sizes : [],
      images: Array.isArray(data.images) ? data.images : [],
    });

    const saved = await product.save();
    await saved.populate('category');
    return saved.toJSON();
  }

  /**
   * Update an existing catalog product.
   */
  static async updateProduct(productId, data) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw ApiError.notFound(`Product not found with id: ${productId}`);
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw ApiError.notFound(`Product not found with id: ${productId}`);
    }

    // Optimistic concurrency check: if client provides version, ensure matching
    if (data.version !== undefined && data.version !== null && data.version !== product.__v) {
      throw new ApiError('Product was modified concurrently by another user', 409, 'Conflict');
    }

    const categoryDoc = await this.resolveCategory(data.categoryId);
    if (!categoryDoc) {
      throw ApiError.notFound(`Category not found with id: ${data.categoryId}`);
    }

    if (data.price !== undefined && Number(data.price) <= 0) {
      throw ApiError.badRequest('Price must be greater than zero');
    }
    if (data.stock !== undefined && Number(data.stock) < 0) {
      throw ApiError.badRequest('Stock cannot be negative');
    }

    const targetSlug = data.slug ? slugify(data.slug) : product.slug;
    if (targetSlug !== product.slug) {
      const duplicate = await Product.findOne({ slug: targetSlug, _id: { $ne: product._id } });
      if (duplicate) {
        throw ApiError.badRequest(`A product with slug '${targetSlug}' already exists`);
      }
      product.slug = targetSlug;
    }

    if (data.name) product.name = data.name.trim();
    if (data.description) product.description = data.description.trim();
    if (data.price !== undefined) product.price = Number(data.price);
    if (data.stock !== undefined) product.stock = Number.parseInt(data.stock, 10) || 0;
    if (data.featured !== undefined) product.featured = Boolean(data.featured);
    product.category = categoryDoc._id;
    if (data.sizes !== undefined) product.sizes = Array.isArray(data.sizes) ? data.sizes : [];
    if (data.images !== undefined) product.images = Array.isArray(data.images) ? data.images : [];

    const saved = await product.save();
    await saved.populate('category');
    return saved.toJSON();
  }

  /**
   * Delete a catalog product by ID.
   * Performs cleanup of associated Cloudinary images where applicable.
   */
  static async deleteProduct(productId) {
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      throw ApiError.notFound(`Product not found with id: ${productId}`);
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw ApiError.notFound(`Product not found with id: ${productId}`);
    }

    // Best-effort cleanup of Cloudinary images attached to deleted product
    if (product.images && Array.isArray(product.images)) {
      for (const imgUrl of product.images) {
        const match = typeof imgUrl === 'string' && imgUrl.match(/arc_and_form\/products\/[a-zA-Z0-9_-]+/);
        if (match) {
          try {
            await CloudinaryService.deleteImage(match[0]);
          } catch (err) {
            console.warn('[admin-product] Failed to delete Cloudinary asset on product deletion:', err.message);
          }
        }
      }
    }

    await Product.findByIdAndDelete(productId);
  }

  /**
   * Delete category safely ensuring no products are orphaned.
   */
  static async deleteCategory(categoryId) {
    const categoryDoc = await this.resolveCategory(categoryId);
    if (!categoryDoc) {
      throw ApiError.notFound(`Category not found: ${categoryId}`);
    }

    const hasProducts = await Product.exists({ category: categoryDoc._id });
    if (hasProducts) {
      throw ApiError.conflict('Cannot delete category that is referenced by existing products');
    }

    await Category.findByIdAndDelete(categoryDoc._id);
  }
}

