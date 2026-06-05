import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { rateLimit } from 'express-rate-limit';
import { loginSchema, forgotPasswordSchema, resetPasswordByTokenSchema } from '@servio/shared';
import { db } from '../db';
import { users } from '../db/schema';
import { config } from '../config';
import { createAuditLog } from '../utils/audit';
import { requireAuth } from '../middleware/auth';
import { sendMail } from '../services/email';

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

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { error: 'errors.too_many_attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/forgot-password', forgotPasswordLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }

  const { email } = parsed.data;

  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email.toLowerCase()),
  });

  // Always return success to avoid revealing whether the email exists
  if (user && user.isActive) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.update(users)
      .set({ passwordResetToken: token, passwordResetTokenExpiry: expiry, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const s = await db.query.settings.findFirst();
    const appName = s?.appName ?? 'Servio';
    const resetLink = `${config.frontendUrl}/reset-password?token=${token}`;

    await sendMail({
      to: user.email,
      subject: `${appName} – Password reset`,
      html: `
        <p>Hello ${user.name},</p>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
        <p>${appName}</p>
      `,
    }).catch((err) => console.error('[forgot-password] Email send failed:', err));
  }

  res.json({ success: true });
});

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordByTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation' });
    return;
  }

  const { token, password } = parsed.data;

  const user = await db.query.users.findFirst({
    where: (u, { eq, and, gt, isNotNull }) => and(
      eq(u.passwordResetToken, token),
      isNotNull(u.passwordResetTokenExpiry),
      gt(u.passwordResetTokenExpiry!, new Date()),
    ),
  });

  if (!user || !user.isActive) {
    res.status(400).json({ error: 'errors.invalid_reset_token' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await db.update(users)
    .set({ passwordHash, passwordResetToken: null, passwordResetTokenExpiry: null, updatedAt: new Date() })
    .where(eq(users.id, user.id));

  res.json({ success: true });
});

export default router;
