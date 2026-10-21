import { Request, Response, NextFunction } from 'express';
import { ALLOWED_ORIGINS } from '../config.js';

export function createOriginGuard(allowedOrigins = ALLOWED_ORIGINS) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only GET is exempt
    if (req.method === 'GET') {
      return next();
    }

    const origin = req.headers.origin;

    if (!origin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Missing Origin header on non-GET request'
      });
    }

    if (!allowedOrigins.includes(origin)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Untrusted Origin'
      });
    }

    return next();
  };
}

export const originGuard = createOriginGuard();