import { Request, Response, NextFunction } from 'express';
import { getPermissions } from '../services/permissionsService';

export function requireRole(section: string, action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'errors.unauthorized' });
      return;
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
