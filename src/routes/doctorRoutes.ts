import { Router } from 'express';
import { doctorController } from '../controllers/doctorController';

export const doctorRouter = Router();

/**
 * @route   GET /api/v1/doctors/search
 * @desc    Search doctors by specialization, language, and maximum fee (sub-200ms with Redis)
 * @access  Public
 */
doctorRouter.get('/doctors/search', doctorController.searchDoctors);
