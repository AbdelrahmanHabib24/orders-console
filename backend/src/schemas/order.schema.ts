import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const getOrdersQuerySchema = z.object({
  page: z
    .preprocess(
      (val) => (val === undefined || val === '' ? 1 : Number(val)),
      z.number().int('Page must be an integer').min(1, 'Page must be at least 1')
    )
    .default(1),
  limit: z
    .preprocess(
      (val) => (val === undefined || val === '' ? 20 : Number(val)),
      z.number().int('Limit must be an integer').min(1, 'Limit must be at least 1').max(50, 'Limit cannot exceed 50')
    )
    .default(20),
  search: z
    .string()
    .trim()
    .max(100, 'Search term cannot exceed 100 characters')
    .optional()
    .transform((val) => (val && val.length > 0 ? val : undefined)),
  status: z
    .nativeEnum(OrderStatus, {
      message: 'Invalid order status'
    })
    .optional(),
  sortBy: z
    .enum(['createdAt', 'amount'], {
      message: 'Invalid sort field: must be createdAt or amount'
    })
    .default('createdAt'),
  sortOrder: z
    .enum(['asc', 'desc'], {
      message: 'Invalid sort order: must be asc or desc'
    })
    .default('desc')
});

export type GetOrdersQuery = z.infer<typeof getOrdersQuerySchema>;

export const orderItemInputSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, 'Product name is required')
    .max(100, 'Product name cannot exceed 100 characters'),
  quantity: z
    .number()
    .int('Quantity must be an integer')
    .min(1, 'Quantity must be at least 1')
    .max(1000, 'Quantity cannot exceed 1000'),
  unitPrice: z
    .number()
    .positive('Unit price must be greater than zero')
    .max(100000, 'Unit price cannot exceed 100,000')
});

export const createOrderBodySchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(1, 'Customer name is required')
      .max(100, 'Customer name cannot exceed 100 characters'),
    customerEmail: z
      .string()
      .trim()
      .email('Invalid customer email address')
      .max(100, 'Customer email cannot exceed 100 characters'),
    amount: z
      .number()
      .positive('Total amount must be greater than zero')
      .max(1000000, 'Total amount cannot exceed 1,000,000'),
    items: z
      .array(orderItemInputSchema)
      .min(1, 'Order must contain at least 1 line item')
      .max(10, 'Order cannot contain more than 10 line items')
  })
  .refine(
    (data) => {
      // Decimal-safe comparison in integer cents
      const calculatedCents = data.items.reduce((sum, item) => {
        const itemCents = Math.round(item.unitPrice * 100) * item.quantity;
        return sum + itemCents;
      }, 0);
      const submittedCents = Math.round(data.amount * 100);
      return calculatedCents === submittedCents;
    },
    {
      message: 'Order total amount does not match the sum of item line totals',
      path: ['amount']
    }
  );

export const idempotencyKeyHeaderSchema = z
  .string()
  .trim()
  .min(1, 'Idempotency-Key header is required and cannot be empty')
  .max(128, 'Idempotency-Key header cannot exceed 128 characters');

export type CreateOrderInput = z.infer<typeof createOrderBodySchema>;
