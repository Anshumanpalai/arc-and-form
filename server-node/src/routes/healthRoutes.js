import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

const DB_STATES = {
  0: 'DISCONNECTED',
  1: 'CONNECTED',
  2: 'CONNECTING',
  3: 'DISCONNECTING',
};

function buildHealthPayload() {
  const readyState = mongoose.connection.readyState;
  const dbState = DB_STATES[readyState] || 'UNKNOWN';
  const isHealthy = readyState === 1 || readyState === 2;

  return {
    status: isHealthy ? 'UP' : 'DOWN',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    database: {
      status: readyState === 1 ? 'UP' : 'DOWN',
      state: dbState,
    },
  };
}

const handleHealth = (req, res) => {
  const payload = buildHealthPayload();
  const statusCode = payload.status === 'UP' ? 200 : 503;
  res.status(statusCode).json(payload);
};

router.get('/health', handleHealth);
router.get('/api/health', handleHealth);

export default router;

