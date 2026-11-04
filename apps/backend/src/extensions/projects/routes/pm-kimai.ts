import { Router, Request, Response, NextFunction } from 'express';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { kimaiSettingsSchema, kimaiLinkSchema, kimaiCreateSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmKimaiConfig, pmProjects } from '../schema';
import { requireRole } from '../../../middleware/role';
import { encrypt } from '../../../utils/crypto';
import { createAuditLog } from '../../../utils/audit';
import {
  KimaiError,
  loadKimaiConnection,
  requireKimaiConnection,
  getKimaiVersion,
  listKimaiProjects,
  getKimaiProject,
  listKimaiCustomers,
  createKimaiCustomer,
  createKimaiProject,
  requireValidKimaiName,
} from '../kimai';

const router = Router();

function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch((err) => {
      if (err instanceof KimaiError) {
        res.status(err.status).json({ error: err.code, details: err.details?.length ? { kimai: err.details } : undefined });
        return;
      }
      next(err);
    });
  };
}

// The saved token only ever goes to the saved URL, so changing the URL requires entering the token again
async function connectionFromBody(body: unknown) {
  const parsed = kimaiSettingsSchema.safeParse(body);
  if (!parsed.success) throw new KimaiError('errors.kimai_invalid_url', 400);

  const { url, token } = parsed.data;
  if (token) return { url, token };

  const saved = await loadKimaiConnection();
  if (saved?.url !== url) throw new KimaiError('errors.kimai_token_required', 400);
  return saved;
}

async function findProject(id: string) {
  const [project] = await db.select({
    id: pmProjects.id,
    name: pmProjects.name,
    projectNumber: pmProjects.projectNumber,
    kimaiProjectId: pmProjects.kimaiProjectId,
  }).from(pmProjects).where(eq(pmProjects.id, id)).limit(1);
  return project;
}

// --- Connection ---

// Whether Kimai is set up — shows or hides the Hours tab and the create option
router.get('/status', requireRole('projects', 'access'), handle(async (_req, res) => {
  const [row] = await db.select({ id: pmKimaiConfig.id }).from(pmKimaiConfig).limit(1);
  res.json({ configured: !!row });
}));

router.get('/settings', requireRole('settings', 'view'), handle(async (_req, res) => {
  const [row] = await db.select({ url: pmKimaiConfig.url }).from(pmKimaiConfig).limit(1);
  res.json({ url: row?.url ?? '', tokenSet: !!row });
}));

router.put('/settings', requireRole('settings', 'manage'), handle(async (req, res) => {
  const { url, token } = await connectionFromBody(req.body);
  const values = { url, tokenEncrypted: encrypt(token), updatedAt: new Date() };

  await db.insert(pmKimaiConfig).values({ id: 1, ...values })
    .onConflictDoUpdate({ target: pmKimaiConfig.id, set: values });
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'kimai' }, req });
  res.json({ success: true });
}));

router.post('/test', requireRole('settings', 'manage'), handle(async (req, res) => {
  const connection = await connectionFromBody(req.body);
  const [version, projects, customers] = await Promise.all([
    getKimaiVersion(connection),
    listKimaiProjects(connection),
    listKimaiCustomers(connection),
  ]).catch((err) => {
    // These routes always exist in Kimai, so a 404 means the URL points somewhere else
    throw err instanceof KimaiError && err.status === 404 ? new KimaiError('errors.kimai_invalid_response') : err;
  });
  res.json({ version: version.version, projectCount: projects.length, customerCount: customers.length });
}));

// --- Kimai lists for linking and creating ---

