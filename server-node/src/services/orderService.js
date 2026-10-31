import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { ProcessedEvent } from '../models/ProcessedEvent.js';
import { StripeService } from './stripeService.js';
import { ApiError } from '../utils/errors.js';

function generateOrderNumber() {
  const randomCode = Math.floor(100000 + Math.random() * 900000);
  return `AF-${randomCode}`;
}

export class OrderService {
  /**
   * Create pending order and reserve inventory within a MongoDB transaction,
   * then create Stripe Checkout session.
   */
  static async createCheckout(request, userId) {
    if (!userId) {
      throw ApiError.unauthorized('Authentication is required to place an order');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.unauthorized('User account not found');
    }

    if (!request.items || !Array.isArray(request.items) || request.items.length === 0) {
      throw ApiError.badRequest('Order must contain at least one item');
    }

    if (!request.shippingAddress) {
      throw ApiError.badRequest('Shipping address is required');
    }

    const { fullName, addressLine1, addressLine2, city, state, postalCode, country } = request.shippingAddress;
    if (!fullName || !addressLine1 || !city || !state || !postalCode || !country) {
      throw ApiError.badRequest('All required shipping address fields must be provided');
    }

    // 1. Transactional reservation & pending order creation
    const mongoSession = await mongoose.startSession();
    let savedOrder;

    try {
      await mongoSession.withTransaction(async () => {
        let totalMinorUnits = 0; // Integer minor units (cents / paise)
        const orderItems = [];

        for (const itemReq of request.items) {
          if (!itemReq.productId) {
            throw ApiError.badRequest('Product ID is required for each order item');
          }

          const qty = Number.parseInt(itemReq.quantity, 10);
          if (isNaN(qty) || qty <= 0 || qty > 100) {
            throw ApiError.badRequest(`Invalid quantity for item: ${itemReq.quantity}`);
          }

          if (!mongoose.Types.ObjectId.isValid(itemReq.productId)) {
            throw ApiError.badRequest(`Invalid product ID format: ${itemReq.productId}`);
          }

          // Fetch product within transaction session
          const product = await Product.findById(itemReq.productId).session(mongoSession);
          if (!product) {
            throw ApiError.notFound(`Product not found with ID: ${itemReq.productId}`);
          }

          // Conditional atomic stock decrement inside the transaction
          const updatedProduct = await Product.findOneAndUpdate(
            { _id: product._id, stock: { $gte: qty } },
            { $inc: { stock: -qty } },
            { session: mongoSession, new: true }
          );

          if (!updatedProduct) {
            throw ApiError.badRequest(
              `Insufficient stock for piece '${product.name}'. Available: ${product.stock}, requested: ${qty}`
            );
          }

          // Integer minor unit calculation avoids any floating-point drift
          const unitPriceMinor = Math.round(product.price * 100);
          const itemSubtotalMinor = unitPriceMinor * qty;
          totalMinorUnits += itemSubtotalMinor;

          orderItems.push({
            product: product._id,
            productName: product.name,
            unitPrice: unitPriceMinor / 100,
            quantity: qty,
            selectedSize: itemReq.selectedSize ? String(itemReq.selectedSize).trim() : null,
            subtotal: itemSubtotalMinor / 100,
          });
        }

        const calculatedTotal = totalMinorUnits / 100;

        const order = new Order({
          orderNumber: generateOrderNumber(),
          user: user._id,
          status: 'PENDING',
          shippingAddress: {
            fullName: fullName.trim(),
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2 ? addressLine2.trim() : null,
            city: city.trim(),
            state: state.trim(),
            postalCode: postalCode.trim(),
            country: country.trim(),
          },
          currency: 'usd',
          total: calculatedTotal,
          stockReserved: true,
          items: orderItems,
        });

        const created = await order.save({ session: mongoSession });
        savedOrder = created;
      });
    } finally {
      await mongoSession.endSession();
    }

    // 2. Stripe Checkout session creation outside MongoDB transaction
    let sessionResult;
    try {
      sessionResult = await StripeService.createCheckoutSession(savedOrder, savedOrder.items);
      savedOrder.stripeSessionId = sessionResult.sessionId;
      await savedOrder.save();
    } catch (err) {
      console.error(`[order] Stripe session creation failed for ${savedOrder.orderNumber}. Rolling back stock reservation...`);

      // Rollback stock reservation in a new transaction
      if (sessionResult?.sessionId) {
        await StripeService.expireSession(sessionResult.sessionId);
      }

      const rollbackSession = await mongoose.startSession();
      try {
        await rollbackSession.withTransaction(async () => {
          for (const item of savedOrder.items) {
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { stock: item.quantity } },
              { session: rollbackSession }
            );
          }
          savedOrder.status = 'CANCELLED';
          savedOrder.stockReserved = false;
          await savedOrder.save({ session: rollbackSession });
        });
      } finally {
        await rollbackSession.endSession();
      }

