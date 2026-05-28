import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { loginSchema } from '@servio/shared';
import { db } from '../db';
import { config } from '../config';
import { createAuditLog } from '../utils/audit';
import { requireAuth } from '../middleware/auth';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'errors.too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email.toLowerCase()),
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'errors.invalid_credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'errors.invalid_credentials' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn } as jwt.SignOptions,
  );

  await createAuditLog({
    userId: user.id,
    userEmail: user.email,
    action: 'login',
    req,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      languagePreference: user.languagePreference,
    },
  });
});

router.post('/logout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: 'logout',
    req,
  });
  res.json({ success: true });
});

router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, req.auth!.userId),
  });

  if (!user || !user.isActive) {
    res.status(401).json({ error: 'errors.unauthorized' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    languagePreference: user.languagePreference,
  });
});

export default router;
