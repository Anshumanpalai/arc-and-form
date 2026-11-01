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
    const paymentIntentId = sessionObj.payment_intent;

    // Fast-path idempotency check
    const existingEvent = await ProcessedEvent.findOne({ eventId });
    if (existingEvent) {
      console.log(`[stripe-webhook] Event ${eventId} already processed. Returning idempotently.`);
      return { received: true, duplicate: true };
    }

    if (!orderNumber && !sessionId && !orderId && !paymentIntentId) {
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
        if (!order && paymentIntentId) {
          order = await Order.findOne({ stripePaymentIntentId: paymentIntentId }).session(mongoSession);
        }
        if (!order && sessionObj.id) {
          order = await Order.findOne({ 'refundDetails.refundId': sessionObj.id }).session(mongoSession);
        }

        if (!order) {
          console.warn(`[stripe-webhook] No order found matching orderNumber=${orderNumber}, sessionId=${sessionId}, paymentIntentId=${paymentIntentId}`);
          return;
        }

        // Strict metadata verification: metadata orderNumber must match
        if (sessionObj.metadata?.orderNumber && sessionObj.metadata.orderNumber !== order.orderNumber) {
          console.error(`[stripe-webhook] Mismatch: metadata orderNumber ${sessionObj.metadata.orderNumber} !== ${order.orderNumber}`);
          isVerificationFailed = true;
          return;
        }

        // Strict metadata orderId verification
        if (sessionObj.metadata?.orderId && sessionObj.metadata.orderId !== order._id.toString()) {
          console.error(`[stripe-webhook] Mismatch: metadata orderId ${sessionObj.metadata.orderId} !== ${order._id}`);
          isVerificationFailed = true;
          return;
        }

        // Strict PaymentIntent association verification for refund and payment events
        if (
          paymentIntentId &&
          order.stripePaymentIntentId &&
          paymentIntentId !== order.stripePaymentIntentId
        ) {
          console.error(`[stripe-webhook] PaymentIntent mismatch for ${order.orderNumber}: expected ${order.stripePaymentIntentId}, got ${paymentIntentId}`);
          isVerificationFailed = true;
          return;
        }

        // Checkout/Webhook Race Condition Handling (strictly for checkout.session events):
        if (eventType.startsWith('checkout.session')) {
          if (order.stripeSessionId && sessionId && order.stripeSessionId !== sessionId) {
            console.error(`[stripe-webhook] Mismatch: incoming session ${sessionId} does not match order session ${order.stripeSessionId}`);
            isVerificationFailed = true;
            return;
          }

          // If webhook arrived before checkout response saved sessionId, safely associate it now
          if (!order.stripeSessionId && sessionId) {
            order.stripeSessionId = sessionId;
          }
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
            order.paymentStatus = 'PAID';
            if (sessionObj.payment_intent) {
              order.stripePaymentIntentId = sessionObj.payment_intent;
            }
            await order.save({ session: mongoSession });
            console.log(`[stripe-webhook] Order ${order.orderNumber} successfully marked as PAID.`);
          }
        } else if (eventType === 'charge.refunded' || eventType === 'refund.updated') {
          // Stripe refund confirmation, partial refund, or status update webhook
          order.refundDetails = order.refundDetails || {};

          // Currency verification
          if (sessionObj.currency && order.currency && sessionObj.currency.toLowerCase() !== (order.currency || 'usd').toLowerCase()) {
            console.error(`[stripe-webhook] Currency mismatch for refund on ${order.orderNumber}: expected ${order.currency}, got ${sessionObj.currency}`);
            isVerificationFailed = true;
            return;
          }

          const orderTotalMinor = Math.round(order.total * 100);

          if (eventType === 'charge.refunded') {
            // charge.refunded provides the cumulative amount_refunded on the charge in integer minor units
            const cumulativeRefundedMinor = Number.isInteger(sessionObj.amount_refunded)
              ? sessionObj.amount_refunded
              : (sessionObj.amount || 0);

            // Strict excessive refund validation: cumulative refund cannot exceed original order total
            if (cumulativeRefundedMinor > orderTotalMinor) {
              console.error(`[stripe-webhook] Excessive refund amount rejected for ${order.orderNumber}: ${cumulativeRefundedMinor} minor units exceeds order total ${orderTotalMinor}`);
              isVerificationFailed = true;
              return;
            }

            order.refundDetails.amountRefundedMinor = cumulativeRefundedMinor;
            order.refundDetails.amount = Number((cumulativeRefundedMinor / 100).toFixed(2));
            order.refundDetails.status = 'SUCCEEDED';
            order.refundDetails.completedAt = order.refundDetails.completedAt || new Date();

            if (sessionObj.refunds?.data?.[0]?.id) {
              order.refundDetails.refundId = sessionObj.refunds.data[0].id;
            }

            if (cumulativeRefundedMinor >= orderTotalMinor) {
              order.paymentStatus = 'REFUNDED';
              // Full refund confirmed: If order was marked CANCELLED, release stock if still reserved
              if (order.status === 'CANCELLED' && order.stockReserved) {
                for (const item of order.items) {
                  await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { stock: item.quantity } },
                    { session: mongoSession }
                  );
                }
                order.stockReserved = false;
              }
              console.log(`[stripe-webhook] Order ${order.orderNumber} fully refunded (${cumulativeRefundedMinor} minor units).`);
            } else if (cumulativeRefundedMinor > 0) {
              // PARTIAL REFUND: Never mark order fully REFUNDED! Never release stock on partial refund!
              order.paymentStatus = 'PARTIALLY_REFUNDED';
              console.log(`[stripe-webhook] Order ${order.orderNumber} partially refunded (${cumulativeRefundedMinor}/${orderTotalMinor} minor units).`);
            }

            await order.save({ session: mongoSession });
          } else if (eventType === 'refund.updated') {
            // refund.updated is scoped to an individual refund object
            const refundStatus = sessionObj.status; // 'succeeded', 'failed', 'pending', 'canceled'
            const refundId = sessionObj.id;

            if (!refundId || typeof refundId !== 'string') {
              console.error(`[stripe-webhook] Invalid or missing refundId for ${order.orderNumber}`);
              isVerificationFailed = true;
              return;
            }

            if (refundStatus === 'succeeded') {
              const refundsList = order.refundDetails.refunds || [];
              const alreadyCounted = refundsList.some(
                (r) => r.refundId === refundId && r.status === 'succeeded'
              );

              if (!alreadyCounted) {
                const thisAmountMinor = sessionObj.amount || 0;
                if (thisAmountMinor <= 0) {
                  console.error(`[stripe-webhook] Invalid refund amount ${thisAmountMinor} on ${order.orderNumber}`);
                  isVerificationFailed = true;
                  return;
                }

                const currentRefunded = order.refundDetails.amountRefundedMinor || 0;
                // Strict excessive cumulative refund validation
                if (currentRefunded + thisAmountMinor > orderTotalMinor) {
                  console.error(`[stripe-webhook] Excessive cumulative refund rejected for ${order.orderNumber}: ${currentRefunded + thisAmountMinor} exceeds ${orderTotalMinor}`);
                  isVerificationFailed = true;
                  return;
                }

                order.refundDetails.amountRefundedMinor = currentRefunded + thisAmountMinor;
                order.refundDetails.amount = Number(
                  (order.refundDetails.amountRefundedMinor / 100).toFixed(2)
                );
                refundsList.push({
                  refundId,
                  amountMinor: thisAmountMinor,
                  status: 'succeeded',
                  createdAt: new Date(),
                });
                order.refundDetails.refunds = refundsList;
              }

              order.refundDetails.refundId = refundId;
              order.refundDetails.status = 'SUCCEEDED';
              order.refundDetails.completedAt = new Date();

              if (order.refundDetails.amountRefundedMinor >= orderTotalMinor) {
                order.paymentStatus = 'REFUNDED';
                if (order.status === 'CANCELLED' && order.stockReserved) {
                  for (const item of order.items) {
                    await Product.findByIdAndUpdate(
                      item.product,
                      { $inc: { stock: item.quantity } },
                      { session: mongoSession }
                    );
                  }
                  order.stockReserved = false;
                }
                console.log(`[stripe-webhook] Order ${order.orderNumber} fully refunded (${order.refundDetails.amountRefundedMinor} minor units).`);
              } else if (order.refundDetails.amountRefundedMinor > 0) {
                order.paymentStatus = 'PARTIALLY_REFUNDED';
                console.log(`[stripe-webhook] Order ${order.orderNumber} partially refunded (${order.refundDetails.amountRefundedMinor}/${orderTotalMinor} minor units).`);
              }

              await order.save({ session: mongoSession });
            } else if (refundStatus === 'pending') {
              // Out-of-order guard: Never revert already succeeded or partially/fully refunded order to PENDING
              if (
                order.paymentStatus !== 'REFUNDED' &&
                order.paymentStatus !== 'PARTIALLY_REFUNDED'
              ) {
                order.paymentStatus = 'REFUND_PENDING';
                order.refundDetails.status = 'PENDING';
                order.refundDetails.refundId = refundId;
                await order.save({ session: mongoSession });
                console.log(`[stripe-webhook] Order ${order.orderNumber} refund status recorded as PENDING.`);
              }
              // Invariant: Never release inventory on pending refunds
            } else if (refundStatus === 'failed') {
              // Out-of-order guard: Never mark failed if order is already fully REFUNDED
              if (order.paymentStatus !== 'REFUNDED') {
                order.paymentStatus = 'REFUND_FAILED';
                order.refundDetails.status = 'FAILED';
                order.refundDetails.failureReason =
                  sessionObj.failure_reason || 'Refund failed at provider';
                await order.save({ session: mongoSession });
                console.warn(`[stripe-webhook] Order ${order.orderNumber} refund marked as FAILED.`);
              }
              // Invariant: Never release inventory on failed refunds
            }
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
            order.paymentStatus = 'UNPAID';
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
          lockedOrder.paymentStatus = 'UNPAID';
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
   * Stale Pending-Refund Recovery & Scheduled Reconciliation Mechanism:
   * Finds operations that remain in REFUND_PENDING beyond thresholdMinutes.
   * Retrieves the existing Stripe refund using the persisted refund ID or idempotency key.
   * Never blindly creates a second refund.
   * Completes Phase 3 database reconciliation if Stripe confirms success.
   * Preserves pending state when Stripe has not reached a terminal state.
   * Handles failed refunds without restoring inventory.
   * Restores inventory exactly once after confirmed full refund.
   * Safe under concurrent execution and server restarts.
   */
  static async recoverStalePendingRefunds({ thresholdMinutes = 15 } = {}) {
    const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000);

    const staleOrders = await Order.find({
      paymentStatus: 'REFUND_PENDING',
      $or: [
        { updatedAt: { $lt: cutoff } },
        { 'refundDetails.requestedAt': { $lt: cutoff } },
        { 'refundDetails.requestedAt': null },
      ],
    });

    const reconciled = [];
    const preservedPending = [];
    const failed = [];

    for (const stale of staleOrders) {
      // 1. Identify persisted idempotency key and refundId
      const refundId = stale.refundDetails?.refundId;
      const idempotencyKey =
        stale.refundDetails?.cancellationIdempotencyKey ||
        stale.refundDetails?.returnIdempotencyKey ||
        stale.refundDetails?.idempotencyKey;

      if (!refundId && !idempotencyKey) {
        console.warn(
          `[refund-recovery] Order ${stale.orderNumber} in REFUND_PENDING has no refund ID or idempotency key. Skipping.`
        );
        continue;
      }

      // 2. Query Stripe outside MongoDB transaction (zero open DB transactions during network I/O)
      let stripeRefund = null;
      try {
        if (refundId) {
          stripeRefund = await StripeService.getRefund(refundId);
        }

        // Long-term crash recovery check: If refundId was not yet saved (e.g. process crashed),
        // query Stripe's permanent refund records for this PaymentIntent to find the matching refund
        // even after the 24-hour idempotency key cache has expired.
        if (!stripeRefund && stale.stripePaymentIntentId) {
          stripeRefund = await StripeService.findMatchingRefund({
            paymentIntentId: stale.stripePaymentIntentId,
            idempotencyKey,
            orderNumber: stale.orderNumber,
          });
        }

        if (!stripeRefund && idempotencyKey) {
          // Stripe idempotency guarantee: Calling createRefund with an already-used idempotency key
          // retrieves the existing refund without creating a duplicate refund.
          stripeRefund = await StripeService.createRefund({
            paymentIntentId: stale.stripePaymentIntentId || `mock_pi_${stale.orderNumber}`,
            amountCents: Math.round(stale.total * 100),
            idempotencyKey,
            metadata: {
              orderNumber: stale.orderNumber,
              action: 'recovery',
              idempotencyKey,
            },
          });
        }
      } catch (stripeErr) {
        console.warn(
          `[refund-recovery] Failed to retrieve refund from Stripe for ${stale.orderNumber}:`,
          stripeErr.message
        );
        continue;
      }

      if (!stripeRefund) {
        continue;
      }

      // 3. Complete Phase 3 DB transaction atomically
      const mongoSession = await mongoose.startSession();
      try {
        await mongoSession.withTransaction(async () => {
          // Atomic lock: Only operate if STILL in REFUND_PENDING state
          const lockedOrder = await Order.findOne({
            _id: stale._id,
            paymentStatus: 'REFUND_PENDING',
          }).session(mongoSession);

          if (!lockedOrder) return; // Concurrently resolved by webhook or retry

          const refundStatus = stripeRefund.status;

          if (refundStatus === 'succeeded') {
            lockedOrder.status = 'CANCELLED';
            lockedOrder.paymentStatus = 'REFUNDED';
            if (!lockedOrder.refundDetails) lockedOrder.refundDetails = {};
            lockedOrder.refundDetails.status = 'SUCCEEDED';
            lockedOrder.refundDetails.refundId = stripeRefund.id;
            const totalMinor = Math.round(lockedOrder.total * 100);
            lockedOrder.refundDetails.amountRefundedMinor =
              stripeRefund.amount || totalMinor;
            lockedOrder.refundDetails.amount =
              lockedOrder.refundDetails.amountRefundedMinor / 100;
            lockedOrder.refundDetails.completedAt = new Date();

            // Restore inventory exactly once after confirmed full refund
            if (lockedOrder.stockReserved) {
              for (const item of lockedOrder.items) {
                await Product.findByIdAndUpdate(
                  item.product,
                  { $inc: { stock: item.quantity } },
                  { session: mongoSession }
                );
              }
              lockedOrder.stockReserved = false;
            }

            await lockedOrder.save({ session: mongoSession });
            reconciled.push(lockedOrder.orderNumber);
            console.log(
              `[refund-recovery] Order ${lockedOrder.orderNumber} successfully reconciled to REFUNDED.`
            );
          } else if (refundStatus === 'pending') {
            // Preserve pending state when Stripe has not reached a terminal state
            preservedPending.push(lockedOrder.orderNumber);
            console.log(
              `[refund-recovery] Order ${lockedOrder.orderNumber} refund remains pending at Stripe. Preserving state.`
            );
          } else if (refundStatus === 'failed' || refundStatus === 'canceled') {
            // Handle failed refunds without restoring inventory
            lockedOrder.paymentStatus = 'REFUND_FAILED';
            if (!lockedOrder.refundDetails) lockedOrder.refundDetails = {};
            lockedOrder.refundDetails.status = 'FAILED';
            lockedOrder.refundDetails.failureReason =
              stripeRefund.failure_reason ||
              'Refund failed at provider during recovery check';
            // Inventory is NOT restored
            await lockedOrder.save({ session: mongoSession });
            failed.push(lockedOrder.orderNumber);
            console.warn(
              `[refund-recovery] Order ${lockedOrder.orderNumber} marked as REFUND_FAILED.`
            );
          }
        });
      } finally {
        await mongoSession.endSession();
      }
    }

    return {
      reconciledCount: reconciled.length,
      reconciledOrderNumbers: reconciled,
      preservedPendingCount: preservedPending.length,
      preservedPendingOrderNumbers: preservedPending,
      failedCount: failed.length,
      failedOrderNumbers: failed,
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
