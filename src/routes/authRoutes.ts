import { Router } from 'express';
import { authController } from '../controllers/authController';
import { authenticate } from '../middlewares/auth';

export const authRouter = Router();

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register a new user account (PATIENT or DOCTOR)
 * @access  Public
 */
authRouter.post('/register', authController.register);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate credentials, verify MFA if enabled, issue JWT pair
 * @access  Public
 */
authRouter.post('/login', authController.login);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Exchange a valid refresh token for a new 15-minute access token
 * @access  Public (Requires valid refresh token in request body)
 */
authRouter.post('/refresh', authController.refresh);

/**
 * @route   POST /api/v1/auth/mfa/setup
 * @desc    Initiate TOTP MFA setup, generates secret and otpauth URI
 * @access  Private (Requires Bearer access token)
 */
authRouter.post('/mfa/setup', authenticate, authController.setupMfa);

/**
 * @route   POST /api/v1/auth/mfa/verify
 * @desc    Validate 6-digit TOTP code and permanently activate MFA on account
 * @access  Private (Requires Bearer access token)
 */
authRouter.post('/mfa/verify', authenticate, authController.verifyMfa);

