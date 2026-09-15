import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema/users';

export const clProjects = pgTable('cl_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const clEntries = pgTable('cl_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => clProjects.id, { onDelete: 'cascade' }),
  category: text('category').notNull().default('general'),
  note: text('note').notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  editedAt: timestamp('edited_at'),
});

export type DbClProject = typeof clProjects.$inferSelect;
export type DbClEntry = typeof clEntries.$inferSelect;
