import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { getUserAccess } from '../services/userAccessService';

export interface AuthPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

// Verifies a login token and fills in the user's current details; null if invalid or the user is no longer active
export function resolveAuth(token: string): AuthPayload | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    const access = getUserAccess(payload.userId);
    if (!access?.isActive) return null;
    return { ...payload, role: access.role, email: access.email, name: access.name };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'errors.unauthorized' });
    return;
  }

  const auth = resolveAuth(authHeader.slice(7));
  if (!auth) {
    res.status(401).json({ error: 'errors.token_invalid' });
    return;
  }
  req.auth = auth;
  next();
}
