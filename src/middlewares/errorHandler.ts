import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface AppError extends Error {
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // 1. Handle Zod Validation Errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // 2. Handle PostgreSQL Lock Not Available (55P03)
  const pgError = err as unknown as { code?: string };
  if (pgError.code === '55P03') {
    res.status(409).json({
      error: 'Conflict: Slot is currently locked by another concurrent booking request. Please try again.',
    });
    return;
  }

  // 3. Operational Application Errors with defined status code
  const statusCode = err.statusCode || 500;
  const isClientError = statusCode >= 400 && statusCode < 500;

  if (isClientError) {
    logger.warn({ err, path: req.path, method: req.method }, 'Client operational error');
    res.status(statusCode).json({
      error: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
    return;
  }

  // 4. Unexpected Server Error (500)
  logger.error(
    { err, path: req.path, method: req.method, stack: err.stack },
    'Unhandled server error'
  );

  res.status(500).json({
    error: 'Internal server error',
    ...(env.NODE_ENV === 'development' ? { message: err.message, stack: err.stack } : {}),
  });
}
