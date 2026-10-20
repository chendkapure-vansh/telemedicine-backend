import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';

// Augment Express Request interface with authenticated user payload
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Express middleware that validates the Bearer access token from Authorization header.
 * Attaches decoded TokenPayload to `req.user`.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized: Missing or malformed authorization token',
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (_err) {
    res.status(401).json({
      error: 'Unauthorized: Invalid or expired access token',
    });
  }
}

/**
 * Role-Based Access Control (RBAC) middleware factory.
 * Requires that req.user has one of the allowed roles.
 *
 * @param roles - Allowed user roles ('PATIENT', 'DOCTOR', 'ADMIN')
 */
export function requireRole(...roles: Array<'PATIENT' | 'DOCTOR' | 'ADMIN'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: `Forbidden: Access restricted to roles: [${roles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}

/**
 * Multi-Factor Authentication (MFA) enforcement middleware.
 * Ensures Doctor and Admin accounts have active MFA enabled before accessing sensitive resources.
 */
export function requireMfa(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized: Authentication required' });
    return;
  }

  if ((req.user.role === 'DOCTOR' || req.user.role === 'ADMIN') && !req.user.mfa_enabled) {
    res.status(403).json({
      error: 'Forbidden: Multi-Factor Authentication (MFA) must be enabled on this account to access this resource',
    });
    return;
  }

  next();
}

