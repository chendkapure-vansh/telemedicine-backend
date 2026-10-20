import { Router } from 'express';
import { bookingController } from '../controllers/bookingController';
import { authenticate, requireRole } from '../middlewares/auth';
import { idempotencyMiddleware } from '../middlewares/idempotency';

export const bookingRouter = Router();

/**
 * @route   POST /api/v1/bookings/reserve
 * @desc    Atomically locks a slot for 10 minutes to prevent double booking
 * @access  Private (Requires PATIENT role and Idempotency-Key header)
 */
bookingRouter.post(
  '/bookings/reserve',
  authenticate,
  requireRole('PATIENT'),
  idempotencyMiddleware,
  bookingController.reserveSlot
);

/**
 * @route   POST /api/v1/bookings/confirm
 * @desc    Executes payment charge and confirms consultation booking
 * @access  Private (Requires PATIENT role and Idempotency-Key header)
 */
bookingRouter.post(
  '/bookings/confirm',
  authenticate,
  requireRole('PATIENT'),
  idempotencyMiddleware,
  bookingController.confirmBooking
);