router.get('/projects', requireRole('projects', 'manage'), handle(async (_req, res) => {
  const [kimaiProjects, linked] = await Promise.all([
    listKimaiProjects(await requireKimaiConnection()),
    db.select({
      kimaiProjectId: pmProjects.kimaiProjectId,
      id: pmProjects.id,
      projectNumber: pmProjects.projectNumber,
      name: pmProjects.name,
    }).from(pmProjects).where(isNotNull(pmProjects.kimaiProjectId)),
  ]);
  const linkedById = new Map(linked.map((p) => [p.kimaiProjectId, p]));

  res.json(kimaiProjects.map((p) => {
    const link = linkedById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      number: p.number ?? null,
      customerName: p.parentTitle ?? null,
      visible: p.visible ?? true,
      linkedTo: link ? { id: link.id, projectNumber: link.projectNumber, name: link.name } : null,
    };
  }));
}));

router.get('/customers', requireRole('projects', 'manage'), handle(async (_req, res) => {
  const customers = await listKimaiCustomers(await requireKimaiConnection());
  res.json(customers.map((c) => ({ id: c.id, name: c.name })));
}));

// --- Linking a Servio project ---

router.post('/link/:projectId', requireRole('projects', 'manage'), handle(async (req, res) => {
  const parsed = kimaiLinkSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }
  const { kimaiProjectId, moveExisting } = parsed.data;

  const project = await findProject(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const [other] = await db.select({ projectNumber: pmProjects.projectNumber, name: pmProjects.name })
    .from(pmProjects)
    .where(and(eq(pmProjects.kimaiProjectId, kimaiProjectId), ne(pmProjects.id, project.id)))
    .limit(1);
  if (other && !moveExisting) {
    res.status(409).json({ error: 'errors.kimai_already_linked', details: { kimai: [`${other.projectNumber} ${other.name}`] } });
    return;
  }

  const kimaiProject = await getKimaiProject(await requireKimaiConnection(), kimaiProjectId);

  await db.transaction(async (tx) => {
    if (other) {
      await tx.update(pmProjects)
        .set({ kimaiProjectId: null, kimaiProjectName: null, updatedAt: new Date() })
        .where(and(eq(pmProjects.kimaiProjectId, kimaiProjectId), ne(pmProjects.id, project.id)));
    }
    await tx.update(pmProjects)
      .set({ kimaiProjectId, kimaiProjectName: kimaiProject.name, updatedAt: new Date() })
      .where(eq(pmProjects.id, project.id));
  });
  res.json({ kimaiProjectId, kimaiProjectName: kimaiProject.name });
}));

// Only removes the link in Servio — nothing is changed in Kimai
router.delete('/link/:projectId', requireRole('projects', 'manage'), handle(async (req, res) => {
  const [updated] = await db.update(pmProjects)
    .set({ kimaiProjectId: null, kimaiProjectName: null, updatedAt: new Date() })
    .where(eq(pmProjects.id, req.params.projectId))
    .returning({ id: pmProjects.id });
  if (!updated) { res.status(404).json({ error: 'errors.not_found' }); return; }
  res.json({ success: true });
}));

router.post('/create/:projectId', requireRole('projects', 'manage'), handle(async (req, res) => {
  const parsed = kimaiCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const project = await findProject(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (project.kimaiProjectId !== null) { res.status(409).json({ error: 'errors.kimai_project_has_link' }); return; }

  // Checked first so an invalid project name doesn't leave a new customer behind in Kimai
  requireValidKimaiName(project.name);

  const connection = await requireKimaiConnection();
  const customerId = 'customerId' in parsed.data
    ? parsed.data.customerId
    : (await createKimaiCustomer(connection, parsed.data.newCustomerName)).id;
  const kimaiProject = await createKimaiProject(connection, { name: project.name, projectNumber: project.projectNumber, customerId });

  await db.update(pmProjects)
    .set({ kimaiProjectId: kimaiProject.id, kimaiProjectName: kimaiProject.name, updatedAt: new Date() })
    .where(eq(pmProjects.id, project.id));
  res.status(201).json({ kimaiProjectId: kimaiProject.id, kimaiProjectName: kimaiProject.name });
}));

export default router;
