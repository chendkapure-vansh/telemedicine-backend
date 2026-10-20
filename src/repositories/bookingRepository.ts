import { query, withTransaction } from '../config/database';
import { Slot } from './slotRepository';
import { AppError } from '../middlewares/errorHandler';

/**
 * Payment record domain entity.
 */
export interface Payment {
  id: string;
  slot_id: string;
  consultation_id: string | null;
  patient_id: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  idempotency_key: string;
  provider_transaction_id: string | null;
  created_at: Date;
}

/**
 * Reservation details returned upon locking a slot.
 */
export interface ReservationResult {
  reservation_id: string;
  slot_id: string;
  locked_until: Date;
  amount: number;
  currency: string;
}

/**
 * Consultation record domain entity.
 */
export interface Consultation {
  id: string;
  patient_id: string;
  doctor_id: string;
  slot_id: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes: string | null;
  scheduled_at: Date;
  completed_at: Date | null;
  created_at: Date;
}

/**
 * Repository layer managing pessimistic concurrency locks, payment transactions, and consultations.
 */
export class BookingRepository {
  /**
   * Atomically locks an available slot for 10 minutes using SELECT FOR UPDATE NOWAIT.
   *
   * @param slotId - Availability slot UUID
   * @param patientId - Authenticated patient UUID
   * @param idempotencyKey - Unique reservation key
   * @returns Active reservation lease details
   */
  async reserveSlot(
    slotId: string,
    patientId: string,
    idempotencyKey: string
  ): Promise<ReservationResult> {
    return withTransaction(async (client) => {
      let slotRes;
      try {
        const lockSql = `
          SELECT s.*, d.consultation_fee
          FROM availability_slots s
          JOIN doctors d ON s.doctor_id = d.id
          WHERE s.id = $1
          FOR UPDATE NOWAIT;
        `;
        slotRes = await client.query(lockSql, [slotId]);
      } catch (err: unknown) {
        // PostgreSQL error code 55P03 represents lock_not_available
        if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '55P03') {
          const error = new Error(
            'Slot is currently being booked by another patient. Please select another slot.'
          ) as AppError;
          error.statusCode = 409;
          throw error;
        }
        throw err;
      }

      if (slotRes.rows.length === 0) {
        const error = new Error('Availability slot not found') as AppError;
        error.statusCode = 404;
        throw error;
      }

      const slot = slotRes.rows[0];

      if (slot.status === 'BOOKED') {
        const error = new Error('Slot has already been booked') as AppError;
        error.statusCode = 409;
        throw error;
      }

      const now = new Date();
      if (
        slot.status === 'LOCKED' &&
        slot.locked_until &&
        new Date(slot.locked_until) > now &&
        slot.locked_by_patient_id !== patientId
      ) {
        const error = new Error(
          'Slot is currently reserved by another patient. Please choose another time.'
        ) as AppError;
        error.statusCode = 409;
        throw error;
      }

      // Update slot status to LOCKED with 10-minute lease window
      const updateSlotSql = `
        UPDATE availability_slots
        SET status = 'LOCKED',
            locked_until = now() + INTERVAL '10 min',
            locked_by_patient_id = $2
        WHERE id = $1
        RETURNING *;
      `;
      const updatedSlotRes = await client.query<Slot>(updateSlotSql, [slotId, patientId]);
      const updatedSlot = updatedSlotRes.rows[0];

      // Create initial PENDING payment transaction record
      const createPaymentSql = `
        INSERT INTO payments (slot_id, patient_id, amount, currency, status, idempotency_key)
        VALUES ($1, $2, $3, 'INR', 'PENDING', $4)
        RETURNING *;
      `;
      const paymentRes = await client.query<Payment>(createPaymentSql, [
        slotId,
        patientId,
        slot.consultation_fee,
        idempotencyKey,
      ]);
      const payment = paymentRes.rows[0];

      return {
        reservation_id: payment.id,
        slot_id: updatedSlot.id,
        locked_until: updatedSlot.locked_until!,
        amount: Number(payment.amount),
        currency: payment.currency,
      };
    });
  }

  /**
   * Retrieves reservation payment and slot details by reservation UUID.
   *
   * @param reservationId - Payment UUID
   * @returns Payment and associated Slot or null
   */
  async findReservation(
    reservationId: string
  ): Promise<{ payment: Payment; slot: Slot } | null> {
    const sql = `
      SELECT
        p.id AS payment_id,
        p.slot_id,
        p.consultation_id,
        p.patient_id,
        p.amount,
        p.currency,
        p.status AS payment_status,
        p.idempotency_key,
        p.provider_transaction_id,
        p.created_at AS payment_created_at,
        s.doctor_id,
        s.start_time,
        s.end_time,
        s.status AS slot_status,
        s.locked_until,
        s.locked_by_patient_id,
        s.created_at AS slot_created_at
      FROM payments p
      JOIN availability_slots s ON p.slot_id = s.id
      WHERE p.id = $1;
    `;
    const res = await query(sql, [reservationId]);
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      payment: {
        id: row.payment_id,
        slot_id: row.slot_id,
        consultation_id: row.consultation_id,
        patient_id: row.patient_id,
        amount: Number(row.amount),
        currency: row.currency,
        status: row.payment_status,
        idempotency_key: row.idempotency_key,
        provider_transaction_id: row.provider_transaction_id,
        created_at: row.payment_created_at,
      },
      slot: {
        id: row.slot_id,
        doctor_id: row.doctor_id,
        start_time: row.start_time,
        end_time: row.end_time,
        status: row.slot_status,
        locked_until: row.locked_until,
        locked_by_patient_id: row.locked_by_patient_id,
        created_at: row.slot_created_at,
      },
    };
  }

  /**
   * Finalizes booking inside an atomic database transaction after successful payment gateway charge.
   *
   * @param reservationId - Payment UUID
   * @param patientId - Patient UUID
   * @param providerTxnId - Gateway transaction reference
   * @returns Scheduled Consultation record
   */
  async confirmBookingTransaction(
    reservationId: string,
    patientId: string,
    providerTxnId: string
  ): Promise<Consultation> {
    return withTransaction(async (client) => {
      // 1. Lock slot to prevent concurrent state transitions
      const paymentRes = await client.query<Payment>(
        `SELECT * FROM payments WHERE id = $1 AND patient_id = $2 FOR UPDATE;`,
        [reservationId, patientId]
      );

      if (paymentRes.rows.length === 0) {
        const error = new Error('Reservation not found') as AppError;
        error.statusCode = 404;
        throw error;
      }

      const payment = paymentRes.rows[0];
      if (payment.status !== 'PENDING') {
        const error = new Error(`Reservation is already ${payment.status.toLowerCase()}`) as AppError;
        error.statusCode = 400;
        throw error;
      }

      const slotRes = await client.query<Slot>(
        `SELECT * FROM availability_slots WHERE id = $1 FOR UPDATE;`,
        [payment.slot_id]
      );
      const slot = slotRes.rows[0];

      if (
        slot.status !== 'LOCKED' ||
        !slot.locked_until ||
        new Date(slot.locked_until) < new Date() ||
        slot.locked_by_patient_id !== patientId
      ) {
        const error = new Error('Reservation hold expired. Please reserve the slot again.') as AppError;
        error.statusCode = 400;
        throw error;
      }

      // 2. Mark slot as BOOKED and clear locks
      await client.query(
        `UPDATE availability_slots
         SET status = 'BOOKED',
             locked_until = NULL,
             locked_by_patient_id = NULL
         WHERE id = $1;`,
        [slot.id]
      );

      // 3. Create scheduled consultation
      const consultSql = `
        INSERT INTO consultations (patient_id, doctor_id, slot_id, scheduled_at, status)
        VALUES ($1, $2, $3, $4, 'SCHEDULED')
        RETURNING *;
      `;
      const consultRes = await client.query<Consultation>(consultSql, [
        patientId,
        slot.doctor_id,
        slot.id,
        slot.start_time,
      ]);
      const consultation = consultRes.rows[0];

      // 4. Update payment status to SUCCESS and link consultation
      await client.query(
        `UPDATE payments
         SET status = 'SUCCESS',
             consultation_id = $1,
             provider_transaction_id = $2
         WHERE id = $3;`,
        [consultation.id, providerTxnId, payment.id]
      );

      return consultation;
    });
  }

  /**
   * Compensates a failed or timed out reservation by resetting the slot back to AVAILABLE.
   *
   * @param reservationId - Payment UUID
   */
  async compensateFailedReservation(reservationId: string): Promise<void> {
    await withTransaction(async (client) => {
      const payRes = await client.query<Payment>(
        `UPDATE payments SET status = 'FAILED' WHERE id = $1 RETURNING slot_id;`,
        [reservationId]
      );
      if (payRes.rows.length > 0) {
        const slotId = payRes.rows[0].slot_id;
        await client.query(
          `UPDATE availability_slots
           SET status = 'AVAILABLE',
               locked_until = NULL,
               locked_by_patient_id = NULL
           WHERE id = $1 AND status = 'LOCKED';`,
          [slotId]
        );
      }
    });
  }

  /**
   * Sweeps expired reservation leases and restores slots to AVAILABLE.
   *
   * @returns Count of swept expired slots
   */
  async sweepExpiredLocks(): Promise<number> {
    const sql = `
      WITH expired_slots AS (
        UPDATE availability_slots
        SET status = 'AVAILABLE',
            locked_until = NULL,
            locked_by_patient_id = NULL
        WHERE status = 'LOCKED'
          AND locked_until <= now()
        RETURNING id
      )
      UPDATE payments
      SET status = 'FAILED'
      WHERE slot_id IN (SELECT id FROM expired_slots)
        AND status = 'PENDING';
    `;
    const res = await query(sql);
    return res.rowCount || 0;
  }
}

export const bookingRepository = new BookingRepository();
