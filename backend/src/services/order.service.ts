import crypto from 'node:crypto';
import { Prisma, OrderStatus, Order, OrderItem } from '@prisma/client';
import { prisma } from '../db.js';
import { GetOrdersQuery, CreateOrderInput } from '../schemas/order.schema.js';

export interface OrderListItem {
  id: string;
  orderNumber: number;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  amount: Prisma.Decimal;
  createdAt: Date;
}

export interface OrdersListResult {
  orders: OrderListItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
}

export class IdempotencyConflictError extends Error {
  constructor(message = 'Idempotency key has already been used with a different request payload') {
    super(message);
    this.name = 'IdempotencyConflictError';
  }
}

export interface CreatedOrderResult {
  order: Order & { items: OrderItem[] };
  isReplay: boolean;
}

export function computeRequestHash(input: CreateOrderInput): string {
  const normalized = {
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.toLowerCase().trim(),
    amount: input.amount.toFixed(2),
    items: input.items.map((i) => ({
      productName: i.productName.trim(),
      quantity: i.quantity,
      unitPrice: i.unitPrice.toFixed(2)
    }))
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export async function createOrder(
  userId: string,
  idempotencyKey: string,
  input: CreateOrderInput,
  customPrisma = prisma
): Promise<CreatedOrderResult> {
  const requestHash = computeRequestHash(input);

  try {
    const created = await customPrisma.$transaction(async (tx) => {
      return tx.order.create({
        data: {
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.toLowerCase().trim(),
          status: OrderStatus.PENDING,
          amount: new Prisma.Decimal(input.amount.toFixed(2)),
          userId,
          idempotencyKey,
          requestHash,
          items: {
            create: input.items.map((item) => ({
              productName: item.productName.trim(),
              quantity: item.quantity,
              unitPrice: new Prisma.Decimal(item.unitPrice.toFixed(2))
            }))
          }
        },
        include: {
          items: true
        }
      });
    });

    return {
      order: created,
      isReplay: false
    };
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // Fetch committed order for this (userId, idempotencyKey)
      const existing = await customPrisma.order.findUnique({
        where: {
          userId_idempotencyKey: {
            userId,
            idempotencyKey
          }
        },
        include: {
          items: true
        }
      });

      if (existing) {
        if (existing.requestHash === requestHash) {
          // Idempotent replay: return existing order
          return {
            order: existing,
            isReplay: true
          };
        } else {
          // Conflict: key used with different payload
          throw new IdempotencyConflictError();
        }
      }
    }

    throw err;
  }
}

export async function getOrders(
  query: GetOrdersQuery,
  customPrisma = prisma
): Promise<OrdersListResult> {
  const where: Prisma.OrderWhereInput = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { customerName: { contains: query.search, mode: 'insensitive' } },
      { customerEmail: { contains: query.search, mode: 'insensitive' } }
    ];
  }

  // Primary sort by user-specified field with deterministic secondary sort on id
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = [
    { [query.sortBy]: query.sortOrder },
    { id: 'desc' }
  ];

  const take = Math.min(query.limit, 50);
  const skip = (query.page - 1) * take;

  const [orders, totalCount] = await customPrisma.$transaction([
    customPrisma.order.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        orderNumber: true,
        customerName: true,
        customerEmail: true,
        status: true,
        amount: true,
        createdAt: true
      }
    }),
    customPrisma.order.count({ where })
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / take);

  return {
    orders,
    pagination: {
      page: query.page,
      limit: take,
      totalCount,
      totalPages
    }
  };
}

export async function deleteOrderById(id: string, customPrisma = prisma) {
  const order = await customPrisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    return null;
  }

  await customPrisma.order.delete({
    where: { id }
  });

  return order;
}
