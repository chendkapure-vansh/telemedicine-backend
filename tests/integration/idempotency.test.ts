import assert from 'assert';
import crypto from 'crypto';
import { query } from '../../src/config/database';

export async function runIdempotencyTests(): Promise<void> {
  console.log('  [TEST] Running Write Idempotency Integration tests...');

  const testKey = `test-idemp-${crypto.randomUUID()}`;
  const userId = crypto.randomUUID();
  const requestHash = crypto.createHash('sha256').update('POST:/api/v1/test:payload').digest('hex');
  const sampleResponse = { status: 'success', reservation_id: crypto.randomUUID() };

  // 1. Initial write creates IN_PROGRESS key
  await query(
    `INSERT INTO idempotency_keys (key, user_id, request_hash, status, expires_at)
     VALUES ($1, $2, $3, 'IN_PROGRESS', now() + INTERVAL '24 hours');`,
    [testKey, userId, requestHash]
  );

  const pendingCheck = await query<{ status: string }>(
    `SELECT status FROM idempotency_keys WHERE key = $1;`,
    [testKey]
  );
  assert.strictEqual(pendingCheck.rows[0].status, 'IN_PROGRESS', 'Initial key status must be IN_PROGRESS');

  // 2. Transition key to COMPLETED with cached response body
  await query(
    `UPDATE idempotency_keys
     SET status = 'COMPLETED',
         status_code = 201,
         response_body = $1
     WHERE key = $2;`,
    [JSON.stringify(sampleResponse), testKey]
  );

  // 3. Replay assertion: Key lookup returns cached response
  const replayRes = await query<{ status: string; status_code: number; response_body: typeof sampleResponse }>(
    `SELECT status, status_code, response_body FROM idempotency_keys WHERE key = $1;`,
    [testKey]
  );
  assert.strictEqual(replayRes.rows[0].status, 'COMPLETED', 'Completed key must have status COMPLETED');
  assert.strictEqual(replayRes.rows[0].status_code, 201, 'Cached status code must match 201');
  assert.deepStrictEqual(replayRes.rows[0].response_body, sampleResponse, 'Replay body must match cached response');

  // 4. Clean up test key
  await query(`DELETE FROM idempotency_keys WHERE key = $1;`, [testKey]);

  console.log('  [PASS] Write Idempotency tests passed (4/4 assertions)');
}
