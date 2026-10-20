import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { query } from '../config/database';
import { logger } from '../config/logger';

interface IdempotencyRow {
  key: string;
  user_id: string | null;
  request_hash: string;
  status_code: number | null;
  response_body: unknown;
  status: 'IN_PROGRESS' | 'COMPLETED';
  expires_at: Date;
}

/**
 * Middleware ensuring write idempotency for critical mutations (e.g. bookings and payments).
 * Intercepts requests bearing the Idempotency-Key header and returns cached replay responses.
 */
export function idempotencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

  if (!idempotencyKey) {
    res.status(400).json({
      error: 'Missing required Idempotency-Key header for this operation',
    });
    return;
  }

  const userId = req.user?.sub || null;
  const requestPayload = JSON.stringify(req.body || {});
  const requestHash = crypto
    .createHash('sha256')
    .update(`${req.method}:${req.baseUrl + req.path}:${userId || ''}:${requestPayload}`)
    .digest('hex');

  void (async () => {
    try {
      const checkSql = `
        SELECT *
        FROM idempotency_keys
        WHERE key = $1;
      `;
      const existing = await query<IdempotencyRow>(checkSql, [idempotencyKey]);

      if (existing.rows.length > 0) {
        const record = existing.rows[0];

        // If key expired, remove it and allow re-execution
        if (new Date(record.expires_at) < new Date()) {
          await query('DELETE FROM idempotency_keys WHERE key = $1;', [idempotencyKey]);
        } else if (record.status === 'COMPLETED') {
          // Replay cached response
          res.setHeader('X-Cache-Lookup', 'HIT');
          res.status(record.status_code || 200).json(record.response_body);
          return;
        } else if (record.status === 'IN_PROGRESS') {
          res.status(409).json({
            error: 'Conflict: A request with this Idempotency-Key is currently in progress',
          });
          return;
        }
      }

      // Record key as IN_PROGRESS
      const insertSql = `
        INSERT INTO idempotency_keys (key, user_id, request_hash, status, expires_at)
        VALUES ($1, $2, $3, 'IN_PROGRESS', now() + INTERVAL '24 hours')
        ON CONFLICT (key) DO UPDATE SET
          request_hash = EXCLUDED.request_hash,
          status = 'IN_PROGRESS',
          expires_at = now() + INTERVAL '24 hours'
        WHERE idempotency_keys.expires_at < now();
      `;
      await query(insertSql, [idempotencyKey, userId, requestHash]);

      // Intercept res.json to capture response payload
      const originalJson = res.json.bind(res);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.json = function (body: any): Response {
        const statusCode = res.statusCode;

        if (statusCode >= 200 && statusCode < 300) {
          const updateSql = `
            UPDATE idempotency_keys
            SET status = 'COMPLETED',
                status_code = $1,
                response_body = $2
            WHERE key = $3;
          `;
          query(updateSql, [statusCode, JSON.stringify(body), idempotencyKey]).catch((err) => {
            logger.error({ err, idempotencyKey }, 'Failed to persist completed idempotency record');
          });
        } else {
          // Clean up key on client/validation error so user can retry with corrected payload
          query('DELETE FROM idempotency_keys WHERE key = $1;', [idempotencyKey]).catch((err) => {
            logger.error({ err, idempotencyKey }, 'Failed to remove aborted idempotency record');
          });
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  })();
}
