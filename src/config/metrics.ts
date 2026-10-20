import client from 'prom-client';

/**
 * Prometheus metrics registry.
 */
export const register = new client.Registry();

// Collect standard Node.js process and memory runtime metrics
client.collectDefaultMetrics({ register });

/**
 * Histogram measuring HTTP request duration across methods, routes, and status codes.
 */
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [register],
});

/**
 * Counter tracking total HTTP requests processed.
 */
export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Counter tracking consultation state machine transitions.
 */
export const consultationsTotal = new client.Counter({
  name: 'consultations_total',
  help: 'Total number of consultation state transitions',
  labelNames: ['status'],
  registers: [register],
});
