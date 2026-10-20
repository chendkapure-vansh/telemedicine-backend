import { runCryptoTests } from './unit/crypto.test';
import { runTotpTests } from './unit/totp.test';
import { runJwtTests } from './unit/jwt.test';
import { runStateMachineTests } from './unit/stateMachine.test';
import { runIdempotencyTests } from './integration/idempotency.test';
import { runConcurrencyTests } from './integration/concurrency.test';
import { pool } from '../src/config/database';
import { redisClient } from '../src/config/redis';

async function main(): Promise<void> {
  console.log('\n=============================================================');
  console.log('   Telemedicine Backend System — Automated Test Suite');
  console.log('=============================================================\n');

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Verify infrastructure connectivity for integration tests
  let dbAvailable = false;
  let redisAvailable = false;
  try {
    const client = await pool.connect();
    client.release();
    dbAvailable = true;
  } catch (_e) {
    dbAvailable = false;
  }

  try {
    await redisClient.ping();
    redisAvailable = true;
  } catch (_e) {
    redisAvailable = false;
    try {
      redisClient.disconnect();
    } catch (_ignore) {}
  }

  const testSuites: Array<{ name: string; isIntegration?: boolean; fn: () => Promise<void> }> = [
    { name: 'Unit: AES-256-GCM Field-Level PHI Encryption', fn: runCryptoTests },
    { name: 'Unit: RFC 6238 TOTP Multi-Factor Authentication', fn: runTotpTests },
    { name: 'Unit: JWT HS256 Token Lifecycle & Pinning', fn: runJwtTests },
    { name: 'Unit: Consultation State Machine Lifecycle', fn: runStateMachineTests },
    { name: 'Integration: Write Idempotency & Replay Caching', isIntegration: true, fn: runIdempotencyTests },
    { name: 'Integration: High-Concurrency Zero Double-Booking (50 Clients)', isIntegration: true, fn: runConcurrencyTests },
  ];

  for (const suite of testSuites) {
    if (suite.isIntegration && (!dbAvailable || !redisAvailable)) {
      console.log(`\n⏭ SKIPPED Suite: ${suite.name}`);
      console.log('   ↳ PostgreSQL or Redis is not connected. (Runs in CI environment with live service containers).');
      skipped++;
      continue;
    }

    try {
      console.log(`\n▶ Starting Suite: ${suite.name}`);
      await suite.fn();
      passed++;
    } catch (err) {
      console.error(`\n❌ FAILED Suite: ${suite.name}`);
      console.error(err);
      failed++;
    }
  }

  const durationMs = Date.now() - startTime;

  console.log('\n=============================================================');
  console.log(`   Test Results: ${passed} passed, ${skipped} skipped, ${failed} failed (${(durationMs / 1000).toFixed(2)}s)`);
  console.log('=============================================================\n');

  // Close open pool and redis connections so the process can exit cleanly
  try {
    await pool.end();
    await redisClient.quit();
  } catch (_e) {
    // Ignore teardown errors
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
