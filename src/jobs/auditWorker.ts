import { Worker } from 'bullmq';
import { bullRedisConnection } from './queue';
import { auditService, AuditLogData } from '../services/auditService';
import { logger } from '../config/logger';

/**
 * BullMQ Worker consuming audit log queue jobs and persisting them to partitioned audit_logs table.
 */
export function startAuditWorker(): Worker {
  const worker = new Worker(
    'audit-log-queue',
    async (job) => {
      const data = job.data as AuditLogData;
      await auditService.persistDirect(data);
    },
    { connection: bullRedisConnection }
  );

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Audit log worker failed to persist entry');
  });

  return worker;
}
