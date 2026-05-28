import { Request, Response, NextFunction } from 'express';

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'errors.unauthorized' });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'errors.forbidden' });
      return;
    }
    next();
  };
}
