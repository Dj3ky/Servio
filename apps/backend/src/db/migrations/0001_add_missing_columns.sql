-- Adds columns that were missing from the original 0000 schema.
-- All statements use IF NOT EXISTS so this is safe on both old and new databases.

ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "backup_to_nas" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "digest_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "digest_frequency" text NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS "digest_email" text,
  ADD COLUMN IF NOT EXISTS "escalation_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "escalation_days" integer NOT NULL DEFAULT 3;

--> statement-breakpoint
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "invoice_email" text,
  ADD COLUMN IF NOT EXISTS "work_order_number" text,
  ADD COLUMN IF NOT EXISTS "notes" text;

--> statement-breakpoint
ALTER TABLE "email_templates"
  ADD COLUMN IF NOT EXISTS "template_type" text NOT NULL DEFAULT 'review';

--> statement-breakpoint
DO $$ BEGIN
  ALTER TYPE "invoice_status" ADD VALUE IF NOT EXISTS 'e_invoice_created';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
