import { Request, Response, NextFunction } from 'express';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../config/metrics';

/**
 * Express middleware collecting Prometheus latency and count metrics for incoming HTTP requests.
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Exclude /metrics itself to prevent metric recursion
  if (req.path === '/metrics') {
    next();
    return;
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;

    const route = req.route?.path
      ? `${req.baseUrl || ''}${req.route.path}`
      : req.baseUrl + req.path || req.path;

    const labels = {
      method: req.method,
      route,
      status_code: res.statusCode,
    };

    httpRequestDurationSeconds.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  next();
}
