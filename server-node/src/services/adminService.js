import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { StripeService } from './stripeService.js';
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
    paymentStatus: order.paymentStatus || 'UNPAID',
    refundDetails: order.refundDetails
      ? {
          status: order.refundDetails.status || 'NONE',
          refundId: order.refundDetails.refundId || null,
          idempotencyKey: order.refundDetails.idempotencyKey || null,
          cancellationIdempotencyKey:
            order.refundDetails.cancellationIdempotencyKey || null,
          returnIdempotencyKey:
            order.refundDetails.returnIdempotencyKey || null,
          amount:
            typeof order.refundDetails.amount === 'number'
              ? Number(order.refundDetails.amount.toFixed(2))
              : 0,
          amountRefundedMinor:
            typeof order.refundDetails.amountRefundedMinor === 'number'
              ? order.refundDetails.amountRefundedMinor
              : 0,
          currency: order.refundDetails.currency || 'usd',
          reason: order.refundDetails.reason || null,
          failureReason: order.refundDetails.failureReason || null,
          requestedAt: order.refundDetails.requestedAt || null,
          completedAt: order.refundDetails.completedAt || null,
        }
      : null,
    returnDetails: order.returnDetails
      ? {
          status: order.returnDetails.status || 'NONE',
          requestedAt: order.returnDetails.requestedAt || null,
          receivedAt: order.returnDetails.receivedAt || null,
          inspectedAt: order.returnDetails.inspectedAt || null,
          restockedAt: order.returnDetails.restockedAt || null,
          restocked: Boolean(order.returnDetails.restocked),
          condition: order.returnDetails.condition || null,
          notes: order.returnDetails.notes || null,
        }
      : null,
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
    // 1. Calculate revenue from paid/fulfilled orders only (excluding full refunds and deducting partial refunds)
    const revenueAgg = await Order.aggregate([
      {
        $match: {
          status: { $in: ['PAID', 'SHIPPED', 'DELIVERED'] },
          paymentStatus: { $ne: 'REFUNDED' },
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $subtract: [
                '$total',
                {
                  $divide: [
                    { $ifNull: ['$refundDetails.amountRefundedMinor', 0] },
                    100,
                  ],
                },
              ],
            },
          },
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
      // Can transition to SHIPPED or CANCELLED (before dispatch), but not revert to PENDING or skip to DELIVERED
      if (targetStatus === 'PENDING') {
        throw ApiError.badRequest('Cannot revert a paid order to PENDING');
      }
      if (targetStatus === 'DELIVERED') {
        throw ApiError.badRequest(
          'Order must be marked SHIPPED before marking as DELIVERED'
        );
      }
    } else if (currentStatus === 'SHIPPED') {
      // SHIPPED orders must not restore stock through ordinary cancellation
      if (targetStatus === 'CANCELLED') {
        throw ApiError.badRequest(
          'Orders already dispatched (SHIPPED) cannot be cancelled through ordinary cancellation. Stock cannot be restored while goods are in transit.'
        );
      }
      if (targetStatus === 'PENDING' || targetStatus === 'PAID') {
        throw ApiError.badRequest(
          `Cannot revert order from SHIPPED back to ${targetStatus}`
        );
      }
    } else if (currentStatus === 'DELIVERED') {
      // DELIVERED orders must use a separate return workflow
      if (targetStatus === 'CANCELLED') {
        throw ApiError.badRequest(
          'Delivered orders cannot be cancelled through ordinary cancellation. Delivered orders must use a separate return workflow.'
        );
      }
      if (targetStatus !== 'DELIVERED') {
        throw ApiError.badRequest(
          'Delivered orders are final and cannot be modified through ordinary status update. Use the separate return workflow.'
        );
      }
    } else if (currentStatus === 'CANCELLED') {
      // Terminal state: status cannot be modified
      if (targetStatus !== 'CANCELLED') {
        throw ApiError.badRequest(
          'Cancelled orders are final and cannot be reactivated'
        );
      }
    } else if (currentStatus === 'RETURNED') {
      if (targetStatus !== 'RETURNED') {
        throw ApiError.badRequest(
          'Returned orders are final and cannot be modified'
        );
      }
    }

    // 2. Cancellation and Inventory Restocking:
    // PENDING orders can be cancelled and reserved stock released.
    // PAID orders can be cancelled before dispatch with transactional stock restoration and Stripe refund.
    if (targetStatus === 'CANCELLED' && currentStatus !== 'CANCELLED') {
      if (currentStatus !== 'PENDING' && currentStatus !== 'PAID') {
        throw ApiError.badRequest(
          `Cannot cancel order with status ${currentStatus}. Only PENDING and pre-dispatch PAID orders can be cancelled.`
        );
      }

      if (currentStatus === 'PENDING') {
        // PENDING cancellation: No payment was made. Release reserved stock in a single transaction.
        const mongoSession = await mongoose.startSession();
        try {
          await mongoSession.withTransaction(async () => {
            const freshOrder = await Order.findById(order._id).session(mongoSession);
            if (freshOrder.status === 'CANCELLED') {
              return; // Idempotent check
            }

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
            freshOrder.paymentStatus = 'UNPAID';
            if (trackingNumber !== undefined) {
              freshOrder.trackingNumber = trackingNumber ? trackingNumber.trim() : null;
            }
            await freshOrder.save({ session: mongoSession });
            order = freshOrder;
          });
        } finally {
          await mongoSession.endSession();
        }

        // Clean up Stripe checkout session if one was created
        if (order.stripeSessionId) {
          await StripeService.expireSession(order.stripeSessionId);
        }
      } else if (currentStatus === 'PAID') {
        // PAID cancellation: Must issue a Stripe refund before marking cancelled and restoring stock.
        // Rule: Do NOT hold a MongoDB transaction open while calling external Stripe API.

        // Fast-path: Check if already cancelled and refunded
        if (order.status === 'CANCELLED' && order.paymentStatus === 'REFUNDED') {
          await order.populate('user', 'email name');
          await order.populate('items.product', 'name slug price images');
          return formatAdminOrderResponse(order);
        }

        // Phase 1: Record refund pending and persist cancellation idempotency key in DB transaction
        let refundIdempotencyKey;
        let paymentIntentId;
        const mongoSession1 = await mongoose.startSession();
        try {
          await mongoSession1.withTransaction(async () => {
            const freshOrder = await Order.findById(order._id).session(mongoSession1);
            if (!freshOrder.refundDetails) {
              freshOrder.refundDetails = {};
            }
            if (!freshOrder.refundDetails.cancellationIdempotencyKey) {
              freshOrder.refundDetails.cancellationIdempotencyKey = `ref_cancel_${freshOrder.orderNumber}_${freshOrder._id}`;
            }
            freshOrder.refundDetails.idempotencyKey = freshOrder.refundDetails.cancellationIdempotencyKey;
            refundIdempotencyKey = freshOrder.refundDetails.cancellationIdempotencyKey;
            paymentIntentId = freshOrder.stripePaymentIntentId || `mock_pi_${freshOrder.orderNumber}`;
            freshOrder.paymentStatus = 'REFUND_PENDING';
            freshOrder.refundDetails.status = 'PENDING';
            freshOrder.refundDetails.requestedAt = freshOrder.refundDetails.requestedAt || new Date();
            await freshOrder.save({ session: mongoSession1 });
            order = freshOrder;
          });
        } finally {
          await mongoSession1.endSession();
        }

        // Phase 2: Call Stripe Refund API outside the MongoDB transaction
        let refundResult;
        const amountCents = Math.round(order.total * 100);
        try {
          // If refundId was already persisted, retrieve directly from Stripe
          if (order.refundDetails?.refundId) {
            refundResult = await StripeService.getRefund(order.refundDetails.refundId);
          }

          // Long-term crash recovery check: query Stripe refund records by PaymentIntent
          // to prevent creating a second refund if an old idempotency key expired (>24 hrs)
          if (!refundResult && paymentIntentId) {
            refundResult = await StripeService.findMatchingRefund({
              paymentIntentId,
              idempotencyKey: refundIdempotencyKey,
              orderNumber: order.orderNumber,
              action: 'cancellation',
            });
          }

          // If no existing refund record on Stripe, initiate refund with persistent idempotency key
          if (!refundResult) {
            refundResult = await StripeService.createRefund({
              paymentIntentId,
              amountCents,
              reason: 'requested_by_customer',
              idempotencyKey: refundIdempotencyKey,
              metadata: {
                orderNumber: order.orderNumber,
                orderId: order._id.toString(),
                action: 'cancellation',
                idempotencyKey: refundIdempotencyKey,
              },
            });
          }
        } catch (stripeErr) {
          // Record refund failure in DB without cancelling order or restoring stock
          const failSession = await mongoose.startSession();
          try {
            await failSession.withTransaction(async () => {
              const freshOrder = await Order.findById(order._id).session(failSession);
              freshOrder.paymentStatus = 'REFUND_FAILED';
              if (!freshOrder.refundDetails) freshOrder.refundDetails = {};
              freshOrder.refundDetails.status = 'FAILED';
              freshOrder.refundDetails.failureReason = stripeErr.message;
              await freshOrder.save({ session: failSession });
            });
          } finally {
            await failSession.endSession();
          }
          throw stripeErr;
        }

        // Phase 3: Finalize cancellation and restore inventory if Stripe refund succeeded
        if (refundResult.status === 'succeeded') {
          const mongoSession3 = await mongoose.startSession();
          try {
            await mongoSession3.withTransaction(async () => {
              const freshOrder = await Order.findById(order._id).session(mongoSession3);
              freshOrder.status = 'CANCELLED';
              freshOrder.paymentStatus = 'REFUNDED';
              if (!freshOrder.refundDetails) freshOrder.refundDetails = {};
              freshOrder.refundDetails.status = 'SUCCEEDED';
              freshOrder.refundDetails.refundId = refundResult.id;
              const totalMinor = Math.round(freshOrder.total * 100);
              freshOrder.refundDetails.amountRefundedMinor = totalMinor;
              freshOrder.refundDetails.amount = freshOrder.total;
              freshOrder.refundDetails.currency =
                refundResult.currency || freshOrder.currency || 'usd';
              freshOrder.refundDetails.completedAt = new Date();

              if (trackingNumber !== undefined) {
                freshOrder.trackingNumber = trackingNumber ? trackingNumber.trim() : null;
              }

              // Transactional stock restoration - only once guarded by stockReserved
              if (freshOrder.stockReserved) {
                for (const item of freshOrder.items) {
                  await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } },
                    { session: mongoSession3 }
                  );
                }
                freshOrder.stockReserved = false;
              }

              await freshOrder.save({ session: mongoSession3 });
              order = freshOrder;
            });
          } finally {
            await mongoSession3.endSession();
          }
        } else {
          // Stripe refund returned non-terminal status (e.g. pending ACH/bank settlement)
          const mongoSessionPending = await mongoose.startSession();
          try {
            await mongoSessionPending.withTransaction(async () => {
              const freshOrder = await Order.findById(order._id).session(mongoSessionPending);
              freshOrder.paymentStatus = 'REFUND_PENDING';
              if (!freshOrder.refundDetails) freshOrder.refundDetails = {};
              freshOrder.refundDetails.status = 'PENDING';
              freshOrder.refundDetails.refundId = refundResult.id;
              await freshOrder.save({ session: mongoSessionPending });
              order = freshOrder;
            });
          } finally {
            await mongoSessionPending.endSession();
          }
        }
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

  /**
   * Process return for a DELIVERED order.
   * Restocks returned items only after physical receipt and inspection.
   * Optionally triggers an idempotent Stripe refund.
   * Transactional and idempotent.
   */
  static async processOrderReturn(
    orderId,
    { restock = false, inspected = false, condition = 'INSPECTED', notes = '', refund = false } = {}
  ) {
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

    // DELIVERED orders must use a separate return workflow
    if (order.status !== 'DELIVERED' && order.status !== 'RETURNED') {
      throw ApiError.badRequest(
        `Returns can only be processed for DELIVERED orders. Current order status is '${order.status}'.`
      );
    }

    // Restock returned items only after physical receipt and inspection
    if (restock && !inspected) {
      throw ApiError.badRequest(
        'Cannot restock returned items without physical receipt and inspection. Set inspected=true once items are physically verified.'
      );
    }

    // Handle optional Stripe Refund integration for returns
    if (refund && order.paymentStatus !== 'REFUNDED') {
      // Phase 1: Record pending refund and idempotency key
      let refundIdempotencyKey;
      let paymentIntentId;
      const mongoSession1 = await mongoose.startSession();
      try {
        await mongoSession1.withTransaction(async () => {
          const freshOrder = await Order.findById(order._id).session(mongoSession1);
          if (!freshOrder.refundDetails) {
            freshOrder.refundDetails = {};
          }
          if (!freshOrder.refundDetails.returnIdempotencyKey) {
            freshOrder.refundDetails.returnIdempotencyKey = `ref_return_${freshOrder.orderNumber}_${freshOrder._id}`;
          }
          freshOrder.refundDetails.idempotencyKey = freshOrder.refundDetails.returnIdempotencyKey;
          refundIdempotencyKey = freshOrder.refundDetails.returnIdempotencyKey;
          paymentIntentId = freshOrder.stripePaymentIntentId || `mock_pi_${freshOrder.orderNumber}`;
          freshOrder.paymentStatus = 'REFUND_PENDING';
          freshOrder.refundDetails.status = 'PENDING';
          freshOrder.refundDetails.requestedAt = freshOrder.refundDetails.requestedAt || new Date();
          await freshOrder.save({ session: mongoSession1 });
          order = freshOrder;
        });
      } finally {
        await mongoSession1.endSession();
      }

      // Phase 2: Call Stripe outside DB transaction
      let refundResult;
      const amountCents = Math.round(order.total * 100);
      try {
        // If refundId was already persisted, retrieve directly from Stripe
        if (order.refundDetails?.refundId) {
          refundResult = await StripeService.getRefund(order.refundDetails.refundId);
        }

        // Long-term crash recovery check: query Stripe refund records by PaymentIntent
        if (!refundResult && paymentIntentId) {
          refundResult = await StripeService.findMatchingRefund({
            paymentIntentId,
            idempotencyKey: refundIdempotencyKey,
            orderNumber: order.orderNumber,
            action: 'return',
          });
        }

        if (!refundResult) {
          refundResult = await StripeService.createRefund({
            paymentIntentId,
            amountCents,
            reason: 'requested_by_customer',
            idempotencyKey: refundIdempotencyKey,
            metadata: {
              orderNumber: order.orderNumber,
              orderId: order._id.toString(),
              action: 'return',
              idempotencyKey: refundIdempotencyKey,
            },
          });
        }
      } catch (stripeErr) {
        const failSession = await mongoose.startSession();
        try {
          await failSession.withTransaction(async () => {
            const freshOrder = await Order.findById(order._id).session(failSession);
            freshOrder.paymentStatus = 'REFUND_FAILED';
            if (!freshOrder.refundDetails) freshOrder.refundDetails = {};
            freshOrder.refundDetails.status = 'FAILED';
            freshOrder.refundDetails.failureReason = stripeErr.message;
            await freshOrder.save({ session: failSession });
          });
        } finally {
          await failSession.endSession();
        }
        throw stripeErr;
      }

      // Phase 3: Update return details, refund status, and conditionally restock
      const mongoSession3 = await mongoose.startSession();
      try {
        await mongoSession3.withTransaction(async () => {
          const freshOrder = await Order.findById(order._id).session(mongoSession3);
          if (!freshOrder.returnDetails) {
            freshOrder.returnDetails = {};
          }

          if (refundResult.status === 'succeeded') {
            const thisRefundMinor = refundResult.amount || Math.round(freshOrder.total * 100);
            const currentMinor = freshOrder.refundDetails?.amountRefundedMinor || 0;
            const cumulativeMinor = Math.max(currentMinor, thisRefundMinor);
            const totalMinor = Math.round(freshOrder.total * 100);

            if (!freshOrder.refundDetails) freshOrder.refundDetails = {};
            freshOrder.refundDetails.status = 'SUCCEEDED';
            freshOrder.refundDetails.refundId = refundResult.id;
            freshOrder.refundDetails.amountRefundedMinor = cumulativeMinor;
            freshOrder.refundDetails.amount = cumulativeMinor / 100;
            freshOrder.refundDetails.currency =
              refundResult.currency || freshOrder.currency || 'usd';
            freshOrder.refundDetails.completedAt = new Date();

            if (cumulativeMinor >= totalMinor) {
              freshOrder.paymentStatus = 'REFUNDED';
            } else if (cumulativeMinor > 0) {
              freshOrder.paymentStatus = 'PARTIALLY_REFUNDED';
            }
          }

          const alreadyRestocked = freshOrder.returnDetails.restocked === true;
          if (restock && inspected && !alreadyRestocked) {
            for (const item of freshOrder.items) {
              await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } },
                { session: mongoSession3 }
              );
            }
            freshOrder.returnDetails.restocked = true;
            freshOrder.returnDetails.restockedAt = new Date();
          }

          freshOrder.status = 'RETURNED';
          freshOrder.returnDetails.status = restock
            ? 'RESTOCKED'
            : inspected
            ? 'INSPECTED'
            : 'RECEIVED';

          if (inspected && !freshOrder.returnDetails.inspectedAt) {
            freshOrder.returnDetails.inspectedAt = new Date();
          }
          if (!freshOrder.returnDetails.receivedAt) {
            freshOrder.returnDetails.receivedAt = new Date();
          }
          freshOrder.returnDetails.condition = condition
            ? String(condition).trim()
            : 'INSPECTED';
          if (notes) {
            freshOrder.returnDetails.notes = String(notes).trim();
          }

          await freshOrder.save({ session: mongoSession3 });
          order = freshOrder;
        });
      } finally {
        await mongoSession3.endSession();
      }
    } else {
      // Non-refund return processing (or already refunded)
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          const freshOrder = await Order.findById(order._id).session(mongoSession);

          if (!freshOrder.returnDetails) {
            freshOrder.returnDetails = {};
          }

          const alreadyRestocked = freshOrder.returnDetails.restocked === true;

          // If requested to restock, items were physically inspected, and not already restocked
          if (restock && inspected && !alreadyRestocked) {
            for (const item of freshOrder.items) {
              await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } },
                { session: mongoSession }
              );
            }
            freshOrder.returnDetails.restocked = true;
            freshOrder.returnDetails.restockedAt = new Date();
          }

          freshOrder.status = 'RETURNED';
          freshOrder.returnDetails.status = restock
            ? 'RESTOCKED'
            : inspected
            ? 'INSPECTED'
            : 'RECEIVED';

          if (inspected && !freshOrder.returnDetails.inspectedAt) {
            freshOrder.returnDetails.inspectedAt = new Date();
          }
          if (!freshOrder.returnDetails.receivedAt) {
            freshOrder.returnDetails.receivedAt = new Date();
          }
          freshOrder.returnDetails.condition = condition
            ? String(condition).trim()
            : 'INSPECTED';
          if (notes) {
            freshOrder.returnDetails.notes = String(notes).trim();
          }

          await freshOrder.save({ session: mongoSession });
          order = freshOrder;
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    await order.populate('user', 'email name');
    await order.populate('items.product', 'name slug price images');
    return formatAdminOrderResponse(order);
  }
}

