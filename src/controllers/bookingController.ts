import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { bookingService, BookingService } from '../services/bookingService';

const reserveSlotSchema = z.object({
  slot_id: z.string().uuid({ message: 'slot_id must be a valid UUID' }),
});

const confirmBookingSchema = z.object({
  reservation_id: z.string().uuid({ message: 'reservation_id must be a valid UUID' }),
  payment_method: z.string().min(1, 'payment_method is required'),
  card_token: z.string().optional(),
});

/**
 * Controller handling high-concurrency slot reservations and payment confirmations.
 */
export class BookingController {
  constructor(private service: BookingService = bookingService) {}

  /**
   * Reserves an available slot for 10 minutes with zero double-booking concurrency protection.
   */
  reserveSlot = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.user!.sub;
      const idempotencyKey = req.headers['idempotency-key'] as string;
      const data = reserveSlotSchema.parse(req.body);

      const reservation = await this.service.reserveSlot(data.slot_id, patientId, idempotencyKey);
      res.status(201).json(reservation);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Confirms reservation and executes mock payment charge outside DB transaction with compensation.
   */
  confirmBooking = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patientId = req.user!.sub;
      const data = confirmBookingSchema.parse(req.body);

      const consultation = await this.service.confirmBooking(
        data.reservation_id,
        patientId,
        data.payment_method,
        data.card_token
      );
      res.status(200).json(consultation);
    } catch (err) {
      next(err);
    }
  };
}

export const bookingController = new BookingController();
