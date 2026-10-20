import express, { Request, Response } from 'express';
import { PORT } from './config.js';

const app = express();

app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'orders-console-backend'
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log('Orders Console Backend listening on port ' + PORT);
  });
}

export default app;
