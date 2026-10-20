import { Router } from 'express';
import { profileController } from '../controllers/profileController';
import { authenticate, requireRole, requireMfa } from '../middlewares/auth';

export const profileRouter = Router();

/**
 * @route   GET /api/v1/users/profile
 * @desc    Get user profile with decrypted medical history (PHI)
 * @access  Private (Requires Bearer access token)
 */
profileRouter.get('/users/profile', authenticate, profileController.getProfile);

/**
 * @route   PUT /api/v1/users/profile
 * @desc    Update demographic data and encrypt medical history (PHI)
 * @access  Private (Requires Bearer access token)
 */
profileRouter.put('/users/profile', authenticate, profileController.updateProfile);

/**
 * @route   PUT /api/v1/doctors/profile
 * @desc    Create or update doctor qualifications, consultation fees, and practice info
 * @access  Private (Requires DOCTOR role and active MFA)
 */
profileRouter.put(
  '/doctors/profile',
  authenticate,
  requireRole('DOCTOR'),
  requireMfa,
  profileController.updateDoctorProfile
);

