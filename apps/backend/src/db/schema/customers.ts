import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
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

export type DbCustomer = typeof customers.$inferSelect;
export type DbNewCustomer = typeof customers.$inferInsert;
