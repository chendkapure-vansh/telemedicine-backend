import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';

/**
 * Request logger middleware providing correlated structured logging with trace ID propagation.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const traceId =
    (req.headers['x-request-id'] as string) ||
    (req.headers['traceparent'] as string) ||
    crypto.randomUUID();

  res.setHeader('X-Request-Id', traceId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    const logData = {
      traceId,
      method,
      url: originalUrl,
      status: statusCode,
      durationMs: duration,
      ip,
    };

    if (statusCode >= 500) {
      logger.error(logData, 'HTTP Request Failed');
    } else if (statusCode >= 400) {
      logger.warn(logData, 'HTTP Request Warning');
    } else {
      logger.info(logData, 'HTTP Request Completed');
    }
  });

  next();
}