      throw err;
    }

    return {
      orderNumber: savedOrder.orderNumber,
      checkoutUrl: sessionResult.checkoutUrl,
      sessionId: sessionResult.sessionId,
      total: savedOrder.total,
    };
  }

  /**
   * Process Stripe webhook event idempotently and atomically within a replica set transaction.
   */
  static async handleStripeWebhook(event) {
    const eventId = event?.id;
    const eventType = event?.type;

    if (!eventId) {
      throw ApiError.badRequest('Invalid Stripe event: missing ID');
    }

    const sessionObj = event.data?.object || {};
    const orderNumber = sessionObj.metadata?.orderNumber || sessionObj.client_reference_id;
    const orderId = sessionObj.metadata?.orderId;
    const sessionId = sessionObj.id;

    // Fast-path idempotency check
    const existingEvent = await ProcessedEvent.findOne({ eventId });
    if (existingEvent) {
      console.log(`[stripe-webhook] Event ${eventId} already processed. Returning idempotently.`);
      return { received: true, duplicate: true };
    }

    if (!orderNumber && !sessionId && !orderId) {
      // Event without order linkage (irrelevant event, record and return)
      await ProcessedEvent.create({ eventId, eventType });
      return { received: true, ignored: true };
    }

    let isDuplicate = false;
    let isVerificationFailed = false;

    const mongoSession = await mongoose.startSession();
    try {
      await mongoSession.withTransaction(async () => {
        // Atomic ledger insertion: handles concurrent webhook races via unique index on eventId.
        // If another concurrent thread inserts eventId first, MongoDB will throw E11000.
        // We let the transaction abort and catch E11000 outside withTransaction.
        await ProcessedEvent.create([{ eventId, eventType }], { session: mongoSession });

        // Locate order inside the transaction session
        let order = null;
        if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
          order = await Order.findById(orderId).session(mongoSession);
        }
        if (!order && orderNumber) {
          order = await Order.findOne({ orderNumber }).session(mongoSession);
        }
        if (!order && sessionId) {
          order = await Order.findOne({ stripeSessionId: sessionId }).session(mongoSession);
        }

        if (!order) {
          console.warn(`[stripe-webhook] No order found matching orderNumber=${orderNumber}, sessionId=${sessionId}`);
          return;
        }

        // Strict metadata verification: metadata orderNumber must match
        if (sessionObj.metadata?.orderNumber && sessionObj.metadata.orderNumber !== order.orderNumber) {
          console.error(`[stripe-webhook] Mismatch: metadata orderNumber ${sessionObj.metadata.orderNumber} !== ${order.orderNumber}`);
          isVerificationFailed = true;
          return;
        }

        // Checkout/Webhook Race Condition Handling:
        // If order already has a registered stripeSessionId, ensure it matches incoming sessionId
        if (order.stripeSessionId && sessionId && order.stripeSessionId !== sessionId) {
          console.error(`[stripe-webhook] Mismatch: incoming session ${sessionId} does not match order session ${order.stripeSessionId}`);
          isVerificationFailed = true;
          return;
        }

        // If webhook arrived before checkout response saved sessionId, safely associate it now
        if (!order.stripeSessionId && sessionId) {
          order.stripeSessionId = sessionId;
        }

        // Handle Event Lifecycle
        if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
          // Strict payment verification: payment_status must be 'paid'
          if (sessionObj.payment_status !== 'paid') {
            console.warn(`[stripe-webhook] Ignoring completed event for ${order.orderNumber} because payment_status is '${sessionObj.payment_status}' (expected 'paid')`);
            isVerificationFailed = true;
            return;
          }

          // Strict amount and currency verification
          const expectedMinorUnits = Math.round(order.total * 100);
          const expectedCurrency = (order.currency || 'usd').toLowerCase();

          if (sessionObj.amount_total !== undefined && sessionObj.amount_total !== expectedMinorUnits) {
            console.error(`[stripe-webhook] Amount mismatch for ${order.orderNumber}: expected ${expectedMinorUnits}, got ${sessionObj.amount_total}`);
            isVerificationFailed = true;
            return;
          }

          if (sessionObj.currency && sessionObj.currency.toLowerCase() !== expectedCurrency) {
            console.error(`[stripe-webhook] Currency mismatch for ${order.orderNumber}: expected ${expectedCurrency}, got ${sessionObj.currency}`);
            isVerificationFailed = true;
            return;
          }

          // Mark PAID if not already marked
          if (order.status !== 'PAID') {
            order.status = 'PAID';
            if (sessionObj.payment_intent) {
              order.stripePaymentIntentId = sessionObj.payment_intent;
            }
            await order.save({ session: mongoSession });
            console.log(`[stripe-webhook] Order ${order.orderNumber} successfully marked as PAID.`);
          }
        } else if (eventType === 'checkout.session.async_payment_failed' || eventType === 'checkout.session.expired') {
          // Expiration / failure:
          // Invariant: Never release stock for an order that has already been PAID!
          if (order.status !== 'PAID' && order.stockReserved) {
            for (const item of order.items) {
              await Product.findByIdAndUpdate(
                item.product,
                { $inc: { stock: item.quantity } },
                { session: mongoSession }
              );
            }
            order.stockReserved = false;
            order.status = 'CANCELLED';
            await order.save({ session: mongoSession });
            console.log(`[stripe-webhook] Order ${order.orderNumber} cancelled and stock released.`);
          }
        }
      });
    } catch (err) {
      if (err.code === 11000 || (err.errorResponse && err.errorResponse.code === 11000) || err.message?.includes('E11000')) {
        return { received: true, duplicate: true };
      }
      throw err;
    } finally {
      await mongoSession.endSession();
    }

    if (isDuplicate) {
      return { received: true, duplicate: true };
    }

    if (isVerificationFailed) {
      return { received: true, verified: false };
    }

    return { received: true };
  }

  /**
   * Reservation Expiry Recovery Mechanism:
   * Finds PENDING orders older than ttlMinutes whose stock is still reserved,
   * cancels them and releases their inventory exactly once.
   *
   * Operational guide:
   * - In development / testing: can be invoked directly or via maintenance routines.
   * - In production: invoked periodically via standing worker or scheduler (e.g. cron every 10 mins).
   */
  static async recoverExpiredReservations({ ttlMinutes = 30 } = {}) {
    const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000);

    const expiredOrders = await Order.find({
      status: 'PENDING',
      stockReserved: true,
      createdAt: { $lt: cutoff },
    });

    const recoveredOrderNumbers = [];

    for (const expired of expiredOrders) {
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          // Re-fetch with lock inside transaction
          const lockedOrder = await Order.findOne({
            _id: expired._id,
            status: 'PENDING',
            stockReserved: true,
          }).session(mongoSession);

          if (!lockedOrder) return; // Order state changed or was already paid/released

          for (const item of lockedOrder.items) {
            await Product.findByIdAndUpdate(
              item.product,
              { $inc: { stock: item.quantity } },
              { session: mongoSession }
            );
          }

          lockedOrder.stockReserved = false;
          lockedOrder.status = 'CANCELLED';
          await lockedOrder.save({ session: mongoSession });
          recoveredOrderNumbers.push(lockedOrder.orderNumber);
          console.log(`[reservation-recovery] Released stock for expired pending order ${lockedOrder.orderNumber}`);
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    return {
      recoveredCount: recoveredOrderNumbers.length,
      recoveredOrderNumbers,
    };
  }

  /**
   * Get paginated orders for authenticated user in Spring Data Page format.
   */
  static async getOrdersForUser(userId, page = 1, limit = 10) {
    const pageIndex = Math.max(0, (Number.parseInt(page, 10) || 1) - 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
    const skip = pageIndex * pageSize;

    const [orders, total] = await Promise.all([
      Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      Order.countDocuments({ user: userId }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      content: orders.map((o) => o.toJSON()),
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
   * Get single order details by order number with user authorization check.
   */
  static async getOrderByOrderNumber(orderNumber, currentUserId, isAdmin = false) {
    if (!orderNumber || typeof orderNumber !== 'string') {
      throw ApiError.badRequest('Order number is required');
    }

    const order = await Order.findOne({ orderNumber: orderNumber.trim() });
    if (!order) {
      throw ApiError.notFound(`Order not found: ${orderNumber}`);
    }

    // Customer isolation: customer can only view their own order; admin can view all
    if (!isAdmin) {
      if (!currentUserId || order.user.toString() !== currentUserId.toString()) {
        throw ApiError.forbidden('You do not have permission to view this order');
      }
    }

    return order.toJSON();
  }
}
