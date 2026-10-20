import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Dedicated Redis connection for BullMQ queues
export const bullRedisConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

// Queue for releasing expired slot reservation locks
export const slotExpiryQueue = new Queue('slot-expiry-queue', {
  connection: bullRedisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: 500,
  },
});

// Queue for asynchronous write of audit logs
export const auditQueue = new Queue('audit-log-queue', {
  connection: bullRedisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 500,
    },
    removeOnComplete: true,
    removeOnFail: 1000,
  },
});

logger.info('BullMQ queues initialized: slot-expiry-queue, audit-log-queue');
