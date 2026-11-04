import { Router, Request, Response, NextFunction } from 'express';
import { and, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { kimaiSettingsSchema, kimaiCostModeSchema, kimaiLinkSchema, kimaiCreateSchema } from '@servio/shared';
import { db } from '../../../db';
import { pmKimaiConfig, pmKimaiTimesheets, pmProjects } from '../schema';
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
  countKimaiTimesheetUsers,
  KimaiConnection,
} from '../kimai';
import { refreshProjectHours } from '../kimaiHours';

const router = Router();

const MAX_LISTED_ENTRIES = 200;
const NO_LINK = { kimaiProjectId: null, kimaiProjectName: null, kimaiSyncedAt: null, kimaiSyncError: null };

// The link itself succeeded, so a failed first refresh only shows up on the Hours tab
async function refreshAfterLink(connection: KimaiConnection, projectId: string, kimaiProjectId: number) {
  await refreshProjectHours(connection, projectId, kimaiProjectId).catch((err) => {
    if (!(err instanceof KimaiError)) console.error('[pm-kimai] Refresh after linking failed:', err);
  });
}

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
  const [row] = await db.select({ url: pmKimaiConfig.url, ratesAreCosts: pmKimaiConfig.ratesAreCosts }).from(pmKimaiConfig).limit(1);
  res.json({ url: row?.url ?? '', tokenSet: !!row, ratesAreCosts: row?.ratesAreCosts ?? false });
}));

router.patch('/settings/cost-mode', requireRole('settings', 'manage'), handle(async (req, res) => {
  const parsed = kimaiCostModeSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'errors.validation', details: parsed.error.flatten().fieldErrors }); return; }

  const [updated] = await db.update(pmKimaiConfig)
    .set({ ratesAreCosts: parsed.data.ratesAreCosts, updatedAt: new Date() })
    .returning({ id: pmKimaiConfig.id });
  if (!updated) throw new KimaiError('errors.kimai_not_configured', 409);
  await createAuditLog({ userId: req.auth!.userId, userEmail: req.auth!.email, action: 'update', entityType: 'settings', payload: { section: 'kimai', ratesAreCosts: parsed.data.ratesAreCosts }, req });
  res.json({ success: true });
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
  // One at a time, so a failure always names the first call that failed
  const [version, projects, customers, timesheetUsers] = await (async () => [
    await getKimaiVersion(connection),
    await listKimaiProjects(connection),
    await listKimaiCustomers(connection),
    await countKimaiTimesheetUsers(connection),
  ] as const)().catch((err) => {
    // These routes always exist in Kimai, so a 404 means the URL points somewhere else
    throw err instanceof KimaiError && err.status === 404 ? new KimaiError('errors.kimai_invalid_response', 502, err.details) : err;
  });
  res.json({ version: version.version, projectCount: projects.length, customerCount: customers.length, timesheetUsers });
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

  const [other] = await db.select({ id: pmProjects.id, projectNumber: pmProjects.projectNumber, name: pmProjects.name })
    .from(pmProjects)
    .where(and(eq(pmProjects.kimaiProjectId, kimaiProjectId), ne(pmProjects.id, project.id)))
    .limit(1);
  if (other && !moveExisting) {
    res.status(409).json({ error: 'errors.kimai_already_linked', details: { kimai: [`${other.projectNumber} ${other.name}`] } });
    return;
  }

  const connection = await requireKimaiConnection();
  const kimaiProject = await getKimaiProject(connection, kimaiProjectId);

  await db.transaction(async (tx) => {
    if (other) {
      await tx.delete(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, other.id));
      await tx.update(pmProjects).set({ ...NO_LINK, updatedAt: new Date() }).where(eq(pmProjects.id, other.id));
    }
    // Hours copied from a previously linked Kimai project no longer belong here
    await tx.delete(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, project.id));
    await tx.update(pmProjects)
      .set({ ...NO_LINK, kimaiProjectId, kimaiProjectName: kimaiProject.name, updatedAt: new Date() })
      .where(eq(pmProjects.id, project.id));
  });
  await refreshAfterLink(connection, project.id, kimaiProjectId);
  res.json({ kimaiProjectId, kimaiProjectName: kimaiProject.name });
}));

// Only removes the link and the copied hours in Servio — nothing is changed in Kimai
router.delete('/link/:projectId', requireRole('projects', 'manage'), handle(async (req, res) => {
  const updated = await db.transaction(async (tx) => {
    await tx.delete(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, req.params.projectId));
    const [row] = await tx.update(pmProjects)
      .set({ ...NO_LINK, updatedAt: new Date() })
      .where(eq(pmProjects.id, req.params.projectId))
      .returning({ id: pmProjects.id });
    return row;
  });
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
  await refreshAfterLink(connection, project.id, kimaiProject.id);
  res.status(201).json({ kimaiProjectId: kimaiProject.id, kimaiProjectName: kimaiProject.name });
}));

