import { PrismaClient, UserRole, OrderStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PRODUCTS = [
  { name: 'Ergonomic Office Chair', unitPriceCents: 18500 },
  { name: 'Mechanical Keyboard RGB', unitPriceCents: 7550 },
  { name: 'Ultra-Wide Monitor 34"', unitPriceCents: 42000 },
  { name: 'USB-C Docking Station', unitPriceCents: 11000 },
  { name: 'Noise-Cancelling Headset', unitPriceCents: 13525 },
  { name: 'Wireless Precision Mouse', unitPriceCents: 4575 },
  { name: 'Standing Desk Converter', unitPriceCents: 26000 },
  { name: 'HD Webcam 1080p', unitPriceCents: 5500 },
  { name: 'Desk LED Lamp', unitPriceCents: 3250 },
  { name: 'Laptop Cooling Pad', unitPriceCents: 2490 },
  { name: 'Dual Monitor Arm Mount', unitPriceCents: 8900 },
  { name: 'Vertical Ergonomic Mouse', unitPriceCents: 5200 },
  { name: 'Leather Desk Mat XL', unitPriceCents: 2850 },
  { name: 'Surge Protector 8-Outlet', unitPriceCents: 3400 },
  { name: 'Cable Management Spine', unitPriceCents: 1950 }
];

const FIRST_NAMES = [
  'Ahmed', 'Mohamed', 'Sarah', 'Fatima', 'Omar', 'Kareem', 'Layla', 'Nour',
  'Youssef', 'Hassan', 'Mona', 'Ali', 'Zainab', 'Tarek', 'Dina', 'Ibrahim',
  'Rania', 'Amr', 'Salma', 'Mahmoud', 'John', 'Emma', 'Michael', 'Sophia',
  'David', 'Olivia', 'James', 'Ava', 'William', 'Isabella'
];

const LAST_NAMES = [
  'El-Sayed', 'Mansour', 'Soliman', 'Ibrahim', 'Kamel', 'Radwan', 'Ghanem',
  'Fahmy', 'Zaki', 'Hafez', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones',
  'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'
];

const STATUS_WEIGHTS: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.COMPLETED,
  OrderStatus.COMPLETED,
  OrderStatus.PROCESSING,
  OrderStatus.PENDING,
  OrderStatus.CANCELLED
];

