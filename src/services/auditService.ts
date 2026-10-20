import { auditQueue } from '../jobs/queue';
import { query } from '../config/database';
import { logger } from '../config/logger';

/**
 * Audit log entry data structure.
 */
export interface AuditLogData {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Service for immutable compliance and security audit trail persistence.
 * Asynchronously queues audit events to BullMQ with direct database fallback.
 */
export class AuditService {
  /**
   * Records a security or compliance event in the audit trail.
   *
   * @param data - Audit event metadata
   */
  async log(data: AuditLogData): Promise<void> {
    try {
      await auditQueue.add('record-audit-log', data);
    } catch (queueErr) {
      logger.warn(
        { err: queueErr, action: data.action },
        'Audit queue unavailable, falling back to direct database insertion'
      );
      await this.persistDirect(data);
    }
  }

  /**
   * Directly persists an audit log record into the partitioned audit_logs table.
   *
   * @param data - Audit event metadata
   */
  async persistDirect(data: AuditLogData): Promise<void> {
    try {
      const sql = `
        INSERT INTO audit_logs (
          user_id,
          action,
          resource_type,
          resource_id,
          ip_address,
          user_agent,
          metadata,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, now());
      `;

      await query(sql, [
        data.userId || null,
        data.action,
        data.resourceType,
        data.resourceId || null,
        data.ipAddress || null,
        data.userAgent || null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ]);
    } catch (err) {
      logger.error({ err, data }, 'Failed to write immutable audit log');
    }
  }
}

export const auditService = new AuditService();
