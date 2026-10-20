import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { requestLogger } from './middlewares/requestLogger';
import { errorHandler } from './middlewares/errorHandler';
import { pool } from './config/database';
import { redis } from './config/redis';
import { authRouter } from './routes/authRoutes';
import { profileRouter } from './routes/profileRoutes';
import { slotRouter } from './routes/slotRoutes';
import { doctorRouter } from './routes/doctorRoutes';
import { bookingRouter } from './routes/bookingRoutes';
import { consultationRouter } from './routes/consultationRoutes';
import { prescriptionRouter } from './routes/prescriptionRoutes';
import { adminRouter } from './routes/adminRoutes';
import { register } from './config/metrics';
import { metricsMiddleware } from './middlewares/metricsMiddleware';
import { apiRateLimiter } from './middlewares/rateLimiter';

export function createApp(): Application {
  const app = express();

  // 1. Security & Parsing Middlewares
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(metricsMiddleware);

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

  // 4. Prometheus Metrics Scrape Endpoint
  app.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.setHeader('Content-Type', register.contentType);
      res.send(await register.metrics());
    } catch (err) {
      next(err);
    }
  });

  // 5. Global API Rate Limiter
  app.use(apiRateLimiter);

  // 6. API Endpoints
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1', profileRouter);
  app.use('/api/v1', slotRouter);
  app.use('/api/v1', doctorRouter);
  app.use('/api/v1', bookingRouter);
  app.use('/api/v1', consultationRouter);
  app.use('/api/v1', prescriptionRouter);
  app.use('/api/v1', adminRouter);





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
