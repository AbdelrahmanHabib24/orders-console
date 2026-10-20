import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTestDatabaseUrl } from '../../src/testDbGuard.js';

describe('Test DB Guard - Unit Validations (Offline)', () => {
  it('rejects missing or blank TEST_DATABASE_URL', () => {
    assert.throws(
      () => validateTestDatabaseUrl(undefined, 'postgresql://localhost:5432/app'),
      /TEST_DATABASE_URL is missing or blank/
    );
    assert.throws(
      () => validateTestDatabaseUrl('', 'postgresql://localhost:5432/app'),
      /TEST_DATABASE_URL is missing or blank/
    );
    assert.throws(
      () => validateTestDatabaseUrl('   ', 'postgresql://localhost:5432/app'),
      /TEST_DATABASE_URL is missing or blank/
    );
  });

  it('rejects invalid URL syntax and non-postgres protocols', () => {
    assert.throws(
      () => validateTestDatabaseUrl('not-a-valid-url', 'postgresql://localhost:5432/app'),
      /Invalid TEST_DATABASE_URL format/
    );
    assert.throws(
      () => validateTestDatabaseUrl('http://localhost:5432/orders_test', 'postgresql://localhost:5432/app'),
      /must use postgresql: or postgres: protocol/
    );
    assert.throws(
      () => validateTestDatabaseUrl('postgresql://localhost:5432', 'postgresql://localhost:5432/app'),
      /does not specify a database name/
    );
    assert.throws(
      () => validateTestDatabaseUrl('postgresql://localhost:5432/', 'postgresql://localhost:5432/app'),
      /does not specify a database name/
    );
  });

  it('rejects database names not ending in _test', () => {
    assert.throws(
      () => validateTestDatabaseUrl('postgresql://user:pass@localhost:5432/orders_console', 'postgresql://user:pass@localhost:5432/other'),
      /must end with "_test"/
    );
    assert.throws(
      () => validateTestDatabaseUrl('postgresql://user:pass@localhost:5432/orders_production?schema=public', 'postgresql://user:pass@localhost:5432/other'),
      /must end with "_test"/
    );
    assert.throws(
      () => validateTestDatabaseUrl('postgresql://user:pass@localhost:5432/orders_testing', 'postgresql://user:pass@localhost:5432/other'),
      /must end with "_test"/
    );
  });

  it('rejects configurations that resolve to the same application database', () => {
    const rawUrl = 'postgresql://user:secret@localhost:5432/orders_console_test';
    assert.throws(
      () => validateTestDatabaseUrl(rawUrl, rawUrl),
      /resolves to the same database as DATABASE_URL/
    );

    // Normalized comparison: localhost vs 127.0.0.1 and differing query parameters
    const url1 = 'postgresql://user:secret@localhost:5432/orders_console_test?sslmode=disable';
    const url2 = 'postgresql://user:secret@127.0.0.1:5432/orders_console_test?schema=public';
    assert.throws(
      () => validateTestDatabaseUrl(url1, url2),
      /resolves to the same database as DATABASE_URL/
    );

    // Matching database name across different ports/hosts
    const appUrl = 'postgresql://user:secret@remotehost:5432/orders_staging_test';
    const testUrl = 'postgresql://user:secret@localhost:5432/orders_staging_test';
    assert.throws(
      () => validateTestDatabaseUrl(testUrl, appUrl),
      /cannot use the application database name/
    );
  });

  it('succeeds with a valid isolated test database URL', () => {
    const testUrl = 'postgresql://user:secret@localhost:5432/orders_console_test?schema=public';
    const appUrl = 'postgresql://user:secret@localhost:5432/orders_console?schema=public';
    const result = validateTestDatabaseUrl(testUrl, appUrl);

    assert.equal(result.database, 'orders_console_test');
    assert.equal(result.host, 'localhost');
    assert.equal(result.port, 5432);
  });
});