import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';
import { customers } from './customers';

export const facilities = pgTable('facilities', {
  id: uuid('id').defaultRandom().primaryKey(),
  customerId: uuid('customer_id').notNull().references(() => customers.id),
  name: text('name').notNull(),
  address: text('address'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type DbFacility = typeof facilities.$inferSelect;
export type DbNewFacility = typeof facilities.$inferInsert;
