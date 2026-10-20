import assert from 'assert';
import { ConsultationService } from '../../src/services/consultationService';
import { ConsultationRecord } from '../../src/repositories/consultationRepository';
import { TokenPayload } from '../../src/utils/jwt';

export async function runStateMachineTests(): Promise<void> {
  console.log('  [TEST] Running Consultation State Machine Validation tests...');

  // Mock repository with configurable consultation state
  let currentStatus: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' = 'SCHEDULED';
  let capturedStatus: string = '';

  const mockRepo = {
    async findById(): Promise<ConsultationRecord | null> {
      return {
        id: 'c1111111-2222-3333-4444-555555555555',
        patient_id: 'p1111111-2222-3333-4444-555555555555',
        doctor_id: 'd1111111-2222-3333-4444-555555555555',
        doctor_user_id: 'u1111111-2222-3333-4444-555555555555',
        slot_id: 's1111111-2222-3333-4444-555555555555',
        status: currentStatus,
        notes: null,
        scheduled_at: new Date(),
        completed_at: null,
        created_at: new Date(),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async updateStatus(_id: string, status: any): Promise<ConsultationRecord> {
      capturedStatus = status;
      currentStatus = status;
      return (await this.findById())!;
    },
  };

  const mockAudit = {
    async log(): Promise<void> {},
    async persistDirect(): Promise<void> {},
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ConsultationService(mockRepo as any, mockAudit as any);
  const doctorUser: TokenPayload = {
    sub: 'u1111111-2222-3333-4444-555555555555',
    email: 'doctor@telemedicine.internal',
    role: 'DOCTOR',
    mfa_enabled: true,
    type: 'access',
  };

  // 1. Valid: SCHEDULED -> IN_PROGRESS
  currentStatus = 'SCHEDULED';
  await service.updateConsultationStatus('c1', 'IN_PROGRESS', 'Doctor initiated consultation', doctorUser, {});
  assert.strictEqual(capturedStatus, 'IN_PROGRESS', 'Transition SCHEDULED -> IN_PROGRESS must succeed');

  // 2. Valid: IN_PROGRESS -> COMPLETED
  currentStatus = 'IN_PROGRESS';
  await service.updateConsultationStatus('c1', 'COMPLETED', 'Consultation finished successfully', doctorUser, {});
  assert.strictEqual(capturedStatus, 'COMPLETED', 'Transition IN_PROGRESS -> COMPLETED must succeed');

  // 3. Illegal Jump: SCHEDULED -> COMPLETED
  currentStatus = 'SCHEDULED';
  await assert.rejects(
    () => service.updateConsultationStatus('c1', 'COMPLETED', undefined, doctorUser, {}),
    /Invalid state transition: Cannot jump directly from 'SCHEDULED' to 'COMPLETED'/i,
    'Direct skip from SCHEDULED to COMPLETED must be rejected'
  );

  // 4. Terminal State: Cannot mutate COMPLETED
  currentStatus = 'COMPLETED';
  await assert.rejects(
    () => service.updateConsultationStatus('c1', 'IN_PROGRESS', undefined, doctorUser, {}),
    /Consultation is in terminal state 'COMPLETED'/i,
    'Mutations on COMPLETED consultation must be rejected'
  );

  // 5. Terminal State: Cannot mutate CANCELLED
  currentStatus = 'CANCELLED';
  await assert.rejects(
    () => service.updateConsultationStatus('c1', 'IN_PROGRESS', undefined, doctorUser, {}),
    /Consultation is in terminal state 'CANCELLED'/i,
    'Mutations on CANCELLED consultation must be rejected'
  );

  console.log('  [PASS] Consultation State Machine tests passed (5/5 assertions)');
}
