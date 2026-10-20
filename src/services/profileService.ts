import { userRepository, UserRepository, Profile, Doctor } from '../repositories/userRepository';
import { encryptPHI, decryptPHI } from '../utils/crypto';
import { AppError } from '../middlewares/errorHandler';

/**
 * Data transfer object for updating a user profile.
 */
export interface UpdateProfileInput {
  full_name?: string;
  dob?: string;
  gender?: string;
  medical_history?: string | null;
}

/**
 * Data transfer object for updating doctor qualifications and practice info.
 */
export interface UpdateDoctorInput {
  specialization: string;
  experience_years: number;
  consultation_fee: number;
  license_number: string;
  language: string;
  bio?: string;
}

/**
 * Service managing user profiles and doctor practice profiles.
 * Automatically encrypts and decrypts Protected Health Information (PHI).
 */
export class ProfileService {
  constructor(private userRepo: UserRepository = userRepository) {}

  /**
   * Fetches user profile and decrypts any stored medical history (PHI).
   *
   * @param userId - User UUID
   * @returns Decrypted Profile object
   */
  async getUserProfile(userId: string): Promise<Profile> {
    const profile = await this.userRepo.getProfileByUserId(userId);
    if (!profile) {
      const err = new Error('Profile not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    return {
      ...profile,
      medical_history: profile.medical_history ? decryptPHI(profile.medical_history) : null,
    };
  }

  /**
   * Updates or creates a user profile, encrypting medical_history with AES-256-GCM.
   *
   * @param userId - User UUID
   * @param input - Demographic and medical details
   * @returns Updated Profile object with plaintext medical_history
   */
  async updateUserProfile(userId: string, input: UpdateProfileInput): Promise<Profile> {
    const encryptedMedicalHistory = input.medical_history
      ? encryptPHI(input.medical_history)
      : null;

    const profile = await this.userRepo.upsertProfile(
      userId,
      input.full_name || null,
      input.dob || null,
      input.gender || null,
      encryptedMedicalHistory
    );

    return {
      ...profile,
      medical_history: input.medical_history || null,
    };
  }

  /**
   * Updates or registers doctor qualifications, fees, and license information.
   *
   * @param userId - User UUID (must have DOCTOR role)
   * @param input - Doctor practice details
   * @returns Updated Doctor record
   */
  async updateDoctorProfile(userId: string, input: UpdateDoctorInput): Promise<Doctor> {
    return this.userRepo.upsertDoctor(
      userId,
      input.specialization,
      input.experience_years,
      input.consultation_fee,
      input.license_number,
      input.language,
      input.bio || null
    );
  }
}

export const profileService = new ProfileService();

