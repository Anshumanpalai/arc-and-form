import mongoose from 'mongoose';

const processedEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      trim: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
  }
);

export const ProcessedEvent = mongoose.model('ProcessedEvent', processedEventSchema);
