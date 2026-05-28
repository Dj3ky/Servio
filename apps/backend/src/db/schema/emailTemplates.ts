import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const emailTemplates = pgTable('email_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  language: text('language').notNull().default('sl'),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type DbEmailTemplate = typeof emailTemplates.$inferSelect;
export type DbNewEmailTemplate = typeof emailTemplates.$inferInsert;
