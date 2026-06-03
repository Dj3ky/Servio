ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "email_bounced" boolean NOT NULL DEFAULT false;