function verifySeedTargetDatabase(): { host: string; port: number; database: string } {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.trim() === '') {
    throw new Error('Safety block: DATABASE_URL is missing or blank');
  }

  let parsed: URL;
  try {
    parsed = new URL(dbUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Safety block: Invalid DATABASE_URL format: ${msg}`);
  }

  const hostname = (parsed.hostname || 'localhost').toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!localHosts.has(hostname)) {
    throw new Error(`Safety block: Seeding is only permitted on local database hosts. Target host is "${hostname}"`);
  }

  const rawDb = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
  const database = rawDb.split('?')[0].trim();

  if (database.endsWith('_test')) {
    throw new Error(`Safety block: Seeding must not run against isolated test database "${database}"`);
  }

  if (database !== 'orders_console') {
    throw new Error(`Safety block: Expected local database "orders_console", but target is "${database}"`);
  }

  const port = parsed.port ? parseInt(parsed.port, 10) : 5432;
  return { host: hostname, port, database };
}

async function verifyLiveTargetConnection(prismaClient: PrismaClient, expectedDb: string): Promise<void> {
  const result = await prismaClient.$queryRawUnsafe<Array<{
    current_database: string;
    inet_server_addr: string | null;
    inet_server_port: number | null;
    current_user: string;
  }>>('SELECT current_database(), inet_server_addr()::text, inet_server_port()::integer, current_user;');

  if (!result || result.length === 0) {
    throw new Error('Safety block: Failed to query target database identity');
  }

  const liveDb = result[0].current_database;
  if (liveDb !== expectedDb) {
    throw new Error(`Safety block: Connected database "${liveDb}" does not match target "${expectedDb}"`);
  }
}

async function validateSeedIntegrity(prismaClient: PrismaClient): Promise<void> {
  console.log('Running comprehensive seed data integrity checks...');

  // 1. Expected seed-order count
  const seedOrderCount = await prismaClient.order.count({
    where: { id: { startsWith: 'order-seed-' } }
  });
  if (seedOrderCount < 50000) {
    throw new Error(`Seed integrity failure: Found ${seedOrderCount} seed orders, expected at least 50000`);
  }

  // 2. Orders without items
  const ordersWithoutItems = await prismaClient.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT COUNT(*) as count FROM orders o
    WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);
  `);
  const missingItemsCount = Number(ordersWithoutItems[0]?.count ?? 0n);
  if (missingItemsCount > 0) {
    throw new Error(`Seed integrity failure: Found ${missingItemsCount} orders with zero order items`);
  }

  // 3. Item counts outside permitted range (1 to 5)
  const itemRangeCheck = await prismaClient.$queryRawUnsafe<Array<{ invalid_count: bigint; min_items: number; max_items: number }>>(`
    WITH order_counts AS (
      SELECT order_id, COUNT(*) as cnt
      FROM order_items
      GROUP BY order_id
    )
    SELECT
      COUNT(*) FILTER (WHERE cnt < 1 OR cnt > 5) as invalid_count,
      MIN(cnt) as min_items,
      MAX(cnt) as max_items
    FROM order_counts;
  `);
  const invalidItemCounts = Number(itemRangeCheck[0]?.invalid_count ?? 0n);
  if (invalidItemCounts > 0) {
    throw new Error(
      `Seed integrity failure: Found ${invalidItemCounts} orders with item counts outside the [1..5] range (min: ${itemRangeCheck[0]?.min_items}, max: ${itemRangeCheck[0]?.max_items})`
    );
  }

  // 4. Any mismatch between order amounts and calculated item totals
  const amountMismatches = await prismaClient.$queryRawUnsafe<Array<{ count: bigint }>>(`
    WITH item_sums AS (
      SELECT order_id, SUM(unit_price * quantity) as calculated_total
      FROM order_items
      GROUP BY order_id
    )
    SELECT COUNT(*) as count
    FROM orders o
    JOIN item_sums s ON s.order_id = o.id
    WHERE o.amount != s.calculated_total;
  `);
  const mismatchCount = Number(amountMismatches[0]?.count ?? 0n);
  if (mismatchCount > 0) {
    throw new Error(`Seed integrity failure: Found ${mismatchCount} orders where amount does not match sum of items`);
  }

  const totalOrders = await prismaClient.order.count();
  const totalItems = await prismaClient.orderItem.count();
  console.log(`Seed integrity verified successfully:`);
  console.log(`- Seed orders count: ${seedOrderCount} (Total orders: ${totalOrders})`);
  console.log(`- Total order items: ${totalItems}`);
  console.log(`- Item counts per order: exactly [1..5] (min: ${itemRangeCheck[0]?.min_items}, max: ${itemRangeCheck[0]?.max_items})`);
  console.log(`- Orders missing items: 0`);
  console.log(`- Amount discrepancies: 0`);
}

