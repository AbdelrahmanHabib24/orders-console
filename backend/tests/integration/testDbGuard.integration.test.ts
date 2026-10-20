import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { getTestPrismaClient, verifyTestDatabaseConnection } from '../../src/testDbGuard.js';

describe('Test DB Guard - Live Database Integration Tests', () => {
  it('successfully connects to configured test database and verifies identity', async () => {
    const { prisma, identity } = await getTestPrismaClient();
    try {
      assert.ok(identity.database.endsWith('_test'), 'Database must end with _test');
      assert.equal(identity.database, 'orders_console_test');
      assert.ok(identity.user, 'Connected user must be identified');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('verifies database identity matches expected database name', async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    assert.ok(testUrl, 'TEST_DATABASE_URL must be configured for integration tests');

    const prisma = new PrismaClient({ datasourceUrl: testUrl });
    try {
      const identity = await verifyTestDatabaseConnection(prisma, 'orders_console_test');
      assert.equal(identity.database, 'orders_console_test');
    } finally {
      await prisma.$disconnect();
    }
  });

  it('rejects connection when expected database name mismatches', async () => {
    const testUrl = process.env.TEST_DATABASE_URL;
    const prisma = new PrismaClient({ datasourceUrl: testUrl });
    try {
      await assert.rejects(
        () => verifyTestDatabaseConnection(prisma, 'wrong_database_test'),
        /does not match expected/
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  it('fails cleanly when test database is unreachable or unavailable', async () => {
    // Unreachable port
    const unreachableUrl = 'postgresql://postgres:fakepass@127.0.0.1:54399/orders_console_test?connect_timeout=2';
    const prismaUnreachable = new PrismaClient({ datasourceUrl: unreachableUrl });
    try {
      await assert.rejects(
        () => verifyTestDatabaseConnection(prismaUnreachable, 'orders_console_test'),
        /Failed to query database identity/
      );
    } finally {
      await prismaUnreachable.$disconnect().catch(() => {});
    }

    // Non-existent database on valid host
    const missingDbUrl = 'postgresql://postgres:fakepass@127.0.0.1:5432/non_existent_orders_db_test';
    const prismaMissing = new PrismaClient({ datasourceUrl: missingDbUrl });
    try {
      await assert.rejects(
        () => verifyTestDatabaseConnection(prismaMissing, 'non_existent_orders_db_test'),
        /Failed to query database identity/
      );
    } finally {
      await prismaMissing.$disconnect().catch(() => {});
    }
  });

  it('fail-closed write isolation: write operations execute only on verified test DB and clean up after themselves', async () => {
    const { prisma, identity } = await getTestPrismaClient();
    const runId = randomUUID();
    const testUserId = `test-probe-${runId}`;
    const testUserEmail = `probe-${runId}@ordersconsole-test.internal`;
    let recordCreated = false;

    try {
      // Identity is verified before any write
      assert.equal(identity.database, 'orders_console_test');

      const created = await prisma.user.create({
        data: {
          id: testUserId,
          email: testUserEmail,
          passwordHash: 'dummy_hash',
          role: 'AGENT'
        }
      });

      recordCreated = true;
      assert.equal(created.id, testUserId);

      // Verify row exists in test DB
      const found = await prisma.user.findUnique({
        where: { id: testUserId }
      });
      assert.ok(found, 'Record must exist in test database');
    } finally {
      try {
        if (recordCreated) {
          // Strict scoped cleanup: delete only the specific record created by this test run
          await prisma.user.deleteMany({
            where: { id: testUserId }
          });
        }
      } finally {
        await prisma.$disconnect().catch(() => {});
      }
    }
  });
});