import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../app.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { authenticate, requireAdmin } from '../middleware/authMiddleware.js';

let app;
let server;
let baseUrl;

test.before(async () => {
  await connectDB();
  await User.deleteMany({});
  await User.syncIndexes();

  app = createApp((testApp) => {
    // Test-only protected endpoints to test middleware in isolation
    testApp.get('/api/test/protected', authenticate, (req, res) => {
      res.json({ message: 'Welcome user', userId: req.user.id });
    });

    testApp.get('/api/test/admin-only', authenticate, requireAdmin, (req, res) => {
      res.json({ message: 'Welcome admin', adminId: req.user.id });
    });
  });

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
  await User.deleteMany({});
  await disconnectDB();
});

test.beforeEach(() => {
  // Reset rate limiter between tests to prevent test cross-contamination
  authRateLimiter.reset();
});

test.describe('Authentication & Registration Flow', () => {
  test('POST /api/auth/register creates customer account, sets HttpOnly cookie, and omits passwordHash', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        password: 'Password123!',
      }),
    });

    assert.equal(res.status, 201);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Must set authentication cookie');
    assert.ok(setCookie.includes('arc_token='), 'Cookie must be named arc_token');
    assert.ok(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');

    const data = await res.json();
    assert.equal(data.message, 'Registration successful');
    assert.equal(data.user.name, 'Jane Doe');
    assert.equal(data.user.email, 'jane.doe@example.com');
    assert.equal(data.user.role, 'CUSTOMER');
    assert.equal(data.user.passwordHash, undefined, 'passwordHash must never be exposed');
    assert.ok(data.user.id);
  });

  test('POST /api/auth/register prevents privilege escalation (ignores role: ADMIN in body)', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Hacker User',
        email: 'hacker@example.com',
        password: 'Password123!',
        role: 'ADMIN', // Attempted escalation
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.user.role, 'CUSTOMER', 'Role must remain CUSTOMER');
  });

  test('POST /api/auth/register rejects duplicate email with 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Jane Doe Duplicate',
        email: 'jane.doe@example.com',
        password: 'AnotherPassword123!',
      }),
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.status, 409);
    assert.equal(data.error, 'Conflict');
    assert.equal(data.message, 'An account with this email already exists');
  });

  test('POST /api/auth/register validates request body constraints', async () => {
    // Missing/short password
    const shortPassRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Short Pass',
        email: 'short@example.com',
        password: 'short',
      }),
    });
    assert.equal(shortPassRes.status, 400);

    // Invalid email
    const invalidEmailRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Email',
        email: 'not-an-email',
        password: 'Password123!',
      }),
    });
    assert.equal(invalidEmailRes.status, 400);
  });
});

test.describe('Login & Logout Flow', () => {
  test('POST /api/auth/login authenticates registered customer and sets cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.doe@example.com',
        password: 'Password123!',
      }),
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie.includes('arc_token='));

    const data = await res.json();
    assert.equal(data.message, 'Login successful');
    assert.equal(data.user.email, 'jane.doe@example.com');
    assert.equal(data.user.passwordHash, undefined);
  });

  test('POST /api/auth/login rejects incorrect password with 401', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.doe@example.com',
        password: 'WrongPassword!',
      }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.status, 401);
    assert.equal(data.message, 'Invalid email or password');
  });

  test('POST /api/auth/login rejects non-existent email with identical 401 message', async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@example.com',
        password: 'AnyPassword123!',
      }),
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.message, 'Invalid email or password');
  });

  test('POST /api/auth/logout clears arc_token cookie', async () => {
    const res = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
    });

    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie.includes('arc_token=;'));
    assert.ok(setCookie.includes('Max-Age=0'));

    const data = await res.json();
    assert.equal(data.user, null);
    assert.equal(data.message, 'Logged out successfully');
  });
});

test.describe('Session State (/api/auth/me) & Token Verification', () => {
  let customerCookie;

  test.before(async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.doe@example.com',
        password: 'Password123!',
      }),
    });
    const rawCookie = loginRes.headers.get('set-cookie');
    customerCookie = rawCookie.split(';')[0];
  });

  test('GET /api/auth/me returns user object when valid cookie is provided', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: customerCookie },
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data);
    assert.equal(data.email, 'jane.doe@example.com');
    assert.equal(data.passwordHash, undefined);
  });

  test('GET /api/auth/me returns null when unauthenticated', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data, null);
  });

  test('GET /api/auth/me returns null when token is malformed', async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: 'arc_token=invalid.jwt.token' },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data, null);
  });

  test('rejects expired JWT token on protected endpoint with 401', async () => {
    const expiredToken = jwt.sign(
      { sub: '123', id: '123', email: 'test@exp.com', role: 'CUSTOMER' },
      env.JWT_SECRET,
      { expiresIn: -10 } // Expired in the past
    );

    const res = await fetch(`${baseUrl}/api/test/protected`, {
      headers: { Cookie: `arc_token=${expiredToken}` },
    });

    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.message, 'Invalid or expired authentication token');
  });
});

test.describe('Authorization & Role-Based Access Control', () => {
  let customerCookie;
  let adminCookie;

  test.before(async () => {
    // Create an admin user directly
    const adminHash = await User.hashPassword('AdminPassword123!');
    await User.create({
      name: 'System Admin',
      email: 'admin.test@example.com',
      passwordHash: adminHash,
      role: 'ADMIN',
    });

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin.test@example.com',
        password: 'AdminPassword123!',
      }),
    });
    adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];

    const customerLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jane.doe@example.com',
        password: 'Password123!',
      }),
    });
    customerCookie = customerLogin.headers.get('set-cookie').split(';')[0];
  });

  test('unauthenticated request to protected route is rejected with 401', async () => {
    const res = await fetch(`${baseUrl}/api/test/protected`);
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.message, 'Full authentication is required to access this resource');
  });

  test('customer access to protected customer route is granted with 200', async () => {
    const res = await fetch(`${baseUrl}/api/test/protected`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'Welcome user');
  });

  test('customer attempting to access admin route is rejected with 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/test/admin-only`, {
      headers: { Cookie: customerCookie },
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.equal(data.error, 'Forbidden');
    assert.equal(data.message, 'Access denied: Administrator privileges required');
  });

  test('admin access to admin route is granted with 200 OK', async () => {
    const res = await fetch(`${baseUrl}/api/test/admin-only`, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.message, 'Welcome admin');
  });
});

test.describe('Rate Limiting on Authentication Endpoints', () => {
  test('rejects the 11th authentication request with 429 Too Many Requests', async () => {
    // Make 10 allowed requests
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rate.limit@test.com', password: 'wrong' }),
      });
      assert.equal(res.status, 401); // Normal auth rejection
    }

    // The 11th request must be rate limited
    const limitedRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'rate.limit@test.com', password: 'wrong' }),
    });

    assert.equal(limitedRes.status, 429);
    const data = await limitedRes.json();
    assert.equal(data.status, 429);
    assert.equal(data.error, 'Too Many Requests');
    assert.equal(data.message, 'Too many authentication requests. Please try again in a minute.');
  });
});
