import { pgTable, text, timestamp, uuid, pgEnum } from 'drizzle-orm/pg-core';
import { reviews } from './reviews';
import { contracts } from './contracts';
import { users } from './users';

export const invoiceStatusEnum = pgEnum('invoice_status', ['pending', 'sent_email', 'sent_post', 'completed']);

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewId: uuid('review_id').notNull().unique().references(() => reviews.id),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  status: invoiceStatusEnum('status').notNull().default('pending'),
  invoiceNumber: text('invoice_number'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  completedById: uuid('completed_by_id').references(() => users.id),
  notes: text('notes'),
});

export type DbInvoice = typeof invoices.$inferSelect;
export type DbNewInvoice = typeof invoices.$inferInsert;
