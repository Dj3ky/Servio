import { relations } from 'drizzle-orm';
import { users } from './users';
import { customers } from './customers';
import { facilities } from './facilities';
import { contracts } from './contracts';
import { reviews } from './reviews';
import { invoices } from './invoices';
import { emailTemplates } from './emailTemplates';
import { auditLogs } from './auditLogs';

export const usersRelations = relations(users, ({ many }) => ({
  assignedContracts: many(contracts),
  completedReviews: many(reviews),
  completedInvoices: many(invoices),
  auditLogs: many(auditLogs),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  facilities: many(facilities),
  contracts: many(contracts),
}));

export const facilitiesRelations = relations(facilities, ({ one, many }) => ({
  customer: one(customers, { fields: [facilities.customerId], references: [customers.id] }),
  contracts: many(contracts),
  reviews: many(reviews),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ many }) => ({
  contracts: many(contracts),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  facility: one(facilities, { fields: [contracts.facilityId], references: [facilities.id] }),
  customer: one(customers, { fields: [contracts.customerId], references: [customers.id] }),
  assignedTechnician: one(users, { fields: [contracts.assignedTechnicianId], references: [users.id] }),
  emailTemplate: one(emailTemplates, { fields: [contracts.emailTemplateId], references: [emailTemplates.id] }),
  reviews: many(reviews),
  invoices: many(invoices),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  contract: one(contracts, { fields: [reviews.contractId], references: [contracts.id] }),
  facility: one(facilities, { fields: [reviews.facilityId], references: [facilities.id] }),
  completedBy: one(users, { fields: [reviews.completedById], references: [users.id] }),
  invoice: one(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  review: one(reviews, { fields: [invoices.reviewId], references: [reviews.id] }),
  contract: one(contracts, { fields: [invoices.contractId], references: [contracts.id] }),
  completedBy: one(users, { fields: [invoices.completedById], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));
