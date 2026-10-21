import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import {
  getOrdersQuerySchema,
  createOrderBodySchema,
  idempotencyKeyHeaderSchema
} from '../schemas/order.schema.js';
import {
  getOrders,
  createOrder,
  deleteOrderById,
  IdempotencyConflictError
} from '../services/order.service.js';

export const orderRouter = Router();

// GET /api/orders (Authenticated listing for both ADMIN and AGENT)
orderRouter.get('/', authenticateToken, async (req: Request, res: Response) => {
  const parseResult = getOrdersQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Invalid query parameters',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  try {
    const result = await getOrders(parseResult.data);
    return res.status(200).json(result);
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to retrieve orders'
    });
  }
});

// POST /api/orders (Authenticated order creation with R2 idempotency guarantee)
orderRouter.post('/', authenticateToken, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  // 1. Validate Idempotency-Key header
  const rawIdempotencyKey = req.headers['idempotency-key'];
  const keyParseResult = idempotencyKeyHeaderSchema.safeParse(rawIdempotencyKey);

  if (!keyParseResult.success) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Missing or invalid Idempotency-Key header',
      details: keyParseResult.error.flatten().formErrors
    });
  }

  const idempotencyKey = keyParseResult.data;

  // 2. Validate request body
  const bodyParseResult = createOrderBodySchema.safeParse(req.body);

  if (!bodyParseResult.success) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Invalid order input data',
      details: bodyParseResult.error.flatten().fieldErrors
    });
  }

  // 3. Atomically create or resolve order idempotently
  try {
    const result = await createOrder(req.user.id, idempotencyKey, bodyParseResult.data);

    if (result.isReplay) {
      return res.status(200).json({
        message: 'Order retrieved via idempotent replay',
        order: result.order
      });
    }

    return res.status(201).json({
      message: 'Order created successfully',
      order: result.order
    });
  } catch (err: unknown) {
    if (err instanceof IdempotencyConflictError) {
      return res.status(422).json({
        error: 'UnprocessableEntity',
        message: err.message
      });
    }

    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to create order'
    });
  }
});

// DELETE /api/orders/:id (Admin-only deletion - returns confirmation message only without echoing id)
orderRouter.delete('/:id', authenticateToken, requireRole(UserRole.ADMIN), async (req: Request, res: Response) => {
  const id = String(req.params.id);

  try {
    const deleted = await deleteOrderById(id);
    if (!deleted) {
      return res.status(404).json({
        error: 'NotFound',
        message: 'Order not found'
      });
    }

    return res.status(200).json({
      message: 'Order deleted successfully'
    });
  } catch (err: unknown) {
    return res.status(500).json({
      error: 'InternalServerError',
      message: 'Failed to delete order'
    });
  }
});
