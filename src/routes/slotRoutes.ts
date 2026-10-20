import { Router } from 'express';
import { slotController } from '../controllers/slotController';
import { authenticate, requireRole, requireMfa } from '../middlewares/auth';

export const slotRouter = Router();

/**
 * @route   POST /api/v1/slots
 * @desc    Doctor schedules a single consultation availability slot
 * @access  Private (Requires DOCTOR role and active MFA)
 */
slotRouter.post(
  '/slots',
  authenticate,
  requireRole('DOCTOR'),
  requireMfa,
  slotController.createSlot
);

/**
 * @route   GET /api/v1/slots?doctor_id=...
 * @desc    Lists active AVAILABLE slots for a given doctor (Redis cached)
 * @access  Public
 */
slotRouter.get('/slots', slotController.getAvailableSlots);
