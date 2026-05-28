import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createUserSchema, updateUserSchema, resetPasswordSchema } from '@servio/shared';
import { db } from '../db';
import { users } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/role';
import { createAuditLog } from '../utils/audit';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole('admin', 'manager'), async (_req: Request, res: Response): Promise<void> => {
  const result = await db.query.users.findMany({
    orderBy: (u, { asc }) => [asc(u.name)],
  });

  res.json(result.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    languagePreference: u.languagePreference,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  })));
});

router.post('/', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { email, name, password, role, languagePreference } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.email, email.toLowerCase()),
  });
  if (existing) {
    res.status(409).json({ error: 'errors.email_taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(users)
    .values({ email: email.toLowerCase(), name, passwordHash, role, languagePreference })
    .returning();

  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: 'create',
    entityType: 'user',
    entityId: user.id,
    payload: { email: user.email, role: user.role },
    req,
  });

  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

router.patch('/:id', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { id } = req.params;
  const updates: Partial<typeof users.$inferInsert> = {};

  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.languagePreference !== undefined) updates.languagePreference = parsed.data.languagePreference;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  updates.updatedAt = new Date();

  const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: 'errors.not_found' });
    return;
  }

  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: parsed.data.isActive === false ? 'deactivate_user' : 'update',
    entityType: 'user',
    entityId: id,
    payload: parsed.data as Record<string, unknown>,
    req,
  });

  res.json({ id: updated.id, email: updated.email, name: updated.name, role: updated.role, isActive: updated.isActive });
});

router.post('/:id/reset-password', requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors });
    return;
  }

  const { id } = req.params;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: 'errors.not_found' });
    return;
  }

  await createAuditLog({
    userId: req.auth!.userId,
    userEmail: req.auth!.email,
    action: 'reset_password',
    entityType: 'user',
    entityId: id,
    req,
  });

  res.json({ success: true });
});

export default router;
