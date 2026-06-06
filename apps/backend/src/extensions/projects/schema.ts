import { pgTable, text, timestamp, uuid, boolean, date, numeric, integer, unique } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema/users';

export const pmCustomers = pgTable('pm_customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  email: text('email'),
  phone: text('phone'),
  contactName: text('contact_name'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pmFacilities = pgTable('pm_facilities', {
  id: uuid('id').defaultRandom().primaryKey(),
  pmCustomerId: uuid('pm_customer_id').references(() => pmCustomers.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pmProjects = pgTable('pm_projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectNumber: text('project_number').notNull(),
  name: text('name').notNull(),
  orderDate: date('order_date'),
  employeeId: uuid('employee_id').references(() => users.id, { onDelete: 'set null' }),
  customerName: text('customer_name'),
  facilityName: text('facility_name'),
  priority: text('priority').notNull().default('medium'),
  status: text('status').notNull().default('active'),
  startDate: date('start_date'),
  endDate: date('end_date'),
  contractValue: numeric('contract_value', { precision: 12, scale: 2 }),
  invoicedAmount: numeric('invoiced_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pmProjectPhases = pgTable('pm_project_phases', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pmWeeklyMeetings = pgTable('pm_weekly_meetings', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetingDate: date('meeting_date').notNull(),
  notes: text('notes'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const pmMeetingEntries = pgTable('pm_meeting_entries', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetingId: uuid('meeting_id').notNull().references(() => pmWeeklyMeetings.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  entryStatus: text('entry_status').notNull().default('in_progress'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  uniqMeetingProject: unique().on(t.meetingId, t.projectId),
}));

export const pmProjectDocuments = pgTable('pm_project_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  uploadedById: uuid('uploaded_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const pmProjectInvoices = pgTable('pm_project_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  invoiceDate: date('invoice_date').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DbPmCustomer = typeof pmCustomers.$inferSelect;
export type DbPmFacility = typeof pmFacilities.$inferSelect;
export type DbPmProject = typeof pmProjects.$inferSelect;
export type DbPmProjectPhase = typeof pmProjectPhases.$inferSelect;
export type DbPmWeeklyMeeting = typeof pmWeeklyMeetings.$inferSelect;
export type DbPmMeetingEntry = typeof pmMeetingEntries.$inferSelect;
export type DbPmProjectDocument = typeof pmProjectDocuments.$inferSelect;
