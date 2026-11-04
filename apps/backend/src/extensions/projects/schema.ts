import { pgTable, text, timestamp, uuid, boolean, date, numeric, integer, serial, unique, uniqueIndex } from 'drizzle-orm/pg-core';
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
  receivedAmount: numeric('received_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  // Manual order, set with the arrows on the Projects page; new projects go last
  sortIndex: serial('sort_index').notNull(),
  // Linked Kimai project; the name is a copy so the link still shows when Kimai is down
  kimaiProjectId: integer('kimai_project_id'),
  kimaiProjectName: text('kimai_project_name'),
  kimaiSyncedAt: timestamp('kimai_synced_at'),
  kimaiSyncError: text('kimai_sync_error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  // A Kimai project shared by two Servio projects would double-count its hours
  uniqKimaiProject: uniqueIndex('pm_projects_kimai_project_idx').on(t.kimaiProjectId),
}));

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
  direction: text('direction').notNull().default('issued'),
  invoiceDate: date('invoice_date').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Action items on a project, usually created during a weekly meeting and carried over until done
export const pmProjectTasks = pgTable('pm_project_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  dueDate: date('due_date'),
  status: text('status').notNull().default('open'),
  meetingId: uuid('meeting_id').references(() => pmWeeklyMeetings.id, { onDelete: 'set null' }),
  completedMeetingId: uuid('completed_meeting_id').references(() => pmWeeklyMeetings.id, { onDelete: 'set null' }),
  completedAt: timestamp('completed_at'),
  // When the "due tomorrow" / "overdue" reminder was sent; cleared when the due date changes or the task reopens
  dueNotifiedAt: timestamp('due_notified_at'),
  overdueNotifiedAt: timestamp('overdue_notified_at'),
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Manual display order of employee groups on the Projects page
export const pmEmployeeOrder = pgTable('pm_employee_order', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  sortIndex: integer('sort_index').notNull(),
});

// Single-row Kimai connection settings; kept here so removing the extension data removes the token too
export const pmKimaiConfig = pgTable('pm_kimai_config', {
  id: integer('id').primaryKey().default(1),
  url: text('url').notNull(),
  tokenEncrypted: text('token_encrypted').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Copy of Kimai timesheets for linked projects; hours are only ever edited in Kimai. Holds no rates.
export const pmKimaiTimesheets = pgTable('pm_kimai_timesheets', {
  id: integer('id').primaryKey(),
  projectId: uuid('project_id').notNull().references(() => pmProjects.id, { onDelete: 'cascade' }),
  entryDate: date('entry_date').notNull(),
  durationSeconds: integer('duration_seconds').notNull().default(0),
  userName: text('user_name').notNull(),
  activityName: text('activity_name'),
  description: text('description'),
});

export type DbPmCustomer =typeof pmCustomers.$inferSelect;
export type DbPmFacility = typeof pmFacilities.$inferSelect;
export type DbPmProject = typeof pmProjects.$inferSelect;
export type DbPmProjectPhase = typeof pmProjectPhases.$inferSelect;
export type DbPmWeeklyMeeting = typeof pmWeeklyMeetings.$inferSelect;
export type DbPmMeetingEntry = typeof pmMeetingEntries.$inferSelect;
export type DbPmProjectDocument = typeof pmProjectDocuments.$inferSelect;
export type DbPmProjectInvoice = typeof pmProjectInvoices.$inferSelect;
export type DbPmProjectTask = typeof pmProjectTasks.$inferSelect;
