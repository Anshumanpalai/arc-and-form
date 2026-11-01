import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price must be non-negative'],
    },
    selectedSize: {
      type: String,
      default: null,
      trim: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal must be non-negative'],
    },
  },
  { _id: true }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'],
      default: 'PENDING',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REFUND_FAILED'],
      default: 'UNPAID',
      index: true,
    },
    refundDetails: {
      refundId: { type: String, default: null },
      idempotencyKey: { type: String, default: null },
      cancellationIdempotencyKey: { type: String, default: null },
      returnIdempotencyKey: { type: String, default: null },
      amount: { type: Number, default: 0 },
      amountRefundedMinor: { type: Number, default: 0 },
      currency: { type: String, default: 'usd', lowercase: true },
      status: {
        type: String,
        enum: ['NONE', 'PENDING', 'SUCCEEDED', 'FAILED'],
        default: 'NONE',
        index: true,
      },
      reason: { type: String, default: null },
      failureReason: { type: String, default: null },
      requestedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      refunds: [
        {
          refundId: { type: String, required: true },
          amountMinor: { type: Number, required: true },
          status: { type: String, default: 'succeeded' },
          createdAt: { type: Date, default: Date.now },
        },
      ],
    },
    returnDetails: {
      status: {
        type: String,
        enum: ['NONE', 'REQUESTED', 'RECEIVED', 'INSPECTED', 'RESTOCKED', 'REJECTED'],
        default: 'NONE',
      },
      requestedAt: { type: Date, default: null },
      receivedAt: { type: Date, default: null },
      inspectedAt: { type: Date, default: null },
      restockedAt: { type: Date, default: null },
      restocked: { type: Boolean, default: false },
      condition: { type: String, default: null, trim: true },
      notes: { type: String, default: null, trim: true },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    currency: {
      type: String,
      default: 'usd',
      lowercase: true,
      trim: true,
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Order total cannot be negative'],
    },
    trackingNumber: {
      type: String,
      default: null,
      trim: true,
    },
    stripeSessionId: {
      type: String,
      default: null,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      default: null,
    },
    stockReserved: {
      type: Boolean,
      default: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [(val) => val.length > 0, 'Order must contain at least one item'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id.toString();
        ret.items = (ret.items || []).map((item) => ({
          id: item._id ? item._id.toString() : undefined,
          productId: item.product ? (item.product._id ? item.product._id.toString() : item.product.toString()) : null,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          selectedSize: item.selectedSize || null,
          subtotal: item.subtotal,
        }));
        delete ret._id;
        delete ret.__v;
        delete ret.stripeSessionId;
        delete ret.stripePaymentIntentId;
        delete ret.stockReserved;
        return ret;
      },
    },
  }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, stockReserved: 1, createdAt: 1 });
orderSchema.index({ status: 1, paymentStatus: 1 });
orderSchema.index({ 'refundDetails.idempotencyKey': 1 }, { sparse: true });
orderSchema.index({ 'refundDetails.cancellationIdempotencyKey': 1 }, { sparse: true });
orderSchema.index({ 'refundDetails.returnIdempotencyKey': 1 }, { sparse: true });
orderSchema.index({ 'refundDetails.refundId': 1 }, { sparse: true });

export const Order = mongoose.model('Order', orderSchema);
