import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/errors.js';

export function formatAdminOrderResponse(order) {
  if (!order) return null;

  const user = order.user;
  const customerEmail = user?.email || 'Guest Checkout';
  const customerName =
    order.shippingAddress?.fullName ||
    user?.name ||
    'Customer';

  return {
    id: order._id ? order._id.toString() : order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerEmail,
    customerName,
    shippingAddress: order.shippingAddress
      ? {
          fullName: order.shippingAddress.fullName,
          addressLine1: order.shippingAddress.addressLine1,
          addressLine2: order.shippingAddress.addressLine2 || null,
          city: order.shippingAddress.city,
          state: order.shippingAddress.state,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
        }
      : null,
    total:
      typeof order.total === 'number'
        ? Number(order.total.toFixed(2))
        : Number(order.total || 0),
    trackingNumber: order.trackingNumber || null,
    createdAt: order.createdAt,
    items: (order.items || []).map((item) => ({
      id: item._id ? item._id.toString() : item.id,
      productId: item.product
        ? item.product._id
          ? item.product._id.toString()
          : item.product.toString()
        : null,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice:
        typeof item.unitPrice === 'number'
          ? Number(item.unitPrice.toFixed(2))
          : item.unitPrice,
      selectedSize: item.selectedSize || null,
      subtotal:
        typeof item.subtotal === 'number'
          ? Number(item.subtotal.toFixed(2))
          : item.subtotal,
    })),
  };
}

