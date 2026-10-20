import { query } from '../config/database';

/**
 * Raw prescription record stored in database (contains encrypted PHI).
 */
export interface PrescriptionRecord {
  id: string;
  consultation_id: string;
  doctor_id: string;
  doctor_user_id: string;
  patient_id: string;
  diagnosis: string;
  medicines: string;
  advice: string;
  created_at: Date;
}

/**
 * Repository layer handling encrypted digital prescription records.
 */
export class PrescriptionRepository {
  /**
   * Persists an encrypted digital prescription record.
   *
   * @param consultationId - Consultation UUID
   * @param doctorId - Doctor UUID
   * @param patientId - Patient UUID
   * @param encDiagnosis - AES-256-GCM encrypted diagnosis
   * @param encMedicines - AES-256-GCM encrypted medicines JSON
   * @param encAdvice - AES-256-GCM encrypted advice
   * @returns Newly created PrescriptionRecord
   */
  async createPrescription(
    consultationId: string,
    doctorId: string,
    patientId: string,
    encDiagnosis: string,
    encMedicines: string,
    encAdvice: string
  ): Promise<PrescriptionRecord> {
    const sql = `
      INSERT INTO prescriptions (
        consultation_id,
        doctor_id,
        patient_id,
        diagnosis,
        medicines,
        advice
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const res = await query<PrescriptionRecord>(sql, [
      consultationId,
      doctorId,
      patientId,
      encDiagnosis,
      encMedicines,
      encAdvice,
    ]);
    return res.rows[0];
  }

  /**
   * Retrieves a prescription by UUID with resolved doctor user ID.
   *
   * @param id - Prescription UUID
   * @returns PrescriptionRecord or null
   */
  async findById(id: string): Promise<PrescriptionRecord | null> {
    const sql = `
      SELECT
        p.id,
        p.consultation_id,
        p.doctor_id,
        d.user_id AS doctor_user_id,
        p.patient_id,
        p.diagnosis,
        p.medicines,
        p.advice,
        p.created_at
      FROM prescriptions p
      JOIN doctors d ON p.doctor_id = d.id
      WHERE p.id = $1;
    `;
    const res = await query<PrescriptionRecord>(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieves a prescription associated with a consultation.
   *
   * @param consultationId - Consultation UUID
   * @returns PrescriptionRecord or null
   */
  async findByConsultationId(consultationId: string): Promise<PrescriptionRecord | null> {
    const sql = `
      SELECT
        p.id,
        p.consultation_id,
        p.doctor_id,
        d.user_id AS doctor_user_id,
        p.patient_id,
        p.diagnosis,
        p.medicines,
        p.advice,
        p.created_at
      FROM prescriptions p
      JOIN doctors d ON p.doctor_id = d.id
      WHERE p.consultation_id = $1;
    `;
    const res = await query<PrescriptionRecord>(sql, [consultationId]);
    return res.rows[0] || null;
  }
}

export const prescriptionRepository = new PrescriptionRepository();
