import { Router, Request, Response } from 'express';
import { loginSchema } from '../schemas/auth.schema.js';
import {
  AUTH_COOKIE_NAME,
  authenticateCredentials,
  getUserProfile,
  getAuthCookieOptions,
  getClearCookieOptions
} from '../services/auth.service.js';
import { authenticateToken } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', async (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Validation failed',
      details: parseResult.error.flatten().fieldErrors
    });
  }

  const result = await authenticateCredentials(parseResult.data);
  if (!result) {
    // Generic message to prevent user enumeration
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid email or password'
    });
  }

  // Set HttpOnly cookie - token is never included in JSON body
  res.cookie(AUTH_COOKIE_NAME, result.token, getAuthCookieOptions());

  return res.status(200).json({
    user: result.user
  });
});

// GET /api/auth/me
authRouter.get('/me', authenticateToken, async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required'
    });
  }

  const user = await getUserProfile(req.user.id);
  if (!user) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'User account not found'
    });
  }

  return res.status(200).json({
    user
  });
});

// POST /api/auth/logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, getClearCookieOptions());
  return res.status(200).json({
    message: 'Logged out successfully'
  });
});