import { db } from '../db';
import { users } from '../db/schema';

interface UserAccess {
  role: string;
  isActive: boolean;
  email: string;
  name: string;
}

// Current state of every user. Requests are judged by this rather than by the login token,
// so a saved role change or deactivation applies at once.
let cache = new Map<string, UserAccess>();

export async function loadUserAccess(): Promise<void> {
  const rows = await db
    .select({ id: users.id, role: users.role, isActive: users.isActive, email: users.email, name: users.name })
    .from(users);
  cache = new Map(rows.map(({ id, ...access }) => [id, access]));
}

export function getUserAccess(userId: string): UserAccess | undefined {
  return cache.get(userId);
}
