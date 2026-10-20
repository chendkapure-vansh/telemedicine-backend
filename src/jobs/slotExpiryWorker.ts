import { Worker } from 'bullmq';
import { bullRedisConnection } from './queue';
import { bookingRepository } from '../repositories/bookingRepository';
import { logger } from '../config/logger';

/**
 * BullMQ Worker processing background slot reservation expiry jobs.
 * Releases abandoned slot holds where locked_until has elapsed.
 */
export function startSlotExpiryWorker(): Worker {
  const worker = new Worker(
    'slot-expiry-queue',
    async (job) => {
      logger.info({ jobId: job.id }, 'Processing slot reservation hold expiry sweep');
      const sweptCount = await bookingRepository.sweepExpiredLocks();
      if (sweptCount > 0) {
        logger.info({ sweptCount }, 'Successfully released expired slot reservation holds');
      }
      return { sweptCount };
    },
    { connection: bullRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Slot reservation expiry job failed');
  });

  return worker;
}
