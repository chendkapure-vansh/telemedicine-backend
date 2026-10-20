import {
  bookingRepository,
  BookingRepository,
  ReservationResult,
  Consultation,
} from '../repositories/bookingRepository';
import { mockPaymentGateway, MockPaymentGateway } from './mockPaymentGateway';
import { slotService, SlotService } from './slotService';
import { logger } from '../config/logger';
import { AppError } from '../middlewares/errorHandler';

/**
 * Service coordinating slot reservation, payment processing, and compensation mechanics.
 */
export class BookingService {
  constructor(
    private bookingRepo: BookingRepository = bookingRepository,
    private paymentGateway: MockPaymentGateway = mockPaymentGateway,
    private slots: SlotService = slotService
  ) {}

  /**
   * Reserves an available slot for checkout by locking it for 10 minutes.
   *
   * @param slotId - Availability slot UUID
   * @param patientId - Authenticated patient UUID
   * @param idempotencyKey - Client request idempotency key
   * @returns Active reservation details
   */
  async reserveSlot(
    slotId: string,
    patientId: string,
    idempotencyKey: string
  ): Promise<ReservationResult> {
    const reservation = await this.bookingRepo.reserveSlot(slotId, patientId, idempotencyKey);

    // Invalidate cached slots for doctor
    const details = await this.bookingRepo.findReservation(reservation.reservation_id);
    if (details) {
      await this.slots.invalidateDoctorSlotsCache(details.slot.doctor_id);
    }

    return reservation;
  }

  /**
   * Confirms a reserved booking: executes payment charge outside DB transaction,
   * then updates records atomically or triggers compensation upon failure.
   *
   * @param reservationId - Payment reservation UUID
   * @param patientId - Authenticated patient UUID
   * @param paymentMethod - Payment method
   * @param cardToken - Card token for mock gateway
   * @returns Confirmed Consultation record
   */
  async confirmBooking(
    reservationId: string,
    patientId: string,
    paymentMethod: string,
    cardToken?: string
  ): Promise<Consultation> {
    const details = await this.bookingRepo.findReservation(reservationId);
    if (!details) {
      const err = new Error('Reservation not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    const { payment, slot } = details;

    if (payment.patient_id !== patientId) {
      const err = new Error('Forbidden: You are not authorized to complete this reservation') as AppError;
      err.statusCode = 403;
      throw err;
    }

    if (payment.status !== 'PENDING') {
      const err = new Error(`Reservation is already ${payment.status.toLowerCase()}`) as AppError;
      err.statusCode = 400;
      throw err;
    }

    const now = new Date();
    if (
      slot.status !== 'LOCKED' ||
      !slot.locked_until ||
      new Date(slot.locked_until) < now
    ) {
      // Lease expired, execute compensation immediately
      await this.bookingRepo.compensateFailedReservation(reservationId);
      await this.slots.invalidateDoctorSlotsCache(slot.doctor_id);

      const err = new Error(
        'Reservation checkout lease has expired. Please select the slot again.'
      ) as AppError;
      err.statusCode = 400;
      throw err;
    }

    // Step 3: Execute Payment Gateway charge OUTSIDE the database transaction
    const chargeResult = await this.paymentGateway.charge(
      payment.amount,
      payment.currency,
      paymentMethod,
      cardToken
    );

    // Step 4 (Failure): Execute compensation steps
    if (!chargeResult.success) {
      logger.warn(
        { reservationId, error: chargeResult.error },
        'Payment failed, executing compensation steps to release slot'
      );

      await this.bookingRepo.compensateFailedReservation(reservationId);
      await this.slots.invalidateDoctorSlotsCache(slot.doctor_id);

      const err = new Error(
        chargeResult.error || 'Payment was declined by the payment provider'
      ) as AppError;
      err.statusCode = 400;
      throw err;
    }

    // Step 4 (Success): Atomic DB commit finalizing consultation and payment
    const consultation = await this.bookingRepo.confirmBookingTransaction(
      reservationId,
      patientId,
      chargeResult.transactionId!
    );

    // Invalidate doctor available slots cache
    await this.slots.invalidateDoctorSlotsCache(slot.doctor_id);

    return consultation;
  }
}

export const bookingService = new BookingService();
