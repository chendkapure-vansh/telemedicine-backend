import rateLimit from 'express-rate-limit';

/**
 * Global rate limiter protecting general API endpoints.
 * Limits each IP to 100 requests per 15-minute window.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too Many Requests',
    message: 'Too many requests from this IP address, please try again after 15 minutes',
  },
  skip: (req) => {
    // Exempt health probes and prometheus scrape endpoints
    return (
      req.path === '/health/live' ||
      req.path === '/health/ready' ||
      req.path === '/metrics'
    );
  },
});

/**
 * Strict rate limiter protecting authentication endpoints (/login, /register).
 * Limits each IP to 10 requests per 15-minute window to block credential stuffing.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 auth requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Too many authentication attempts from this IP, please try again after 15 minutes',
  },
});
