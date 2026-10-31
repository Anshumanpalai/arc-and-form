import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';

let server;
let baseUrl;

test.before(async () => {
  // Connect to isolated in-memory test database
  await connectDB();

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await disconnectDB();
});

test('GET /health returns HTTP 200 with UP status and active DB connection', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.status, 'UP');
  assert.ok(typeof data.timestamp === 'string');
  assert.ok(typeof data.uptime === 'number');
  assert.equal(data.database.status, 'UP');
  assert.equal(data.database.state, 'CONNECTED');
});

test('GET /api/health returns HTTP 200 matching root health check', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.status, 'UP');
  assert.ok(typeof data.timestamp === 'string');
  assert.equal(data.database.status, 'UP');
});

test('GET unhandled route returns 404 with Spring-compatible error structure', async () => {
  const res = await fetch(`${baseUrl}/api/unknown-endpoint-test`);
  assert.equal(res.status, 404);

  const data = await res.json();
  assert.equal(data.status, 404);
  assert.equal(data.error, 'Not Found');
  assert.ok(data.message.includes('unknown-endpoint-test'));
  assert.equal(data.path, '/api/unknown-endpoint-test');
  assert.ok(typeof data.timestamp === 'string');
});
