import { app } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './config/db.js';
import { defaultRecoveryScheduler } from './services/recoveryScheduler.js';

let serverInstance = null;

async function startServer() {
  try {
    console.log(`[server] Initializing ARC & FORM Node.js backend (NODE_ENV=${env.NODE_ENV})...`);

    // Connect to database
    await connectDB();

    serverInstance = app.listen(env.PORT, '0.0.0.0', () => {
      console.log(`[server] ARC & FORM backend running on http://0.0.0.0:${env.PORT}`);
      console.log(`[server] Health check available at http://0.0.0.0:${env.PORT}/health`);
    });

    // Start background recovery scheduler for reservations and stale refunds
    defaultRecoveryScheduler.start();
  } catch (err) {
    console.error(`[server] Startup failed: ${err.message}`);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Commencing graceful shutdown...`);

  // Stop background recovery scheduler cleanly
  defaultRecoveryScheduler.stop();

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

