import { query } from '../config/database';

/**
 * User domain entity representing an account in the system.
 */
export interface User {
  id: string;
  email: string;
  phone: string | null;
  password_hash: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  mfa_enabled: boolean;
  mfa_secret: string | null;
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: Date;
  updated_at: Date;
}

/**
 * Profile entity holding demographic information and encrypted medical history (PHI).
 */
export interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  dob: string | null;
  gender: string | null;
  medical_history: string | null;
  updated_at: Date;
}

/**
 * Doctor domain entity containing professional qualifications and practice details.
 */
export interface Doctor {
  id: string;
  user_id: string;
  specialization: string;
  experience_years: number;
  consultation_fee: number;
  license_number: string;
  language: string;
  bio: string | null;
  created_at: Date;
}

/**
 * Repository layer handling database operations for users, profiles, and doctors.
 * Uses parameterized queries to prevent SQL injection vulnerabilities.
 */
export class UserRepository {
  /**
   * Inserts a new user record into the database.
   *
   * @param email - User's unique email address
   * @param phone - Optional contact phone number
   * @param passwordHash - Salted bcrypt password hash
   * @param role - Account role ('PATIENT' or 'DOCTOR')
   * @returns Newly created User entity
   */
  async createUser(
    email: string,
    phone: string | null,
    passwordHash: string,
    role: 'PATIENT' | 'DOCTOR'
  ): Promise<User> {
    const sql = `
      INSERT INTO users (email, phone, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const res = await query<User>(sql, [email, phone, passwordHash, role]);
    return res.rows[0];
  }

  /**
   * Finds a user by their registered email address.
   *
   * @param email - User email to query
   * @returns Matching User record or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE email = $1;';
    const res = await query<User>(sql, [email]);
    return res.rows[0] || null;
  }

  /**
   * Finds a user by their primary UUID.
   *
   * @param id - User UUID
   * @returns Matching User record or null if not found
   */
  async findById(id: string): Promise<User | null> {
    const sql = 'SELECT * FROM users WHERE id = $1;';
    const res = await query<User>(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Updates a user's encrypted TOTP MFA secret.
   *
   * @param userId - User UUID
   * @param encryptedSecret - AES-256-GCM encrypted MFA secret envelope
   */
  async updateMfaSecret(userId: string, encryptedSecret: string): Promise<void> {
    const sql = 'UPDATE users SET mfa_secret = $1, updated_at = now() WHERE id = $2;';
    await query(sql, [encryptedSecret, userId]);
  }

  /**
   * Activates MFA for a user after successful TOTP token verification.
   *
   * @param userId - User UUID
   */
  async enableMfa(userId: string): Promise<void> {
    const sql = 'UPDATE users SET mfa_enabled = true, updated_at = now() WHERE id = $1;';
    await query(sql, [userId]);
  }

  /**
   * Retrieves profile details for a given user.
   *
   * @param userId - User UUID
   * @returns Profile record or null if not created yet
   */
  async getProfileByUserId(userId: string): Promise<Profile | null> {
    const sql = 'SELECT * FROM profiles WHERE user_id = $1;';
    const res = await query<Profile>(sql, [userId]);
    return res.rows[0] || null;
  }

  /**
   * Inserts or updates a user profile (upsert).
   *
   * @param userId - User UUID
   * @param fullName - Full name
   * @param dob - Date of birth (YYYY-MM-DD)
   * @param gender - Gender
   * @param encryptedMedicalHistory - AES-256-GCM encrypted medical history (PHI)
   * @returns Updated Profile record
   */
  async upsertProfile(
    userId: string,
    fullName: string | null,
    dob: string | null,
    gender: string | null,
    encryptedMedicalHistory: string | null
  ): Promise<Profile> {
    const sql = `
      INSERT INTO profiles (user_id, full_name, dob, gender, medical_history, updated_at)
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        dob = EXCLUDED.dob,
        gender = EXCLUDED.gender,
        medical_history = EXCLUDED.medical_history,
        updated_at = now()
      RETURNING *;
    `;
    const res = await query<Profile>(sql, [userId, fullName, dob, gender, encryptedMedicalHistory]);
    return res.rows[0];
  }

  /**
   * Inserts or updates doctor qualifications and clinical practice metadata (upsert).
   *
   * @param userId - User UUID with DOCTOR role
   * @param specialization - Clinical specialization (e.g. Cardiology, Ayurveda, General Medicine)
   * @param experienceYears - Total years of clinical experience
   * @param consultationFee - Consultation fee in minor units or currency
   * @param licenseNumber - Medical council registration / license number
   * @param language - Primary consultation language
   * @param bio - Professional biography
   * @returns Updated Doctor record
   */
  async upsertDoctor(
    userId: string,
    specialization: string,
    experienceYears: number,
    consultationFee: number,
    licenseNumber: string,
    language: string,
    bio: string | null
  ): Promise<Doctor> {
    const sql = `
      INSERT INTO doctors (user_id, specialization, experience_years, consultation_fee, license_number, language, bio)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        specialization = EXCLUDED.specialization,
        experience_years = EXCLUDED.experience_years,
        consultation_fee = EXCLUDED.consultation_fee,
        license_number = EXCLUDED.license_number,
        language = EXCLUDED.language,
        bio = EXCLUDED.bio
      RETURNING *;
    `;
    const res = await query<Doctor>(sql, [
      userId,
      specialization,
      experienceYears,
      consultationFee,
      licenseNumber,
      language,
      bio,
    ]);
    return res.rows[0];
  }
}

export const userRepository = new UserRepository();

