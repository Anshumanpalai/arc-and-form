import { OrderService } from './orderService.js';

export class RecoveryScheduler {
  constructor({
    intervalMs = 15 * 60 * 1000,
    thresholdMinutes = 15,
    autoStart = false,
  } = {}) {
    this.intervalMs = intervalMs;
    this.thresholdMinutes = thresholdMinutes;
    this.timer = null;
    this.isRunning = false;
    this.isExecuting = false; // Overlap prevention guard within instance
    this.lastRunAt = null;
    this.lastStats = null;

    if (autoStart) {
      this.start();
    }
  }

  /**
   * Start the periodic background recovery scheduler.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => {
        console.error('[recovery-scheduler] Unhandled error during scheduled cycle:', err.message);
      });
    }, this.intervalMs);

    // Unref timer so it does not block Node process exit if remaining work is done
    if (this.timer.unref) {
      this.timer.unref();
    }

    console.log(
      `[recovery-scheduler] Started periodic background recovery worker (interval: ${this.intervalMs / 1000}s, threshold: ${this.thresholdMinutes}m).`
    );
  }

  /**
   * Stop the background scheduler gracefully.
   */
  stop() {
    if (!this.isRunning) return;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    console.log('[recovery-scheduler] Stopped periodic background recovery worker.');
  }

  /**
   * Execute one recovery cycle.
   * Prevents overlapping execution within this instance and handles errors safely.
   */
  async runOnce() {
    if (this.isExecuting) {
      console.warn('[recovery-scheduler] Previous recovery cycle is still running. Skipping overlapping execution.');
      return { skipped: true, reason: 'overlapping' };
    }

    this.isExecuting = true;
    this.lastRunAt = new Date();

    try {
      // 1. Recover expired abandoned pending checkout reservations
      const reservationStats = await OrderService.recoverExpiredReservations({
        ttlMinutes: this.thresholdMinutes,
      });

      // 2. Recover stale pending refunds
      const refundStats = await OrderService.recoverStalePendingRefunds({
        thresholdMinutes: this.thresholdMinutes,
      });

      const stats = {
        executed: true,
        executedAt: this.lastRunAt,
        reservations: reservationStats,
        refunds: refundStats,
      };

      this.lastStats = stats;
      return stats;
    } catch (err) {
      console.error('[recovery-scheduler] Error during recovery cycle execution:', err.message);
      const errorStats = {
        executed: false,
        error: err.message,
        executedAt: this.lastRunAt,
      };
      this.lastStats = errorStats;
      return errorStats;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Retrieve current scheduler status.
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isExecuting: this.isExecuting,
      intervalMs: this.intervalMs,
      thresholdMinutes: this.thresholdMinutes,
      lastRunAt: this.lastRunAt,
      lastStats: this.lastStats,
    };
  }
}

// Global default scheduler instance for server lifecycle
export const defaultRecoveryScheduler = new RecoveryScheduler({
  intervalMs: Number(process.env.RECOVERY_INTERVAL_MS) || 15 * 60 * 1000,
  thresholdMinutes: Number(process.env.RECOVERY_THRESHOLD_MINUTES) || 15,
});

