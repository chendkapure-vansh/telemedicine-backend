import { Router } from 'express';
import { consultationController } from '../controllers/consultationController';
import { authenticate } from '../middlewares/auth';

export const consultationRouter = Router();

/**
 * @route   GET /api/v1/consultations/:id
 * @desc    Get consultation details (decrypts clinical notes for authorized parties)
 * @access  Private (Requires Bearer access token)
 */
consultationRouter.get(
  '/consultations/:id',
  authenticate,
  consultationController.getConsultation
);

/**
 * @route   PATCH /api/v1/consultations/:id/status
 * @desc    Updates consultation status through clinical state machine
 * @access  Private (Requires Bearer access token)
 */
consultationRouter.patch(
  '/consultations/:id/status',
  authenticate,
  consultationController.updateStatus
);
