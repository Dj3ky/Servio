-- Add digest_frequency enum type
CREATE TYPE "digest_frequency" AS ENUM('daily', 'weekly');

--> statement-breakpoint
ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "digest_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "digest_frequency" "digest_frequency" NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS "digest_email" text,
  ADD COLUMN IF NOT EXISTS "escalation_enabled" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "escalation_days" integer NOT NULL DEFAULT 3;
