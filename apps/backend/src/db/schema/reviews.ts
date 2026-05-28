import { pgTable, text, timestamp, uuid, boolean, integer, date, pgEnum, unique } from 'drizzle-orm/pg-core';
import { contracts } from './contracts';
import { facilities } from './facilities';
import { users } from './users';

export const reviewStatusEnum = pgEnum('review_status', ['pending', 'in_progress', 'completed', 'failed']);

export const reviews = pgTable('reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  facilityId: uuid('facility_id').notNull().references(() => facilities.id),
  scheduledMonth: date('scheduled_month').notNull(),
  status: reviewStatusEnum('status').notNull().default('pending'),
  pdfPath: text('pdf_path'),
  pdfFilename: text('pdf_filename'),
  pdfSize: integer('pdf_size'),
  completedAt: timestamp('completed_at'),
  completedById: uuid('completed_by_id').references(() => users.id),
  notes: text('notes'),
  emailSent: boolean('email_sent').notNull().default(false),
  smbSaved: boolean('smb_saved').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  uniqueContractMonth: unique('unique_contract_month').on(table.contractId, table.scheduledMonth),
}));

export type DbReview = typeof reviews.$inferSelect;
export type DbNewReview = typeof reviews.$inferInsert;
