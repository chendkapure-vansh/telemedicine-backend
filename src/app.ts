import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';
import { pool } from './config/database';
import { redis } from './config/redis';
import { authRouter } from './routes/authRoutes';
import { profileRouter } from './routes/profileRoutes';

export function createApp(): Application {
  const app = express();

  // 1. Security & Parsing Middlewares
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);

  // 2. Liveness Probe (Does not hit database or external services)
  app.get('/health/live', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // 3. Readiness Probe (Checks active database and redis connectivity)
  app.get('/health/ready', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dbStart = Date.now();
      await pool.query('SELECT 1');
      const dbLatencyMs = Date.now() - dbStart;

      const redisStart = Date.now();
      const redisPong = await redis.ping();
      const redisLatencyMs = Date.now() - redisStart;

      if (redisPong !== 'PONG') {
        throw new Error('Redis ping response was not PONG');
      }

      res.status(200).json({
        status: 'ready',
        database: { status: 'connected', latencyMs: dbLatencyMs },
        redis: { status: 'connected', latencyMs: redisLatencyMs },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. API Endpoints
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', profileRouter);

  // 5. 404 Handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  // 5. Global Centralized Error Handler
  app.use(errorHandler);

  return app;
}
