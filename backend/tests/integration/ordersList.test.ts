import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole, OrderStatus } from '@prisma/client';
import { assertNotProduction } from '../checkTestEnv.js';
import { validateTestDatabaseUrl, verifyTestDatabaseConnection } from '../../src/testDbGuard.js';

describe('Orders Listing & Filtering - Isolated R1 Integration Tests', () => {
  let server: http.Server;
  let baseUrl: string;
  let testPrisma: PrismaClient;
  let adminToken: string;
  let agentToken: string;
  let originalAppUrl: string | undefined;

  const testUserId = 'test-r1-fixture-user-001';
  const testOrderIds: string[] = [];

  before(async () => {
    // 1. Mandatory safety guards before loading app or running tests
    assertNotProduction();

    const testUrl = process.env.TEST_DATABASE_URL;
    originalAppUrl = process.env.DATABASE_URL;
    const parsed = validateTestDatabaseUrl(testUrl, originalAppUrl);

    // 2. Point process.env.DATABASE_URL to isolated test database before db/app initialization
    process.env.DATABASE_URL = testUrl;

    // 3. Import application instance with test database configuration
    const { default: app } = await import('../../src/index.js');
    const { JWT_SECRET } = await import('../../src/config.js');

    // Connect directly to test database and verify identity
    testPrisma = new PrismaClient({ datasourceUrl: testUrl });
    const identity = await verifyTestDatabaseConnection(testPrisma, parsed.database);
    assert.equal(identity.database, 'orders_console_test');

    // Create test user fixture
    await testPrisma.user.upsert({
      where: { id: testUserId },
      update: {},
      create: {
        id: testUserId,
        email: 'r1fixture@test.com',
        passwordHash: 'dummy_hash_for_test_fixtures',
        role: UserRole.AGENT
      }
    });

    // Seed 25 deterministic test orders into isolated orders_console_test
    const statuses: OrderStatus[] = [
      OrderStatus.PENDING,
      OrderStatus.PROCESSING,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED
    ];

    const customerNames = [
      'Fatima Fahmy',
      'Tarek Mansour',
      'Layla Hassan',
      'Omar Farouk',
      'Youssef Khalil'
    ];

    for (let i = 1; i <= 25; i++) {
      const orderId = `test-r1-order-${String(i).padStart(3, '0')}`;
      testOrderIds.push(orderId);

      const status = statuses[(i - 1) % statuses.length];
      const customerName = customerNames[(i - 1) % customerNames.length];
      const customerEmail = `${customerName.toLowerCase().replace(' ', '.')}@example.com`;
      const amount = (i * 100).toFixed(2);
      // Deterministic timestamps spaced by 1 hour (oldest: i=1, newest: i=25)
      const createdAt = new Date(Date.UTC(2026, 0, 1, i, 0, 0));

      await testPrisma.order.upsert({
        where: { id: orderId },
        update: {},
        create: {
          id: orderId,
          orderNumber: 900000 + i,
          customerName,
          customerEmail,
          status,
          amount,
          userId: testUserId,
          createdAt
        }
      });
    }

    // Generate valid tokens
    adminToken = jwt.sign(
      { sub: 'test-admin-id', email: 'admin@ordersconsole.com', role: UserRole.ADMIN },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    agentToken = jwt.sign(
      { sub: testUserId, email: 'r1fixture@test.com', role: UserRole.AGENT },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Start ephemeral server
    server = http.createServer(app as any);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    // 1. Close HTTP server
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 2. Clean up ONLY records created by this test suite
    if (testPrisma) {
      if (testOrderIds.length > 0) {
        await testPrisma.order.deleteMany({
          where: { id: { in: testOrderIds } }
        }).catch(() => {});
      }
      await testPrisma.user.deleteMany({
        where: { id: testUserId }
      }).catch(() => {});

      await testPrisma.$disconnect().catch(() => {});
    }

    // 3. Restore original DATABASE_URL
    if (originalAppUrl) {
      process.env.DATABASE_URL = originalAppUrl;
    }
  });

  it('1. rejects unauthenticated GET /api/orders with 401 Unauthorized', async () => {
    const res = await fetch(`${baseUrl}/api/orders`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error?: string };
    assert.equal(body.error, 'Unauthorized');
  });

  it('2. allows both authenticated AGENT and ADMIN to read orders list', async () => {
    const agentRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(agentRes.status, 200);

    const adminRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: `auth_token=${adminToken}` }
    });
    assert.equal(adminRes.status, 200);
  });

  it('3. uses default page size of 20 and returns correct pagination metadata from isolated test DB', async () => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;

    assert.equal(body.pagination.page, 1);
    assert.equal(body.pagination.limit, 20);
    assert.equal(body.orders.length, 20);
    assert.equal(body.pagination.totalCount, 25);
    assert.equal(body.pagination.totalPages, 2);
  });

  it('4. accepts limit=50 but rejects limit=51 and limit=100 with 400 Bad Request', async () => {
    const validRes = await fetch(`${baseUrl}/api/orders?limit=50`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(validRes.status, 200);
    const validBody = (await validRes.json()) as any;
    assert.equal(validBody.pagination.limit, 50);
    assert.equal(validBody.orders.length, 25);

    const invalid51 = await fetch(`${baseUrl}/api/orders?limit=51`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(invalid51.status, 400);

    const invalid100 = await fetch(`${baseUrl}/api/orders?limit=100`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(invalid100.status, 400);
    const errBody = (await invalid100.json()) as any;
    assert.equal(errBody.error, 'BadRequest');
  });

  it('5. searches orders by customer name or email case-insensitively', async () => {
    const res = await fetch(`${baseUrl}/api/orders?search=FATIMA&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.orders.length > 0);
    for (const order of body.orders) {
      const matchName = order.customerName.toLowerCase().includes('fatima');
      const matchEmail = order.customerEmail.toLowerCase().includes('fatima');
      assert.ok(matchName || matchEmail, `Order ${order.id} should match 'fatima' in name or email`);
    }
  });

  it('6. filters orders strictly by status', async () => {
    const res = await fetch(`${baseUrl}/api/orders?status=PENDING&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.orders.length > 0);
    for (const order of body.orders) {
      assert.equal(order.status, 'PENDING');
    }
  });

  it('7. sorts by amount and createdAt in both asc and desc directions', async () => {
    // 7a. Amount Ascending
    const amountAscRes = await fetch(`${baseUrl}/api/orders?sortBy=amount&sortOrder=asc&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(amountAscRes.status, 200);
    const amountAscBody = (await amountAscRes.json()) as any;
    for (let i = 1; i < amountAscBody.orders.length; i++) {
      const prev = Number(amountAscBody.orders[i - 1].amount);
      const curr = Number(amountAscBody.orders[i].amount);
      assert.ok(prev <= curr, `Amount asc order violated: ${prev} should be <= ${curr}`);
    }

    // 7b. Amount Descending
    const amountDescRes = await fetch(`${baseUrl}/api/orders?sortBy=amount&sortOrder=desc&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(amountDescRes.status, 200);
    const amountDescBody = (await amountDescRes.json()) as any;
    for (let i = 1; i < amountDescBody.orders.length; i++) {
      const prev = Number(amountDescBody.orders[i - 1].amount);
      const curr = Number(amountDescBody.orders[i].amount);
      assert.ok(prev >= curr, `Amount desc order violated: ${prev} should be >= ${curr}`);
    }

    // 7c. CreatedAt Ascending (using actual timestamps)
    const dateAscRes = await fetch(`${baseUrl}/api/orders?sortBy=createdAt&sortOrder=asc&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(dateAscRes.status, 200);
    const dateAscBody = (await dateAscRes.json()) as any;
    for (let i = 1; i < dateAscBody.orders.length; i++) {
      const prevTime = new Date(dateAscBody.orders[i - 1].createdAt).getTime();
      const currTime = new Date(dateAscBody.orders[i].createdAt).getTime();
      assert.ok(prevTime <= currTime, `CreatedAt asc order violated: ${prevTime} should be <= ${currTime}`);
    }

    // 7d. CreatedAt Descending (using actual timestamps)
    const dateDescRes = await fetch(`${baseUrl}/api/orders?sortBy=createdAt&sortOrder=desc&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(dateDescRes.status, 200);
    const dateDescBody = (await dateDescRes.json()) as any;
    for (let i = 1; i < dateDescBody.orders.length; i++) {
      const prevTime = new Date(dateDescBody.orders[i - 1].createdAt).getTime();
      const currTime = new Date(dateDescBody.orders[i].createdAt).getTime();
      assert.ok(prevTime >= currTime, `CreatedAt desc order violated: ${prevTime} should be >= ${currTime}`);
    }
  });

  it('8. handles page boundaries and zero-matching records correctly', async () => {
    // 8a. Zero matching records
    const zeroRes = await fetch(`${baseUrl}/api/orders?search=nonexistent_search_query_xyz_99999`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(zeroRes.status, 200);
    const zeroBody = (await zeroRes.json()) as any;
    assert.equal(zeroBody.orders.length, 0);
    assert.equal(zeroBody.pagination.totalCount, 0);
    assert.equal(zeroBody.pagination.totalPages, 0);
    assert.equal(zeroBody.pagination.page, 1);

    // 8b. Page 2 navigation with deterministic tie-breaking
    const p1Res = await fetch(`${baseUrl}/api/orders?page=1&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    const p2Res = await fetch(`${baseUrl}/api/orders?page=2&limit=10`, {
      headers: { Cookie: `auth_token=${agentToken}` }
    });
    assert.equal(p1Res.status, 200);
    assert.equal(p2Res.status, 200);
    const p1Body = (await p1Res.json()) as any;
    const p2Body = (await p2Res.json()) as any;

    assert.equal(p1Body.orders.length, 10);
    assert.equal(p2Body.orders.length, 10);

    const p1Ids = new Set(p1Body.orders.map((o: any) => o.id));
    for (const order of p2Body.orders) {
      assert.ok(!p1Ids.has(order.id), `Deterministic tie-breaking: page 2 order ${order.id} must not appear on page 1`);
    }
  });
});
