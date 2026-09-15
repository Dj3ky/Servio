import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { createClCategorySchema, updateClCategorySchema } from '@servio/shared';
import { db } from '../../../db';
import { clCategories } from '../schema';
import { requireRole } from '../../../middleware/role';

const router = Router();
router.use(requireRole('changelog', 'access'));

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const categories = await db.select().from(clCategories).orderBy(clCategories.orderIndex, clCategories.name);
  res.json(categories);
});

router.post('/', requireRole('changelog', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = createClCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  const [category] = await db.insert(clCategories).values({
    name: parsed.data.name,
    color: parsed.data.color,
  }).returning();

  res.status(201).json(category);
});

router.patch('/:id', requireRole('changelog', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const parsed = updateClCategorySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation' }); return; }

  // Renaming a seeded default forks it into a plain custom category — it no longer
  // tracks the built-in translation, so it stops "reverting" when the UI language changes.
  const update = parsed.data.name !== undefined ? { ...parsed.data, translationKey: null } : parsed.data;

  const [category] = await db.update(clCategories)
    .set(update)
    .where(eq(clCategories.id, req.params.id))
    .returning();

  if (!category) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json(category);
});

router.delete('/:id', requireRole('changelog', 'manage'), async (req: Request, res: Response): Promise<void> => {
  const [deleted] = await db.delete(clCategories).where(eq(clCategories.id, req.params.id)).returning();
  if (!deleted) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
});

export default router;
