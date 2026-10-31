import mongoose from 'mongoose';
import { env } from './env.js';

let memoryServer = null;

/**
 * Connect to MongoDB instance.
 * In production: Strict fail-safe connection to env.MONGODB_URI.
 * In dev/test: Connects to env.MONGODB_URI, or spins up mongodb-memory-server
 * only if USE_MEMORY_DB was explicitly enabled.
 */
export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  let connectionUri = env.MONGODB_URI;

  if (env.USE_MEMORY_DB) {
    if (env.isProduction) {
      throw new Error('FATAL: Attempted to initialize in-memory database in production.');
    }
    console.warn('[db] USE_MEMORY_DB is enabled: Starting isolated MongoMemoryReplSet for development/testing...');
    const { MongoMemoryReplSet } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    connectionUri = memoryServer.getUri();
  }

  try {
    const conn = await mongoose.connect(connectionUri, {
      autoIndex: !env.isProduction, // Disable automatic index builds in production for performance
      serverSelectionTimeoutMS: 5000,
    });

    console.log(`[db] Connected to MongoDB host: ${conn.connection.host || 'memory-instance'} (${conn.connection.name})`);
    return conn;
  } catch (err) {
    console.error(`[db] Failed to connect to MongoDB: ${err.message}`);
    // Never fall back silently in production or when connection fails
    throw err;
  }
}

/**
 * Disconnect from MongoDB and stop memory server if active.
 */
export async function disconnectDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (memoryServer) {
      await memoryServer.stop();
      memoryServer = null;
    }
    console.log('[db] Disconnected from MongoDB.');
  } catch (err) {
    console.error(`[db] Error during disconnect: ${err.message}`);
  }
}

