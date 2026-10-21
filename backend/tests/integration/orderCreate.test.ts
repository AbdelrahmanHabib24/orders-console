import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole } from '@prisma/client';
import { assertNotProduction } from '../checkTestEnv.js';
import {
  validateTestDatabaseUrl,
  verifyTestDatabaseConnection
} from '../../src/testDbGuard.js';

describe('Order Creation & Concurrency Idempotency - Isolated R2 Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let testPrisma: PrismaClient;
  let originalAppUrl: string | undefined;

  const testUser1Id = 'test-r2-user-agent-01';
  const testUser2Id = 'test-r2-user-agent-02';
  const testAdminId = 'test-r2-user-admin-01';

  let agent1Token: string;
  let agent2Token: string;
  let adminToken: string;

  const createdOrderIds: string[] = [];

  before(async () => {
    assertNotProduction();

    const testUrl = process.env.TEST_DATABASE_URL;
    originalAppUrl = process.env.DATABASE_URL;
    const parsed = validateTestDatabaseUrl(testUrl, originalAppUrl);

    // Point process.env.DATABASE_URL to isolated test database before db/app initialization
    process.env.DATABASE_URL = testUrl;

    const { default: app } = await import('../../src/index.js');
    const { JWT_SECRET } = await import('../../src/config.js');

    // Connect directly to test database and verify identity
    testPrisma = new PrismaClient({ datasourceUrl: testUrl });
    const identity = await verifyTestDatabaseConnection(testPrisma, parsed.database);
    assert.equal(identity.database, 'orders_console_test');

    // Start ephemeral HTTP server
    server = http.createServer(app as any);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    // Seed test users
    await testPrisma.user.upsert({
      where: { id: testUser1Id },
      update: {},
      create: {
        id: testUser1Id,
        email: 'r2-agent1@ordersconsole.com',
        passwordHash: '$2a$10$e8wF5qU5/bT55zKj52XJ2u/3Wp0O0d6i7s3k6X6j1N0c1c1c1c1c1',
        role: UserRole.AGENT
      }
    });

    await testPrisma.user.upsert({
      where: { id: testUser2Id },
      update: {},
      create: {
        id: testUser2Id,
        email: 'r2-agent2@ordersconsole.com',
        passwordHash: '$2a$10$e8wF5qU5/bT55zKj52XJ2u/3Wp0O0d6i7s3k6X6j1N0c1c1c1c1c1',
        role: UserRole.AGENT
      }
    });

    await testPrisma.user.upsert({
      where: { id: testAdminId },
      update: {},
      create: {
        id: testAdminId,
        email: 'r2-admin@ordersconsole.com',
        passwordHash: '$2a$10$e8wF5qU5/bT55zKj52XJ2u/3Wp0O0d6i7s3k6X6j1N0c1c1c1c1c1',
        role: UserRole.ADMIN
      }
    });

    // Sign JWTs
    agent1Token = jwt.sign(
      { sub: testUser1Id, email: 'r2-agent1@ordersconsole.com', role: UserRole.AGENT },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    agent2Token = jwt.sign(
      { sub: testUser2Id, email: 'r2-agent2@ordersconsole.com', role: UserRole.AGENT },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    adminToken = jwt.sign(
      { sub: testAdminId, email: 'r2-admin@ordersconsole.com', role: UserRole.ADMIN },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );
  });

  after(async () => {
    // Clean up only test records
    if (createdOrderIds.length > 0) {
      await testPrisma.order.deleteMany({
        where: { id: { in: createdOrderIds } }
      });
    }

    await testPrisma.user.deleteMany({
      where: { id: { in: [testUser1Id, testUser2Id, testAdminId] } }
    });

    await testPrisma.$disconnect().catch(() => {});

    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    process.env.DATABASE_URL = originalAppUrl;
  });

  // 1. Authentication check
  it('1. rejects unauthenticated POST /api/orders with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'key-unauth-001',
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        customerName: 'Unauth Customer',
        customerEmail: 'unauth@example.com',
        amount: 50.0,
        items: [{ productName: 'Widget', quantity: 1, unitPrice: 50.0 }]
      })
    });

    assert.equal(res.status, 401);
  });

  // 2. Missing or invalid idempotency key
  it('2. rejects POST /api/orders with missing or empty Idempotency-Key header with 400 Bad Request', async () => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        customerName: 'No Key Customer',
        customerEmail: 'nokey@example.com',
        amount: 25.0,
        items: [{ productName: 'Widget', quantity: 1, unitPrice: 25.0 }]
      })
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.match(body.message, /Idempotency-Key/i);
  });

  // 3. Validation errors
  it('3. rejects invalid customer, item, quantity, unit price, and mismatched amount with 400 Bad Request', async () => {
    // Mismatched amount: items total is $40.00, but amount submitted is $50.00
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': 'key-invalid-001',
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        customerName: 'Test Customer',
        customerEmail: 'invalid-email',
        amount: 50.0,
        items: [{ productName: '', quantity: 0, unitPrice: -10 }]
      })
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.error, 'BadRequest');
  });

  // 4. Valid order creation
  it('4. successfully creates a valid order with items and returns 201 Created', async () => {
    const key = `key-valid-${Date.now()}`;
    const payload = {
      customerName: 'Hassan Mansour',
      customerEmail: 'hassan.mansour@example.com',
      amount: 175.5,
      items: [
        { productName: 'Wireless Mouse', quantity: 2, unitPrice: 25.0 },
        { productName: 'Mechanical Keyboard', quantity: 1, unitPrice: 125.5 }
      ]
    };

    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = (await res.json()) as any;
    assert.equal(body.message, 'Order created successfully');
    assert.ok(body.order?.id);
    assert.equal(body.order.customerName, 'Hassan Mansour');
    assert.equal(Number(body.order.amount), 175.5);
    assert.equal(body.order.items.length, 2);

    createdOrderIds.push(body.order.id);
  });

  // 5. Repeated request with identical payload returns existing order (idempotent replay)
  it('5. repeated request with same Idempotency-Key and identical payload returns 200 OK (idempotent replay)', async () => {
    const key = `key-replay-${Date.now()}`;
    const payload = {
      customerName: 'Nadia Kamel',
      customerEmail: 'nadia.kamel@example.com',
      amount: 80.0,
      items: [{ productName: 'Laptop Stand', quantity: 2, unitPrice: 40.0 }]
    };

    // First request (fresh creation)
    const res1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res1.status, 201);
    const body1 = (await res1.json()) as any;
    createdOrderIds.push(body1.order.id);

    // Second request (identical replay)
    const res2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res2.status, 200);
    const body2 = (await res2.json()) as any;
    assert.match(body2.message, /idempotent replay/i);
    assert.equal(body2.order.id, body1.order.id);
    assert.equal(body2.order.orderNumber, body1.order.orderNumber);

    // Database verification: exactly one order exists
    const count = await testPrisma.order.count({
      where: { userId: testUser1Id, idempotencyKey: key }
    });
    assert.equal(count, 1);
  });

  // 6. Repeated request with different payload returns 422 Unprocessable Entity
  it('6. repeated request with same Idempotency-Key but different payload returns 422 Unprocessable Entity', async () => {
    const key = `key-conflict-${Date.now()}`;
    const initialPayload = {
      customerName: 'Original Customer',
      customerEmail: 'original@example.com',
      amount: 30.0,
      items: [{ productName: 'USB Cable', quantity: 3, unitPrice: 10.0 }]
    };

    const conflictingPayload = {
      customerName: 'Altered Customer',
      customerEmail: 'altered@example.com',
      amount: 60.0,
      items: [{ productName: 'HDMI Cable', quantity: 3, unitPrice: 20.0 }]
    };

    // 1. Initial request succeeds
    const res1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(initialPayload)
    });

    assert.equal(res1.status, 201);
    const body1 = (await res1.json()) as any;
    createdOrderIds.push(body1.order.id);

    // 2. Conflicting request with same key
    const res2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(conflictingPayload)
    });

    assert.equal(res2.status, 422);
    const body2 = (await res2.json()) as any;
    assert.equal(body2.error, 'UnprocessableEntity');
    assert.match(body2.message, /different request payload/i);
  });

  // 7. Concurrent Parallel Requests Proof
  it('7. concurrent parallel requests with same user, key, and payload result in exactly one order in database and return the same order ID', async () => {
    const key = `key-parallel-${Date.now()}`;
    const payload = {
      customerName: 'Concurrent Customer',
      customerEmail: 'concurrent@example.com',
      amount: 150.0,
      items: [
        { productName: 'Gaming Headset', quantity: 1, unitPrice: 100.0 },
        { productName: 'Mousepad XL', quantity: 2, unitPrice: 25.0 }
      ]
    };

    const PARALLEL_REQUESTS_COUNT = 8;
    const requests = Array.from({ length: PARALLEL_REQUESTS_COUNT }, () =>
      fetch(`${baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
          Cookie: `auth_token=${agent1Token}`,
          Origin: 'http://localhost:5173'
        },
        body: JSON.stringify(payload)
      })
    );

    // Fire all requests concurrently
    const responses = await Promise.all(requests);

    // All requests must return HTTP 200 or 201
    for (const res of responses) {
      assert.ok(
        res.status === 200 || res.status === 201,
        `Expected status 200 or 201, received ${res.status}`
      );
    }

    const bodies = await Promise.all(responses.map((r) => r.json() as Promise<any>));

    // Capture created order ID for cleanup
    const primaryOrderId = bodies[0].order.id;
    createdOrderIds.push(primaryOrderId);

    // Assert that every single response returned the EXACT same order ID and orderNumber
    for (const body of bodies) {
      assert.equal(body.order.id, primaryOrderId);
      assert.equal(body.order.orderNumber, bodies[0].order.orderNumber);
      assert.equal(body.order.customerName, 'Concurrent Customer');
      assert.equal(body.order.items.length, 2);
    }

    // Direct database proof: exactly 1 order exists for this user and idempotency key
    const orderCount = await testPrisma.order.count({
      where: { userId: testUser1Id, idempotencyKey: key }
    });
    assert.equal(orderCount, 1, 'Database must contain exactly 1 order for the concurrent submissions');

    // Direct database proof: exactly 2 order items exist for this order
    const itemCount = await testPrisma.orderItem.count({
      where: { orderId: primaryOrderId }
    });
    assert.equal(itemCount, 2, 'Database must contain exactly 2 order items (one order set)');
  });

  // 8. Independent scoping across users
  it('8. different users with identical Idempotency-Key are independently scoped and create separate orders', async () => {
    const sharedKey = `key-shared-user-scope-${Date.now()}`;
    const payload1 = {
      customerName: 'User 1 Customer',
      customerEmail: 'u1@example.com',
      amount: 10.0,
      items: [{ productName: 'Pen', quantity: 1, unitPrice: 10.0 }]
    };
    const payload2 = {
      customerName: 'User 2 Customer',
      customerEmail: 'u2@example.com',
      amount: 20.0,
      items: [{ productName: 'Notebook', quantity: 1, unitPrice: 20.0 }]
    };

    // User 1 creates order with sharedKey
    const res1 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': sharedKey,
        Cookie: `auth_token=${agent1Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(payload1)
    });
    assert.equal(res1.status, 201);
    const body1 = (await res1.json()) as any;
    createdOrderIds.push(body1.order.id);

    // User 2 creates order with same sharedKey
    const res2 = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': sharedKey,
        Cookie: `auth_token=${agent2Token}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify(payload2)
    });
    assert.equal(res2.status, 201);
    const body2 = (await res2.json()) as any;
    createdOrderIds.push(body2.order.id);

    // Both orders were created successfully with distinct IDs
    assert.notEqual(body1.order.id, body2.order.id);

    const user1Order = await testPrisma.order.findUnique({
      where: { userId_idempotencyKey: { userId: testUser1Id, idempotencyKey: sharedKey } }
    });
    const user2Order = await testPrisma.order.findUnique({
      where: { userId_idempotencyKey: { userId: testUser2Id, idempotencyKey: sharedKey } }
    });
    assert.ok(user1Order);
    assert.ok(user2Order);
    assert.equal(user1Order.customerName, 'User 1 Customer');
    assert.equal(user2Order.customerName, 'User 2 Customer');
  });

  // 9. API response contract cleanup verification
  it('9. verifies API response payload cleanup: session profile omits user.id, and delete success omits id', async () => {
    // A. Check /api/auth/me response
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${agent1Token}`
      }
    });

    assert.equal(meRes.status, 200);
    const meBody = (await meRes.json()) as any;
    assert.ok(meBody.user);
    assert.equal(meBody.user.email, 'r2-agent1@ordersconsole.com');
    assert.equal(meBody.user.role, 'AGENT');
    assert.equal(meBody.user.id, undefined, 'GET /api/auth/me user object must not expose user.id');

    // B. Check DELETE /api/orders/:id response
    // Create an order to delete
    const deleteKey = `key-delete-target-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': deleteKey,
        Cookie: `auth_token=${adminToken}`,
        Origin: 'http://localhost:5173'
      },
      body: JSON.stringify({
        customerName: 'To Be Deleted',
        customerEmail: 'delete@example.com',
        amount: 30.0,
        items: [{ productName: 'Temp Item', quantity: 1, unitPrice: 30.0 }]
      })
    });
    const createBody = (await createRes.json()) as any;
    const targetOrderId = createBody.order.id;

    // Delete as ADMIN
    const deleteRes = await fetch(`${baseUrl}/api/orders/${targetOrderId}`, {
      method: 'DELETE',
      headers: {
        Cookie: `auth_token=${adminToken}`,
        Origin: 'http://localhost:5173'
      }
    });

    assert.equal(deleteRes.status, 200);
    const deleteBody = (await deleteRes.json()) as any;
    assert.equal(deleteBody.message, 'Order deleted successfully');
    assert.equal(deleteBody.id, undefined, 'DELETE response must return confirmation message only without echoing id');
  });
});
