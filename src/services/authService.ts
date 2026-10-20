import bcrypt from 'bcrypt';
import { userRepository, UserRepository, User } from '../repositories/userRepository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { generateTotpSecret, verifyTotpCode, getTotpUri } from '../utils/totp';
import { encryptPHI, decryptPHI } from '../utils/crypto';
import { AppError } from '../middlewares/errorHandler';

/**
 * Result structure returned upon successful authentication or token refresh.
 */
export interface AuthResult {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
    mfa_enabled: boolean;
  };
}

/**
 * Service managing user authentication, password hashing, JWT lifecycle, and TOTP MFA.
 */
export class AuthService {
  constructor(private userRepo: UserRepository = userRepository) {}

  /**
   * Registers a new user account with hashed password and initial blank profile.
   *
   * @param email - User email
   * @param password - Plaintext password (hashed with bcrypt cost 12)
   * @param phone - Optional phone number
   * @param role - Account role ('PATIENT' or 'DOCTOR')
   * @returns Auth tokens and sanitized user info
   */
  async register(
    email: string,
    password: string,
    phone: string | null,
    role: 'PATIENT' | 'DOCTOR'
  ): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      const err = new Error('Email is already registered') as AppError;
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.userRepo.createUser(email, phone, passwordHash, role);

    // Initialize blank user profile
    await this.userRepo.upsertProfile(user.id, null, null, null, null);

    return this.buildAuthResponse(user);
  }

  /**
   * Validates user credentials and TOTP code (if MFA is enabled).
   * Returns identical generic 401 on bad email or bad password to prevent enumeration.
   *
   * @param email - Registered email address
   * @param password - Plaintext password
   * @param mfaCode - Optional 6-digit TOTP code (required if mfa_enabled is true)
   * @returns Auth tokens and sanitized user info
   */
  async login(email: string, password: string, mfaCode?: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    if (!user || user.status === 'SUSPENDED') {
      const err = new Error('Invalid email or password') as AppError;
      err.statusCode = 401;
      throw err;
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      const err = new Error('Invalid email or password') as AppError;
      err.statusCode = 401;
      throw err;
    }

    // Enforce TOTP MFA check if enabled on account
    if (user.mfa_enabled) {
      if (!mfaCode) {
        const err = new Error('MFA code is required') as AppError;
        err.statusCode = 401;
        throw err;
      }

      if (!user.mfa_secret) {
        const err = new Error('MFA configuration error') as AppError;
        err.statusCode = 500;
        throw err;
      }

      const decryptedSecret = decryptPHI(user.mfa_secret);
      const isMfaValid = verifyTotpCode(decryptedSecret, mfaCode);

      if (!isMfaValid) {
        const err = new Error('Invalid MFA authentication code') as AppError;
        err.statusCode = 401;
        throw err;
      }
    }

    return this.buildAuthResponse(user);
  }

  /**
   * Exchanges a valid refresh token for a newly issued access and refresh token pair.
   *
   * @param refreshToken - Long-lived refresh token
   * @returns Refreshed auth tokens and sanitized user info
   */
  async refresh(refreshToken: string): Promise<AuthResult> {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const user = await this.userRepo.findById(decoded.sub);

      if (!user || user.status === 'SUSPENDED') {
        const err = new Error('Invalid or expired refresh token') as AppError;
        err.statusCode = 401;
        throw err;
      }

      return this.buildAuthResponse(user);
    } catch (_err) {
      const err = new Error('Invalid or expired refresh token') as AppError;
      err.statusCode = 401;
      throw err;
    }
  }

  /**
   * Generates a new TOTP secret for the user, encrypts and saves it in database.
   * Blocks overwriting if MFA is already active.
   *
   * @param userId - User UUID
   * @returns Base32 secret and otpauth QR code URI
   */
  async setupMfa(userId: string): Promise<{ secret: string; qr_code_uri: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      const err = new Error('User not found') as AppError;
      err.statusCode = 404;
      throw err;
    }

    // Prevent overwriting an already active and verified MFA secret
    if (user.mfa_enabled) {
      const err = new Error('MFA is already active and enabled on this account') as AppError;
      err.statusCode = 400;
      throw err;
    }

    const secret = generateTotpSecret();
    const encryptedSecret = encryptPHI(secret);
    await this.userRepo.updateMfaSecret(userId, encryptedSecret);

    return {
      secret,
      qr_code_uri: getTotpUri(secret, user.email),
    };
  }

  /**
   * Verifies the user's first TOTP code and activates MFA permanently.
   *
   * @param userId - User UUID
   * @param code - 6-digit TOTP code
   * @returns Success confirmation message
   */
  async verifyMfa(userId: string, code: string): Promise<{ message: string }> {
    const user = await this.userRepo.findById(userId);
    if (!user || !user.mfa_secret) {
      const err = new Error('MFA setup has not been initiated') as AppError;
      err.statusCode = 400;
      throw err;
    }

    const decryptedSecret = decryptPHI(user.mfa_secret);
    const isValid = verifyTotpCode(decryptedSecret, code);

    if (!isValid) {
      const err = new Error('Invalid verification code') as AppError;
      err.statusCode = 400;
      throw err;
    }

    await this.userRepo.enableMfa(userId);
    return { message: 'MFA successfully enabled' };
  }

  /**
   * Helper constructing standardized auth tokens and sanitized user response.
   */
  private buildAuthResponse(user: User): AuthResult {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      mfa_enabled: user.mfa_enabled,
    };
    return {
      access_token: generateAccessToken(payload),
      refresh_token: generateRefreshToken(user.id),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        mfa_enabled: user.mfa_enabled,
      },
    };
  }
}

export const authService = new AuthService();

