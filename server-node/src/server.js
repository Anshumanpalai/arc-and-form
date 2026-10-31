import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { OrderService } from './services/orderService.js';

let serverInstance = null;
let recoveryInterval = null;

async function startServer() {
  try {
    console.log(`[server] Initializing ARC & FORM Node.js backend (NODE_ENV=${env.NODE_ENV})...`);

    // Connect to database
    await connectDB();

    serverInstance = app.listen(env.PORT, () => {
      console.log(`[server] ARC & FORM backend running on http://localhost:${env.PORT}`);
      console.log(`[server] Health check available at http://localhost:${env.PORT}/health`);
    });

    // Schedule periodic reservation expiry recovery (every 15 minutes)
    const RECOVERY_INTERVAL_MS = 15 * 60 * 1000;
    recoveryInterval = setInterval(async () => {
      try {
        await OrderService.recoverExpiredReservations();
      } catch (err) {
        console.error('[server] Error running reservation recovery:', err.message);
      }
    }, RECOVERY_INTERVAL_MS);
    if (recoveryInterval.unref) recoveryInterval.unref();
  } catch (err) {
    console.error(`[server] Startup failed: ${err.message}`);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Commencing graceful shutdown...`);

  if (recoveryInterval) {
    clearInterval(recoveryInterval);
    recoveryInterval = null;
  }

  if (serverInstance) {
    await new Promise((resolve) => serverInstance.close(resolve));
    console.log('[server] HTTP listener closed.');
  }

  await disconnectDB();
  console.log('[server] Shutdown complete.');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();

