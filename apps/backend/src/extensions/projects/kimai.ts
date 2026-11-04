import { kimaiSafeName } from '@servio/shared';
import { db } from '../../db';
import { decrypt } from '../../utils/crypto';
import { pmKimaiConfig } from './schema';

const TIMEOUT_MS = 20_000;
const MAX_NUMBER_LENGTH = 10;
const TIMESHEET_PAGE_SIZE = 500;
const TLS_ERROR_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Kimai's customer form needs these and Servio has no such fields
const NEW_CUSTOMER_DEFAULTS = { country: 'SI', currency: 'EUR', timezone: 'Europe/Ljubljana' };

export interface KimaiConnection { url: string; token: string; }
export interface KimaiCustomer { id: number; name: string; }
export interface KimaiProject {
  id: number;
  name: string;
  number?: string | null;
  visible?: boolean;
  parentTitle?: string | null;
}

// With full=1 user and activity are objects; without it they are plain IDs
export interface KimaiTimesheet {
  id: number;
  begin: string;
  duration?: number | null;
  description?: string | null;
  user: number | { id: number; alias?: string | null; username?: string | null };
  activity?: number | { name?: string | null } | null;
}

// Status is what Servio answers its own client. Never 401: the frontend treats that as an expired Servio session.
export class KimaiError extends Error {
  constructor(public code: string, public status = 502, public details?: string[]) {
    super(code);
    this.name = 'KimaiError';
  }
}

export async function loadKimaiConnection(): Promise<KimaiConnection | null> {
  const [row] = await db.select().from(pmKimaiConfig).limit(1);
  return row ? { url: row.url, token: decrypt(row.tokenEncrypted) } : null;
}

export async function requireKimaiConnection(): Promise<KimaiConnection> {
  const connection = await loadKimaiConnection();
  if (!connection) throw new KimaiError('errors.kimai_not_configured', 409);
  return connection;
}

// Flattens Kimai's nested form errors into "field: message" lines
function formErrors(node: unknown, field?: string): string[] {
  if (!node || typeof node !== 'object') return [];
  const { errors, children } = node as { errors?: unknown; children?: Record<string, unknown> };
  const own = Array.isArray(errors)
    ? errors.filter((m): m is string => typeof m === 'string').map((m) => (field ? `${field}: ${m}` : m))
    : formErrors(errors, field);
  return [...own, ...Object.entries(children ?? {}).flatMap(([name, child]) => formErrors(child, name))];
}

// A JSON answer carries Kimai's own reason; anything else most likely came from a web server or firewall in front of it
async function forbiddenError(res: Response, request: string): Promise<KimaiError> {
  const text = await res.text();
  try {
    const { message } = JSON.parse(text) as { message?: string };
    return new KimaiError('errors.kimai_forbidden', 502, [message ? `${request}: ${message}` : request]);
  } catch {
    return new KimaiError('errors.kimai_blocked', 502, [request]);
  }
}

async function kimaiRequest<T>(connection: KimaiConnection, method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${connection.url}/api${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Accept: 'application/json',
        'User-Agent': 'Servio',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const code = (err as { cause?: { code?: string } }).cause?.code;
    throw new KimaiError(code && TLS_ERROR_CODES.has(code) ? 'errors.kimai_certificate' : 'errors.kimai_unavailable');
  }

  if (res.status === 401) throw new KimaiError('errors.kimai_unauthorized');
  const request = `${method} /api${path.split('?')[0]}`;
  if (res.status === 403) throw await forbiddenError(res, request);
  if (res.status === 404) throw new KimaiError('errors.kimai_not_found', 404, [`${request}: HTTP 404`]);
  if (res.status >= 300 && res.status < 400) {
    throw new KimaiError('errors.kimai_invalid_response', 502, [`${request}: HTTP ${res.status} -> ${res.headers.get('location') ?? '?'}`]);
  }
  if (res.status >= 500) throw new KimaiError('errors.kimai_unavailable');

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // An HTML page here usually means the URL points at something other than Kimai
    throw new KimaiError('errors.kimai_invalid_response', 502, [`${request}: HTTP ${res.status}, ${res.headers.get('content-type') ?? '?'}`]);
  }
  if (!res.ok) throw new KimaiError('errors.kimai_rejected', 422, formErrors(data));
  return data as T;
}

export function getKimaiVersion(connection: KimaiConnection) {
  return kimaiRequest<{ version: string; versionId: number }>(connection, 'GET', '/version');
}

// All projects, including hidden and ended ones, so an existing project can always be linked
export function listKimaiProjects(connection: KimaiConnection) {
  return kimaiRequest<KimaiProject[]>(connection, 'GET', '/projects?visible=3&ignoreDates=1&orderBy=name');
}

export function getKimaiProject(connection: KimaiConnection, id: number) {
  return kimaiRequest<KimaiProject>(connection, 'GET', `/projects/${id}`);
}

// Finished entries of one project from everyone; running timers count once they are stopped.
// Sorted by ID so entries don't shift between pages while reading.
export async function listKimaiTimesheets(connection: KimaiConnection, projectId: number): Promise<KimaiTimesheet[]> {
  const all: KimaiTimesheet[] = [];
  for (let page = 1; ; page++) {
    const query = `project=${projectId}&user=all&active=0&full=1&orderBy=id&order=ASC&size=${TIMESHEET_PAGE_SIZE}&page=${page}`;
    let batch: KimaiTimesheet[];
    try {
      batch = await kimaiRequest<KimaiTimesheet[]>(connection, 'GET', `/timesheets?${query}`);
    } catch (err) {
      // Kimai answers 404 for a page past the end, which happens when the last page was exactly full
      if (page > 1 && err instanceof KimaiError && err.status === 404) return all;
      throw err;
    }
    all.push(...batch);
    if (batch.length < TIMESHEET_PAGE_SIZE) return all;
  }
}

// Without view_other_timesheet Kimai ignores user=all and silently returns only the token owner's entries,
// so the connection test counts how many people it can see in a recent sample
export async function countKimaiTimesheetUsers(connection: KimaiConnection): Promise<number> {
  const sample = await kimaiRequest<KimaiTimesheet[]>(connection, 'GET', `/timesheets?user=all&size=${TIMESHEET_PAGE_SIZE}`);
  return new Set(sample.map((t) => (typeof t.user === 'object' ? t.user.id : t.user))).size;
}

export function listKimaiCustomers(connection: KimaiConnection) {
  return kimaiRequest<KimaiCustomer[]>(connection, 'GET', '/customers?visible=1&orderBy=name');
}

export function requireValidKimaiName(name: string): string {
  const safe = kimaiSafeName(name);
  if (safe.length < 2) throw new KimaiError('errors.kimai_name_invalid', 422);
  return safe;
}

export async function createKimaiCustomer(connection: KimaiConnection, name: string) {
  return kimaiRequest<KimaiCustomer>(connection, 'POST', '/customers', {
    name: requireValidKimaiName(name),
    ...NEW_CUSTOMER_DEFAULTS,
    visible: true,
    billable: true,
  });
}

export async function createKimaiProject(connection: KimaiConnection, project: { name: string; projectNumber: string; customerId: number }) {
  const number = kimaiSafeName(project.projectNumber);
  return kimaiRequest<KimaiProject>(connection, 'POST', '/projects', {
    name: requireValidKimaiName(project.name),
    customer: project.customerId,
    // Kimai's number field is short; longer work order numbers are left out rather than cut
    ...(number && number.length <= MAX_NUMBER_LENGTH ? { number } : {}),
    visible: true,
    billable: true,
    globalActivities: true,
  });
}