export async function main() {
  console.log('--- Starting Seed Script ---');
  const startTime = Date.now();

  // Safety Gate: Positively verify DATABASE_URL and connected database
  const target = verifySeedTargetDatabase();
  await verifyLiveTargetConnection(prisma, target.database);
  console.log(`Target verified: local PostgreSQL database "${target.database}" on ${target.host}:${target.port}`);

  // 1. Seed Users (Admin & Agent)
  const salt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('Admin@123456', salt);
  const agentPasswordHash = await bcrypt.hash('Agent@123456', salt);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ordersconsole.com' },
    update: {},
    create: {
      id: 'user-admin-seed-01',
      email: 'admin@ordersconsole.com',
      passwordHash: adminPasswordHash,
      role: UserRole.ADMIN
    }
  });

  const agentUser = await prisma.user.upsert({
    where: { email: 'agent@ordersconsole.com' },
    update: {},
    create: {
      id: 'user-agent-seed-01',
      email: 'agent@ordersconsole.com',
      passwordHash: agentPasswordHash,
      role: UserRole.AGENT
    }
  });

  console.log(`Users seeded/verified: Admin (${adminUser.email}), Agent (${agentUser.email})`);

  // 2. Check existing seed orders count
  const existingCount = await prisma.order.count({
    where: { id: { startsWith: 'order-seed-' } }
  });

  if (existingCount >= 50000) {
    console.log(`Seed orders already present (${existingCount} orders).`);
    await validateSeedIntegrity(prisma);
    return;
  }

  const TOTAL_ORDERS = 50000;
  const BATCH_SIZE = 2500;
  const now = Date.now();
  const assignedUsers = [adminUser.id, agentUser.id];

  console.log(`Generating and inserting ${TOTAL_ORDERS} orders in transaction batches of ${BATCH_SIZE}...`);

  for (let batchStart = 1; batchStart <= TOTAL_ORDERS; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, TOTAL_ORDERS);
    const orderBatch: Prisma.OrderCreateManyInput[] = [];
    const itemBatch: Prisma.OrderItemCreateManyInput[] = [];

    for (let i = batchStart; i <= batchEnd; i++) {
      const orderId = `order-seed-${String(i).padStart(5, '0')}`;
      const fn = FIRST_NAMES[(i * 3) % FIRST_NAMES.length];
      const ln = LAST_NAMES[(i * 7) % LAST_NAMES.length];
      const customerName = `${fn} ${ln}`;
      const emailDomain = (i % 3 === 0) ? 'example.com' : (i % 3 === 1) ? 'sarh.com' : 'partner.org';
      const cleanLn = ln.toLowerCase().replace(/[^a-z]/g, '');
      const customerEmail = `${fn.toLowerCase()}.${cleanLn}.${i}@${emailDomain}`;

      const status = STATUS_WEIGHTS[i % STATUS_WEIGHTS.length];
      const userId = assignedUsers[i % assignedUsers.length];

      // Time spread: over past 180 days
      const createdAt = new Date(now - (TOTAL_ORDERS - i) * 311040);

      // 1 to 5 items per order
      const itemCount = ((i % 5) + 1);
      let orderTotalCents = 0;

      for (let j = 1; j <= itemCount; j++) {
        const itemId = `item-seed-${String(i).padStart(5, '0')}-${j}`;
        const prod = PRODUCTS[(i * 5 + j) % PRODUCTS.length];
        const quantity = ((i + j) % 4) + 1; // 1 to 4 units
        const unitPriceCents = prod.unitPriceCents;
        const subtotalCents = quantity * unitPriceCents;
        orderTotalCents += subtotalCents;

        const unitPriceStr = `${Math.floor(unitPriceCents / 100)}.${String(unitPriceCents % 100).padStart(2, '0')}`;

        itemBatch.push({
          id: itemId,
          orderId: orderId,
          productName: prod.name,
          quantity: quantity,
          unitPrice: new Prisma.Decimal(unitPriceStr),
          createdAt: createdAt
        });
      }

      const totalAmountStr = `${Math.floor(orderTotalCents / 100)}.${String(orderTotalCents % 100).padStart(2, '0')}`;

      orderBatch.push({
        id: orderId,
        orderNumber: i,
        customerName: customerName,
        customerEmail: customerEmail,
        status: status,
        amount: new Prisma.Decimal(totalAmountStr),
        userId: userId,
        idempotencyKey: null,
        requestHash: null,
        createdAt: createdAt,
        updatedAt: createdAt
      });
    }

    // Atomic transaction per batch
    await prisma.$transaction(async (tx) => {
      await tx.order.createMany({
        data: orderBatch,
        skipDuplicates: true
      });

      await tx.orderItem.createMany({
        data: itemBatch,
        skipDuplicates: true
      });
    });

    process.stdout.write(`Inserted orders ${batchStart}..${batchEnd} (${((batchEnd / TOTAL_ORDERS) * 100).toFixed(0)}%)\r`);
  }

  console.log(`\nAll ${TOTAL_ORDERS} orders and items inserted successfully!`);

  // Sync sequence for future auto-increment order numbers via queryRawUnsafe (statement that returns rows)
  await prisma.$queryRawUnsafe(
    "SELECT setval('orders_order_number_seq', (SELECT COALESCE(MAX(order_number), 1) FROM orders));"
  );

  await validateSeedIntegrity(prisma);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`Seeding completed in ${durationSec} seconds.`);
}

async function run() {
  try {
    await main();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Seed execution aborted with error:', msg);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

run();