export class AdminService {
  /**
   * Get high-level overview metrics, recent orders, and stock alerts.
   * Matches Spring Boot AdminSummaryResponse & React client expectation.
   */
  static async getSummary() {
    // 1. Calculate revenue from paid/fulfilled orders only
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          status: { $in: ['PAID', 'SHIPPED', 'DELIVERED'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$total' },
        },
      },
    ]);
    const totalRevenue =
      revenueAgg.length > 0 ? Number(revenueAgg[0].total.toFixed(2)) : 0;

    // 2. Metrics & Counts
    const [
      totalOrders,
      pendingShipments,
      lowStockAlerts,
      totalCustomers,
      totalProducts,
      recentOrdersDocs,
      lowStockProductsDocs,
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'PAID' }),
      Product.countDocuments({ stock: { $lte: 3 } }),
      User.countDocuments({ role: 'CUSTOMER' }),
      Product.countDocuments(),
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('user', 'email name')
        .populate('items.product', 'name slug price images'),
      Product.find({ stock: { $lte: 3 } })
        .sort({ stock: 1 })
        .populate('category'),
    ]);

    return {
      totalRevenue,
      totalOrders,
      pendingShipments,
      lowStockAlerts,
      totalCustomers,
      totalProducts,
      recentOrders: recentOrdersDocs.map(formatAdminOrderResponse),
      lowStockProducts: lowStockProductsDocs.map((p) => p.toJSON()),
    };
  }

  /**
   * Get paginated orders with optional status filter and customer/order search.
   * Returns Spring Data Page format matching client expectations.
   */
  static async getOrders({ status = '', query = '', page = 0, size = 20 } = {}) {
    const pageIndex = Math.max(0, Number.parseInt(page, 10) || 0);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(size, 10) || 20));
    const skip = pageIndex * pageSize;

    const filter = {};

    // Status filter
    if (status && status !== 'ALL') {
      filter.status = status.toUpperCase().trim();
    }

    // Query filter (orderNumber, trackingNumber, customer name, email)
    if (query && typeof query === 'string' && query.trim()) {
      const clean = query.trim();
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      // Find users whose name or email matches
      const matchingUsers = await User.find({
        $or: [
          { email: { $regex: escaped, $options: 'i' } },
          { name: { $regex: escaped, $options: 'i' } },
        ],
      }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { orderNumber: { $regex: escaped, $options: 'i' } },
        { trackingNumber: { $regex: escaped, $options: 'i' } },
        { 'shippingAddress.fullName': { $regex: escaped, $options: 'i' } },
        { user: { $in: userIds } },
      ];
    }

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .populate('user', 'email name')
        .populate('items.product', 'name slug price images'),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      content: orders.map(formatAdminOrderResponse),
      totalElements: total,
      totalPages,
      size: pageSize,
      number: pageIndex,
      first: pageIndex === 0,
      last: pageIndex >= Math.max(0, totalPages - 1),
      empty: orders.length === 0,
    };
  }

  /**
   * Retrieve single order details for admin inspection.
   */
  static async getOrderById(orderId) {
    if (!orderId) {
      throw ApiError.badRequest('Order ID or order number is required');
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId)
        .populate('user', 'email name')
        .populate('items.product', 'name slug price images');
    }

    if (!order) {
      order = await Order.findOne({ orderNumber: String(orderId).trim() })
        .populate('user', 'email name')
        .populate('items.product', 'name slug price images');
    }

    if (!order) {
      throw ApiError.notFound(`Order not found with identifier: ${orderId}`);
    }

    return formatAdminOrderResponse(order);
  }

  /**
   * Update order fulfillment status and tracking number.
   * Enforces strict transition state machine and atomic inventory handling.
   */
  static async updateOrderStatus(orderId, { status, trackingNumber } = {}) {
    if (!orderId) {
      throw ApiError.badRequest('Order ID is required');
    }

    let order = null;
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      order = await Order.findById(orderId).populate('user', 'email name');
    }
    if (!order) {
      order = await Order.findOne({ orderNumber: String(orderId).trim() }).populate(
        'user',
        'email name'
      );
    }
    if (!order) {
      throw ApiError.notFound(`Order not found with identifier: ${orderId}`);
    }

    const currentStatus = order.status;
    const targetStatus = status ? status.toUpperCase().trim() : currentStatus;

    const VALID_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (status && !VALID_STATUSES.includes(targetStatus)) {
      throw ApiError.badRequest(
        `Invalid order status: ${status}. Allowed: ${VALID_STATUSES.join(', ')}`
      );
    }

    // 1. Strict State Machine Validation
    if (currentStatus === 'PENDING') {
      // Unpaid orders must NOT be marked paid, shipped, or delivered via admin PATCH
      if (targetStatus !== 'PENDING' && targetStatus !== 'CANCELLED') {
        throw ApiError.badRequest(
          'Cannot fulfill an unpaid order. Payment must be verified via Stripe.'
        );
      }
    } else if (currentStatus === 'PAID') {
      // Can transition to SHIPPED or CANCELLED, but not revert to PENDING or skip to DELIVERED
      if (targetStatus === 'PENDING') {
        throw ApiError.badRequest('Cannot revert a paid order to PENDING');
      }
      if (targetStatus === 'DELIVERED') {
        throw ApiError.badRequest(
          'Order must be marked SHIPPED before marking as DELIVERED'
        );
      }
    } else if (currentStatus === 'SHIPPED') {
      // Can transition to DELIVERED or CANCELLED, but not revert to PENDING or PAID
      if (targetStatus === 'PENDING' || targetStatus === 'PAID') {
        throw ApiError.badRequest(
          `Cannot revert order from SHIPPED back to ${targetStatus}`
        );
      }
    } else if (currentStatus === 'DELIVERED') {
      // Terminal state: status cannot be modified
      if (targetStatus !== 'DELIVERED') {
        throw ApiError.badRequest(
          'Delivered orders are final and cannot be modified'
        );
      }
    } else if (currentStatus === 'CANCELLED') {
      // Terminal state: status cannot be modified
      if (targetStatus !== 'CANCELLED') {
        throw ApiError.badRequest(
          'Cancelled orders are final and cannot be reactivated'
        );
      }
    }

    // 2. Cancellation and Inventory Restocking:
    // If transitioning to CANCELLED and stock was reserved, release stock transactionally
    if (targetStatus === 'CANCELLED' && currentStatus !== 'CANCELLED') {
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          const freshOrder = await Order.findById(order._id).session(mongoSession);
          if (freshOrder.stockReserved) {
            for (const item of freshOrder.items) {
              await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } },
                { session: mongoSession }
              );
            }
            freshOrder.stockReserved = false;
          }

          freshOrder.status = 'CANCELLED';
          if (trackingNumber !== undefined) {
            freshOrder.trackingNumber = trackingNumber ? trackingNumber.trim() : null;
          }
          await freshOrder.save({ session: mongoSession });
          order = freshOrder;
        });
      } finally {
        await mongoSession.endSession();
      }
    } else {
      // Normal fulfillment or tracking number update
      order.status = targetStatus;
      if (trackingNumber !== undefined) {
        order.trackingNumber = trackingNumber ? trackingNumber.trim() : null;
      }
      await order.save();
    }

    // Populate user and item details for clean response
    await order.populate('user', 'email name');
    await order.populate('items.product', 'name slug price images');

    return formatAdminOrderResponse(order);
  }
}

