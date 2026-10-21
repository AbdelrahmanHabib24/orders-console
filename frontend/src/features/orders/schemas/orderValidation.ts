import { z } from 'zod';

/**
 * Line item schema for order creation form
 */
export const orderItemSchema = z.object({
  id: z.string().optional(),
  productName: z
    .string()
    .trim()
    .min(1, 'Product name is required')
    .max(100, 'Product name cannot exceed 100 characters'),
  quantity: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? NaN : Number(val)),
      z
        .number()
        .int('Quantity must be an integer')
        .min(1, 'Quantity must be at least 1')
        .max(1000, 'Quantity cannot exceed 1,000')
    ),
  unitPrice: z
    .preprocess(
      (val) => (val === '' || val === null || val === undefined ? NaN : Number(val)),
      z
        .number()
        .positive('Unit price must be greater than zero')
        .max(100000, 'Unit price cannot exceed $100,000')
    )
});

/**
 * Complete Create Order form schema matching backend contract
 */
export const createOrderFormSchema = z
  .object({
    customerName: z
      .string()
      .trim()
      .min(1, 'Customer name is required')
      .max(100, 'Customer name cannot exceed 100 characters'),
    customerEmail: z
      .string()
      .trim()
      .min(1, 'Customer email is required')
      .email('Please enter a valid email address ')
      .max(100, 'Customer email cannot exceed 100 characters'),
    items: z
      .array(orderItemSchema)
      .min(1, 'Order must contain at least 1 line item')
      .max(10, 'Order cannot contain more than 10 line items'),
    amount: z
      .number()
      .positive('Total amount must be greater than zero')
      .max(1000000, 'Total amount cannot exceed $1,000,000')
  })
  .refine(
    (data) => {
      // Decimal-safe comparison in integer cents matching backend contract
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

export type CreateOrderFormData = z.infer<typeof createOrderFormSchema>;

/**
 * Filter and search toolbar query schema
 */
export const ordersFilterSchema = z.object({
  search: z
    .string()
    .trim()
    .max(100, 'Search term cannot exceed 100 characters')
    .optional(),
  status: z
    .enum(['PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED'])
    .or(z.literal(''))
    .optional(),
  sortBy: z.enum(['createdAt', 'amount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(50).default(20)
});

export type OrdersFilterData = z.infer<typeof ordersFilterSchema>;

export interface FieldValidationErrors {
  customerName?: string;
  customerEmail?: string;
  items?: Record<number, { productName?: string; quantity?: string; unitPrice?: string }>;
  amount?: string;
  general?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: FieldValidationErrors;
  validatedData?: CreateOrderFormData;
}

/**
 * Helper to validate create order form and extract friendly field errors
 */
export function validateCreateOrderForm(input: {
  customerName: string;
  customerEmail: string;
  items: Array<{ id: string; productName: string; quantity: number | string; unitPrice: number | string }>;
  amount: number;
}): FormValidationResult {
  const result = createOrderFormSchema.safeParse(input);

  if (result.success) {
    return {
      isValid: true,
      errors: {},
      validatedData: result.data
    };
  }

  const errors: FieldValidationErrors = { items: {} };
  let firstErrorMessage = '';

  for (const issue of result.error.issues) {
    const path = issue.path;
    if (!firstErrorMessage) {
      firstErrorMessage = issue.message;
    }

    if (path[0] === 'customerName') {
      errors.customerName = issue.message;
    } else if (path[0] === 'customerEmail') {
      errors.customerEmail = issue.message;
    } else if (path[0] === 'amount') {
      errors.amount = issue.message;
    } else if (path[0] === 'items' && typeof path[1] === 'number') {
      const itemIndex = path[1];
      const field = path[2] as 'productName' | 'quantity' | 'unitPrice';
      if (!errors.items![itemIndex]) {
        errors.items![itemIndex] = {};
      }
      if (field) {
        errors.items![itemIndex][field] = issue.message;
      }
    }
  }

  errors.general = firstErrorMessage || 'Please correct the highlighted form errors';

  return {
    isValid: false,
    errors
  };
}
