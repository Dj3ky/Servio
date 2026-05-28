import { pgTable, text, timestamp, uuid, boolean, numeric, date, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { customers } from './customers';
import { facilities } from './facilities';
import { users } from './users';
import { emailTemplates } from './emailTemplates';

export const reviewFrequencyEnum = pgEnum('review_frequency', ['monthly', 'biannual', 'quadannual', 'custom']);

export const contracts = pgTable('contracts', {
  id: uuid('id').defaultRandom().primaryKey(),
  facilityId: uuid('facility_id').notNull().references(() => facilities.id),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  contractNumber: text('contract_number').notNull().unique(),
  assignedTechnicianId: uuid('assigned_technician_id').references(() => users.id),
  reviewFrequency: reviewFrequencyEnum('review_frequency').notNull().default('monthly'),
  customMonths: jsonb('custom_months').$type<number[]>(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  emailTemplateId: uuid('email_template_id').references(() => emailTemplates.id),
  smbPath: text('smb_path'),
  valueWithoutVat: numeric('value_without_vat', { precision: 12, scale: 2 }),
  valueWithoutVatPerYear: numeric('value_without_vat_per_year', { precision: 12, scale: 2 }),
  customerEmail: text('customer_email'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type DbContract = typeof contracts.$inferSelect;
export type DbNewContract = typeof contracts.$inferInsert;