// --- Hours (the copy in Servio, so this works while Kimai is down) ---

router.get('/hours/:projectId', requireRole('projects', 'access'), handle(async (req, res) => {
  const { projectId } = req.params;
  const [project] = await db.select({ syncedAt: pmProjects.kimaiSyncedAt, syncError: pmProjects.kimaiSyncError })
    .from(pmProjects).where(eq(pmProjects.id, projectId)).limit(1);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }

  const seconds = sql<number>`coalesce(sum(${pmKimaiTimesheets.durationSeconds}), 0)::int`;
  const [totals, byUser, entries] = await Promise.all([
    db.select({ totalSeconds: seconds, entryCount: sql<number>`count(*)::int` })
      .from(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, projectId)),
    db.select({ userName: pmKimaiTimesheets.userName, seconds })
      .from(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, projectId))
      .groupBy(pmKimaiTimesheets.userName).orderBy(desc(seconds)),
    db.select({
      id: pmKimaiTimesheets.id,
      entryDate: pmKimaiTimesheets.entryDate,
      seconds: pmKimaiTimesheets.durationSeconds,
      userName: pmKimaiTimesheets.userName,
      activityName: pmKimaiTimesheets.activityName,
      description: pmKimaiTimesheets.description,
    }).from(pmKimaiTimesheets).where(eq(pmKimaiTimesheets.projectId, projectId))
      .orderBy(desc(pmKimaiTimesheets.entryDate), desc(pmKimaiTimesheets.id))
      .limit(MAX_LISTED_ENTRIES),
  ]);
  res.json({ ...project, ...totals[0], byUser, entries });
}));

// Separate from the hours above, so people without this permission never receive any cost data
router.get('/cost/:projectId', requireRole('projects', 'labourCost'), handle(async (req, res) => {
  const inProject = eq(pmKimaiTimesheets.projectId, req.params.projectId);
  const cost = sql<string>`coalesce(sum(${pmKimaiTimesheets.internalCost}), 0)`;
  const seconds = sql<number>`coalesce(sum(${pmKimaiTimesheets.durationSeconds}), 0)::int`;
  const month = sql<string>`to_char(${pmKimaiTimesheets.entryDate}, 'YYYY-MM')`;

  const [config] = await db.select({ ratesAreCosts: pmKimaiConfig.ratesAreCosts }).from(pmKimaiConfig).limit(1);
  // When rates are the real costs, only a cost of 0 still points to a missing rate
  const unreliable = config?.ratesAreCosts
    ? sql`${pmKimaiTimesheets.costUnreliable} and ${pmKimaiTimesheets.internalCost} = 0`
    : sql`${pmKimaiTimesheets.costUnreliable}`;

  const [[totals], byMonth, byUser, byActivity] = await Promise.all([
    db.select({
      totalCost: cost,
      entryCount: sql<number>`count(*)::int`,
      unknownEntries: sql<number>`(count(*) filter (where ${pmKimaiTimesheets.internalCost} is null))::int`,
      unreliableEntries: sql<number>`(count(*) filter (where ${unreliable}))::int`,
    }).from(pmKimaiTimesheets).where(inProject),
    db.select({ month, cost, seconds }).from(pmKimaiTimesheets).where(inProject).groupBy(month).orderBy(month),
    db.select({ userName: pmKimaiTimesheets.userName, cost, seconds })
      .from(pmKimaiTimesheets).where(inProject)
      .groupBy(pmKimaiTimesheets.userName).orderBy(desc(cost)),
    db.select({ activityName: pmKimaiTimesheets.activityName, cost, seconds })
      .from(pmKimaiTimesheets).where(inProject)
      .groupBy(pmKimaiTimesheets.activityName).orderBy(desc(cost)),
  ]);
  res.json({ ...totals, byMonth, byUser, byActivity });
}));

router.post('/hours/:projectId/refresh', requireRole('projects', 'access'), handle(async (req, res) => {
  const project = await findProject(req.params.projectId);
  if (!project) { res.status(404).json({ error: 'errors.not_found' }); return; }
  if (project.kimaiProjectId === null) { res.status(409).json({ error: 'errors.kimai_project_not_linked' }); return; }

  await refreshProjectHours(await requireKimaiConnection(), project.id, project.kimaiProjectId);
  res.json({ success: true });
}));

export default router;
