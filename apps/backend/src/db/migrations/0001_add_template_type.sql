ALTER TABLE "email_templates" ADD COLUMN IF NOT EXISTS "template_type" text NOT NULL DEFAULT 'review';
