import { PrismaClient } from '@prisma/client';

export interface DatabaseIdentity {
  database: string;
  host: string | null;
  port: number | null;
  user: string;
}

export interface ParsedConnectionDetails {
  host: string;
  port: number;
  database: string;
}

function parseDatabaseDetails(urlStr: string, envVarName: string): ParsedConnectionDetails {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid ${envVarName} format: ${msg}`);
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(`${envVarName} must use postgresql: or postgres: protocol`);
  }

  const rawDb = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
  const database = rawDb.split('?')[0].trim();

  if (!database) {
    throw new Error(`${envVarName} does not specify a database name`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  const host = (parsed.hostname || 'localhost').toLowerCase();

  return { host, port, database };
}

function areHostsEquivalent(host1: string, host2: string): boolean {
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (localHosts.has(host1) && localHosts.has(host2)) {
    return true;
  }
  return host1 === host2;
}

export function validateTestDatabaseUrl(
  testUrl?: string,
  appUrl?: string
): ParsedConnectionDetails {
  if (!testUrl || testUrl.trim() === '') {
    throw new Error('TEST_DATABASE_URL is missing or blank');
  }

  const testDetails = parseDatabaseDetails(testUrl.trim(), 'TEST_DATABASE_URL');

  if (!testDetails.database.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL database name "${testDetails.database}" must end with "_test"`
    );
  }

  if (appUrl && appUrl.trim() !== '') {
    try {
      const appDetails = parseDatabaseDetails(appUrl.trim(), 'DATABASE_URL');

      const isSameHost = areHostsEquivalent(testDetails.host, appDetails.host);
      const isSamePort = testDetails.port === appDetails.port;
      const isSameDb = testDetails.database === appDetails.database;

      if (isSameDb && isSameHost && isSamePort) {
        throw new Error(
          'TEST_DATABASE_URL resolves to the same database as DATABASE_URL'
        );
      }

      if (isSameDb) {
        throw new Error(
          `TEST_DATABASE_URL cannot use the application database name "${testDetails.database}"`
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('TEST_DATABASE_URL')) {
        throw err;
      }
      // If DATABASE_URL was invalid, do not block test validation unless it caused an explicit test URL error
    }
  }

  return testDetails;
}

export async function verifyTestDatabaseConnection(
  prisma: PrismaClient,
  expectedDbName = 'orders_console_test'
): Promise<DatabaseIdentity> {
  let result: Array<{
    current_database: string;
    inet_server_addr: string | null;
    inet_server_port: number | null;
    current_user: string;
  }>;

  try {
    result = await prisma.$queryRawUnsafe<Array<{
      current_database: string;
      inet_server_addr: string | null;
      inet_server_port: number | null;
      current_user: string;
    }>>('SELECT current_database(), inet_server_addr()::text, inet_server_port()::integer, current_user;');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to query database identity: ${msg}`);
  }

  if (!result || result.length === 0) {
    throw new Error('Failed to query database identity: empty result returned');
  }

  const row = result[0];
  const dbName = row.current_database;

  if (!dbName.endsWith('_test')) {
    throw new Error(`Safety violation: Connected database "${dbName}" does not end with "_test"`);
  }

  if (expectedDbName && dbName !== expectedDbName) {
    throw new Error(`Safety violation: Connected database "${dbName}" does not match expected "${expectedDbName}"`);
  }

  return {
    database: dbName,
    host: row.inet_server_addr,
    port: row.inet_server_port,
    user: row.current_user
  };
}

export async function getTestPrismaClient(): Promise<{ prisma: PrismaClient; identity: DatabaseIdentity }> {
  const testUrl = process.env.TEST_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;

  const parsed = validateTestDatabaseUrl(testUrl, appUrl);

  const prisma = new PrismaClient({
    datasourceUrl: testUrl
  });

  try {
    const identity = await verifyTestDatabaseConnection(prisma, parsed.database);
    return { prisma, identity };
  } catch (err: unknown) {
    await prisma.$disconnect().catch(() => {});
    throw err;
  }
}