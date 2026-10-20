import { query } from '../config/database';

/**
 * Consultation record entity including resolved doctor user ID.
 */
export interface ConsultationRecord {
  id: string;
  patient_id: string;
  doctor_id: string;
  doctor_user_id: string;
  slot_id: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  scheduled_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

/**
 * Repository layer managing consultation domain queries and state transitions.
 */
export class ConsultationRepository {
  /**
   * Retrieves consultation details by UUID, joining doctor record to resolve practitioner identity.
   *
   * @param id - Consultation UUID
   * @returns Consultation record or null
   */
  async findById(id: string): Promise<ConsultationRecord | null> {
    const sql = `
      SELECT
        c.id,
        c.patient_id,
        c.doctor_id,
        d.user_id AS doctor_user_id,
        c.slot_id,
        c.status,
        c.notes,
        c.scheduled_at,
        c.completed_at,
        c.created_at
      FROM consultations c
      JOIN doctors d ON c.doctor_id = d.id
      WHERE c.id = $1;
    `;
    const res = await query<ConsultationRecord>(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Updates consultation status and encrypted clinical notes.
   *
   * @param id - Consultation UUID
   * @param status - Target status
   * @param encryptedNotes - AES-256-GCM encrypted notes or null
   * @returns Updated consultation record
   */
  async updateStatus(
    id: string,
    status: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    encryptedNotes: string | null
  ): Promise<ConsultationRecord> {
    const sql = `
      UPDATE consultations
      SET status = $1,
          notes = COALESCE($2, notes),
          completed_at = CASE WHEN $1 = 'COMPLETED' THEN now() ELSE completed_at END
      WHERE id = $3
      RETURNING *;
    `;
    const res = await query<ConsultationRecord>(sql, [status, encryptedNotes, id]);
    return res.rows[0];
  }
}

export const consultationRepository = new ConsultationRepository();
