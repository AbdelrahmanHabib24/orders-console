import express, { Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { PORT, NODE_ENV } from './config.js';
import { originGuard } from './middleware/originGuard.js';
import { authRouter } from './routes/auth.routes.js';
import { orderRouter } from './routes/order.routes.js';

const app = express();

app.use(express.json());
app.use(cookieParser());

// Enforce Origin policy on all non-GET requests
app.use(originGuard);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'orders-console-backend'
  });
});

// Authentication routes
app.use('/api/auth', authRouter);

// Orders routes (Phase 3: Admin-only deletion endpoint)
app.use('/api/orders', orderRouter);

const isTestMode = NODE_ENV === 'test' || process.argv.some((arg) => arg.includes('test'));

if (!isTestMode) {
  app.listen(PORT, () => {
    console.log('Orders Console Backend listening on port ' + PORT);
  });
}

export default app;