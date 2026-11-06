import { Request, Response, NextFunction } from 'express';
import { resolveAuth } from './auth';
import { getPermissions } from '../services/permissionsService';

export function requireRole(section: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Parse JWT if requireAuth hasn't already run on this request
    if (!req.auth) {
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
    }
    const perms = getPermissions() as Record<string, Record<string, string[]>>;
    const roles: string[] = perms[section]?.[action] ?? [];
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'errors.forbidden' });
      return;
    }
    next();
  };
}
