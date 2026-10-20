import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authenticate, requireRole } from '../middlewares/auth';

export const adminRouter = Router();

/**
 * @route   GET /api/v1/admin/analytics/overview
 * @desc    Retrieves high-level platform analytics (total consultations, completed, doctors, revenue)
 * @access  Private (Requires ADMIN role)
 */
adminRouter.get(
  '/admin/analytics/overview',
  authenticate,
  requireRole('ADMIN'),
  adminController.getAnalyticsOverview
);
