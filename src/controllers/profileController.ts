import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { profileService, ProfileService } from '../services/profileService';

const updateProfileSchema = z.object({
  full_name: z.string().min(1).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'DOB must be in YYYY-MM-DD format').optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  medical_history: z.string().nullable().optional(),
});

const updateDoctorSchema = z.object({
  specialization: z.string().min(1, 'Specialization is required'),
  experience_years: z.coerce.number().min(0, 'Experience years must be 0 or greater'),
  consultation_fee: z.coerce.number().positive('Consultation fee must be greater than 0'),
  license_number: z.string().min(1, 'License number is required'),
  language: z.string().min(1, 'Language is required'),
  bio: z.string().optional(),
});

/**
 * Controller handling user profiles, patient medical histories, and doctor clinical profiles.
 */
export class ProfileController {
  constructor(private service: ProfileService = profileService) {}

  /**
   * Retrieves profile details for the authenticated user, decrypting PHI.
   */
  getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const profile = await this.service.getUserProfile(userId);
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Updates demographic details and encrypts medical history for the authenticated user.
   */
  updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const data = updateProfileSchema.parse(req.body);
      const profile = await this.service.updateUserProfile(userId, data);
      res.status(200).json(profile);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Updates clinical credentials and fee schedules for doctors.
   * Requires DOCTOR role and active MFA.
   */
  updateDoctorProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const data = updateDoctorSchema.parse(req.body);
      const doctor = await this.service.updateDoctorProfile(userId, data);
      res.status(200).json(doctor);
    } catch (err) {
      next(err);
    }
  };
}

export const profileController = new ProfileController();

