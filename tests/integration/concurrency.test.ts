import assert from 'assert';
import crypto from 'crypto';
import { query } from '../../src/config/database';
import { bookingRepository } from '../../src/repositories/bookingRepository';

/**
 * Concurrency Test proving ZERO DOUBLE-BOOKING under high load.
 * Simulates 50 patients concurrently competing for the exact same consultation slot.
 */
export async function runConcurrencyTests(): Promise<void> {
  console.log('  [TEST] Running High-Concurrency Race Condition test (50 concurrent requests competing for 1 slot)...');

  const testId = crypto.randomUUID().slice(0, 8);
  const doctorEmail = `doc_race_${testId}@telemedicine.internal`;

  // 1. Setup Doctor fixture
  const docUserRes = await query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, 'hash_placeholder', 'DOCTOR')
     RETURNING id;`,
    [doctorEmail]
  );
  const doctorUserId = docUserRes.rows[0].id;

  const docRes = await query<{ id: string }>(
    `INSERT INTO doctors (user_id, specialization, experience_years, consultation_fee, license_number, language)
     VALUES ($1, 'Cardiology', 10, 500.00, $2, 'English')
     RETURNING id;`,
    [doctorUserId, `LIC-RACE-${testId}`]
  );
  const doctorId = docRes.rows[0].id;

  // 2. Setup 50 Patient fixtures
  const patientIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    const patientEmail = `patient_race_${testId}_${i}@telemedicine.internal`;
    const pRes = await query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, 'hash_placeholder', 'PATIENT')
       RETURNING id;`,
      [patientEmail]
    );
    patientIds.push(pRes.rows[0].id);
  }

  // 3. Setup single test Availability Slot
  const startTime = new Date(Date.now() + 86400000); // 24 hours in future
  const endTime = new Date(startTime.getTime() + 1800000); // 30 minutes duration

  const slotRes = await query<{ id: string }>(
    `INSERT INTO availability_slots (doctor_id, start_time, end_time, status)
     VALUES ($1, $2, $3, 'AVAILABLE')
     RETURNING id;`,
    [doctorId, startTime, endTime]
  );
  const slotId = slotRes.rows[0].id;

  // 4. Execute 50 concurrent reservation requests targeting the EXACT SAME slot simultaneously
  const requests = patientIds.map((patientId) => {
    const idempKey = `race-${patientId}`;
    return bookingRepository.reserveSlot(slotId, patientId, idempKey);
  });

  const results = await Promise.allSettled(requests);

  // 5. Assert concurrency mechanics: Exactly 1 Winner, Exactly 49 Rejected
  const succeeded = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');

  assert.strictEqual(
    succeeded.length,
    1,
    `CRITICAL CONCURRENCY FAILURE: Exactly 1 reservation must succeed, but got ${succeeded.length}`
  );
  assert.strictEqual(
    rejected.length,
    49,
    `CRITICAL CONCURRENCY FAILURE: Exactly 49 requests must be rejected, but got ${rejected.length}`
  );

  // 6. Verify database state: Slot is locked by the winning patient with 10-minute lease
  const slotCheck = await query<{ status: string; locked_by_patient_id: string }>(
    `SELECT status, locked_by_patient_id FROM availability_slots WHERE id = $1;`,
    [slotId]
  );
  assert.strictEqual(slotCheck.rows[0].status, 'LOCKED', 'Slot status in database must be LOCKED');
  assert.ok(
    patientIds.includes(slotCheck.rows[0].locked_by_patient_id),
    'Slot must be leased to one of the valid competing patients'
  );

  // 7. Clean up test fixtures
  await query(`DELETE FROM payments WHERE slot_id = $1;`, [slotId]);
  await query(`DELETE FROM availability_slots WHERE id = $1;`, [slotId]);
  await query(`DELETE FROM doctors WHERE id = $1;`, [doctorId]);
  await query(`DELETE FROM users WHERE id = $1 OR id = ANY($2);`, [doctorUserId, patientIds]);

  console.log('  [PASS] Zero Double-Booking proven: 1 succeeded, 49 rejected (100% concurrency safety)');
}
