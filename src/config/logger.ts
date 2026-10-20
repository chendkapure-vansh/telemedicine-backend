import pino from 'pino';
import { env } from './env';

// Configure structured JSON logging with ISO timestamps
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'password_hash',
      'mfa_secret',
      'token',
      'medical_history',
      'diagnosis',
      'advice',
    ],
    censor: '[REDACTED]',
  },
});
