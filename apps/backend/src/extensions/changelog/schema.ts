import { pgTable, text, timestamp, uuid, integer } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema/users';

export const clCategories = pgTable('cl_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#64748b'),
  orderIndex: integer('order_index').notNull().default(0),
  // Set only for the seeded defaults, so the frontend can show a translated label
  // (sl/en) instead of the literal `name`. Cleared as soon as the name is edited,
  // since a renamed category is no longer "the same" built-in one.
  translationKey: text('translation_key'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const clProjects = pgTable('cl_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  nasPath: text('nas_path'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByName: text('updated_by_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const clEntries = pgTable('cl_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => clProjects.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => clCategories.id, { onDelete: 'set null' }),
  note: text('note').notNull(),
  authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorName: text('author_name').notNull(),
  editedById: uuid('edited_by_id').references(() => users.id, { onDelete: 'set null' }),
  editedByName: text('edited_by_name'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  editedAt: timestamp('edited_at'),
  // Soft delete — kept so an accidental delete can be undone from the toast action.
  deletedAt: timestamp('deleted_at'),
});

export const clEntryAttachments = pgTable('cl_entry_attachments', {
  id: uuid('id').defaultRandom().primaryKey(),
  entryId: uuid('entry_id').notNull().references(() => clEntries.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DbClCategory = typeof clCategories.$inferSelect;
export type DbClProject = typeof clProjects.$inferSelect;
export type DbClEntry = typeof clEntries.$inferSelect;
export type DbClEntryAttachment = typeof clEntryAttachments.$inferSelect;
