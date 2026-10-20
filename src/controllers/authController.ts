import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService, AuthService } from '../services/authService';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phone: z.string().optional(),
  role: z.enum(['PATIENT', 'DOCTOR']),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
  mfa_code: z
    .string()
    .length(6, 'MFA code must be exactly 6 digits')
    .optional()
    .or(z.literal('')),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token is required'),
});

const verifyMfaSchema = z.object({
  code: z.string().length(6, 'MFA verification code must be exactly 6 digits'),
});

/**
 * Controller handling user registration, authentication, token refresh, and MFA setup/verification.
 */
export class AuthController {
  constructor(private service: AuthService = authService) {}

  /**
   * Registers a new PATIENT or DOCTOR account.
   */
  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = registerSchema.parse(req.body);
      const result = await this.service.register(data.email, data.password, data.phone || null, data.role);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Logs in a user with email and password, requiring TOTP MFA code if enabled.
   */
  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = loginSchema.parse(req.body);
      const mfaCode = data.mfa_code && data.mfa_code.trim() !== '' ? data.mfa_code : undefined;
      const result = await this.service.login(data.email, data.password, mfaCode);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Refreshes expired access tokens using a valid refresh token.
   */
  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = refreshSchema.parse(req.body);
      const result = await this.service.refresh(data.refresh_token);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Generates a new TOTP secret and returns an otpauth QR code URI for the authenticated user.
   */
  setupMfa = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const result = await this.service.setupMfa(userId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  /**
   * Validates the 6-digit TOTP code and activates MFA on the user account.
   */
  verifyMfa = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const data = verifyMfaSchema.parse(req.body);
      const result = await this.service.verifyMfa(userId, data.code);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const authController = new AuthController();

