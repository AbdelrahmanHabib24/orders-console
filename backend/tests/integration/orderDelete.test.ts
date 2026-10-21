import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import app from '../../src/index.js';
import { JWT_SECRET } from '../../src/config.js';
import { assertNotProduction } from '../checkTestEnv.js';

describe('Order Deletion Authorization - Agent Delete 403 Acceptance Test', () => {
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    assertNotProduction();

    // Start ephemeral test HTTP server on free port
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('ACCEPTANCE CRITERION: an authenticated AGENT attempting to delete an order receives HTTP 403', async () => {
    // Sign an authentic JWT for an AGENT user
    const agentToken = jwt.sign(
      { sub: 'test-agent-id', email: 'agent@ordersconsole.com', role: UserRole.AGENT },
      JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const res = await fetch(`${baseUrl}/api/orders/order-test-001`, {
      method: 'DELETE',
      headers: {
        Origin: 'http://localhost:5173',
        Cookie: `auth_token=${agentToken}`
      }
    });

    assert.equal(res.status, 403);
    const body = (await res.json()) as { error?: string; message?: string };
    assert.equal(body.error, 'Forbidden');
    assert.equal(body.message, 'Insufficient permissions');
  });
});
