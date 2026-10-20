import { query } from '../config/database';

/**
 * Domain entity representing a consultation availability slot.
 */
export interface Slot {
  id: string;
  doctor_id: string;
  start_time: Date;
  end_time: Date;
  status: 'AVAILABLE' | 'LOCKED' | 'BOOKED';
  locked_until: Date | null;
  locked_by_patient_id: string | null;
  created_at: Date;
}

/**
 * Repository layer for doctor availability slots.
 */
export class SlotRepository {
  /**
   * Inserts a new AVAILABLE consultation slot for a doctor.
   *
   * @param doctorId - Doctor UUID (foreign key to doctors table)
   * @param startTime - Slot start timestamp
   * @param endTime - Slot end timestamp
   * @returns Newly created Slot record
   */
  async createSlot(doctorId: string, startTime: Date, endTime: Date): Promise<Slot> {
    const sql = `
      INSERT INTO availability_slots (doctor_id, start_time, end_time, status)
      VALUES ($1, $2, $3, 'AVAILABLE')
      RETURNING *;
    `;
    const res = await query<Slot>(sql, [doctorId, startTime, endTime]);
    return res.rows[0];
  }

  /**
   * Retrieves all future AVAILABLE slots for a given doctor, ordered by start time.
   *
   * @param doctorId - Doctor UUID
   * @returns List of active available slots
   */
  async findAvailableSlotsByDoctorId(doctorId: string): Promise<Slot[]> {
    const sql = `
      SELECT *
      FROM availability_slots
      WHERE doctor_id = $1
        AND status = 'AVAILABLE'
        AND start_time > now()
      ORDER BY start_time ASC;
    `;
    const res = await query<Slot>(sql, [doctorId]);
    return res.rows;
  }

  /**
   * Checks whether a new slot interval overlaps with any existing slot for this doctor.
   *
   * @param doctorId - Doctor UUID
   * @param startTime - Candidate slot start
   * @param endTime - Candidate slot end
   * @returns True if overlapping slot exists
   */
  async hasOverlappingSlot(
    doctorId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    const sql = `
      SELECT id
      FROM availability_slots
      WHERE doctor_id = $1
        AND status IN ('AVAILABLE', 'LOCKED', 'BOOKED')
        AND (start_time < $3 AND end_time > $2)
      LIMIT 1;
    `;
    const res = await query<{ id: string }>(sql, [doctorId, startTime, endTime]);
    return res.rows.length > 0;
  }
}

export const slotRepository = new SlotRepository();
