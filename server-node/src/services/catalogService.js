import { Category } from '../models/Category.js';
import { Product } from '../models/Product.js';
import { ApiError } from '../utils/errors.js';

export class CatalogService {
  /**
   * Get all categories sorted alphabetically by name.
   */
  static async getCategories() {
    const categories = await Category.find().sort({ name: 1 });
    return {
      categories: categories.map((cat) => cat.toJSON()),
    };
  }

  /**
   * Browse products with filtering, search, sorting, and pagination.
   */
  static async getProducts({
    category = '',
    search = '',
    sort = 'newest',
    page = 1,
    limit = 12,
  } = {}) {
    // Validate and clamp pagination numbers safely
    const parsedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const parsedLimit = Math.min(48, Math.max(1, Number.parseInt(limit, 10) || 12));
    const skip = (parsedPage - 1) * parsedLimit;

    const query = {};

    // 1. Category Filter by slug
    if (category && typeof category === 'string' && category.trim()) {
      const categoryDoc = await Category.findOne({ slug: category.trim() });
      if (!categoryDoc) {
        // If specified category doesn't exist, return empty page
        return {
          products: [],
          pagination: {
            page: parsedPage,
            limit: parsedLimit,
            total: 0,
            pages: 0,
          },
        };
      }
      query.category = categoryDoc._id;
    }

    // 2. Search by name or description (case-insensitive safe regex)
    if (search && typeof search === 'string' && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ];
    }

    // 3. Sorting
    let sortCriteria;
    switch (sort) {
      case 'price_asc':
        sortCriteria = { price: 1 };
        break;
      case 'price_desc':
        sortCriteria = { price: -1 };
        break;
      case 'featured':
        sortCriteria = { featured: -1, createdAt: -1 };
        break;
      case 'newest':
      default:
        sortCriteria = { createdAt: -1 };
        break;
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(sortCriteria)
        .skip(skip)
        .limit(parsedLimit)
        .populate('category'),
      Product.countDocuments(query),
    ]);

    const pages = Math.ceil(total / parsedLimit);

    return {
      products: products.map((prod) => prod.toJSON()),
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages,
      },
    };
  }

  /**
   * Get single product details by slug.
   */
  static async getProductBySlug(slug) {
    if (!slug || typeof slug !== 'string') {
      throw ApiError.notFound('Product slug is required');
    }

    const product = await Product.findOne({ slug: slug.trim() }).populate('category');
    if (!product) {
      throw ApiError.notFound(`Product not found with slug: ${slug}`);
    }

    return {
      product: product.toJSON(),
    };
  }
}

