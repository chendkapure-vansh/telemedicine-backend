import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Access token claims payload.
 */
export interface TokenPayload {
  sub: string;
  email: string;
  role: 'PATIENT' | 'DOCTOR' | 'ADMIN';
  mfa_enabled: boolean;
  type: 'access';
}

/**
 * Refresh token claims payload.
 */
export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
}

/**
 * Generates a short-lived access JWT (15 minutes).
 *
 * @param payload - Subject, email, role, and MFA status
 * @returns Signed JWT string with HS256
 */
export function generateAccessToken(payload: Omit<TokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: '15m',
  });
}

/**
 * Generates a long-lived refresh JWT (7 days).
 *
 * @param userId - User UUID
 * @returns Signed refresh JWT string with HS256
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

/**
 * Verifies and decodes an access token.
 * Pins HS256 and asserts type claim is 'access'.
 *
 * @param token - Bearer JWT string
 * @returns Decoded access token claims
 */
export function verifyAccessToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
  }) as TokenPayload;

  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }

  return decoded;
}

/**
 * Verifies and decodes a refresh token.
 * Pins HS256 and asserts type claim is 'refresh'.
 *
 * @param token - Refresh JWT string
 * @returns Decoded refresh token claims
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: ['HS256'],
  }) as RefreshTokenPayload;

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return decoded;
}

