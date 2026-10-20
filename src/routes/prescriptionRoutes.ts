import { Router } from 'express';
import { prescriptionController } from '../controllers/prescriptionController';
import { authenticate, requireRole, requireMfa } from '../middlewares/auth';
import { idempotencyMiddleware } from '../middlewares/idempotency';

export const prescriptionRouter = Router();

/**
 * @route   POST /api/v1/prescriptions
 * @desc    Doctor issues digital prescription with encrypted diagnosis and medications
 * @access  Private (Requires DOCTOR role, active MFA, and Idempotency-Key header)
 */
prescriptionRouter.post(
  '/prescriptions',
  authenticate,
  requireRole('DOCTOR'),
  requireMfa,
  idempotencyMiddleware,
  prescriptionController.createPrescription
);

/**
 * @route   GET /api/v1/prescriptions/:id
 * @desc    Retrieves prescription with decrypted diagnosis and medications
 * @access  Private (Requires Bearer access token)
 */
prescriptionRouter.get(
  '/prescriptions/:id',
  authenticate,
  prescriptionController.getPrescription
);
