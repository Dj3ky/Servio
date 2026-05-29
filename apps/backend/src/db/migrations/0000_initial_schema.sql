-- Enums
CREATE TYPE "user_role" AS ENUM('admin', 'manager', 'accountant', 'technician');
CREATE TYPE "review_frequency" AS ENUM('monthly', 'biannual', 'quadannual', 'custom');
CREATE TYPE "invoice_delivery" AS ENUM('email', 'post', 'e_invoice');
CREATE TYPE "review_status" AS ENUM('pending', 'in_progress', 'completed', 'failed');
CREATE TYPE "invoice_status" AS ENUM('pending', 'sent_email', 'sent_post', 'completed');
CREATE TYPE "notification_type" AS ENUM('smb_failed', 'email_failed', 'backup_failed', 'review_overdue', 'invoice_waiting', 'review_completed');

--> statement-breakpoint
CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "password_hash" text NOT NULL,
  "role" "user_role" NOT NULL DEFAULT 'technician',
  "language_preference" text NOT NULL DEFAULT 'sl',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "address" text,
  "email" text,
  "phone" text,
  "contact_name" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "app_name" text NOT NULL DEFAULT 'Servio',
  "logo_url" text,
  "smtp_host" text,
  "smtp_port" integer DEFAULT 587,
  "smtp_user" text,
  "smtp_pass_encrypted" text,
  "smtp_from" text,
  "smtp_secure" boolean NOT NULL DEFAULT false,
  "smb_host" text,
  "smb_share" text,
  "smb_username" text,
  "smb_pass_encrypted" text,
  "smb_base_path" text NOT NULL DEFAULT '',
  "default_language" text NOT NULL DEFAULT 'sl',
  "backup_enabled" boolean NOT NULL DEFAULT false,
  "backup_schedule" text DEFAULT '0 2 * * *',
  "backup_path" text,
  "accounting_email" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "subject" text NOT NULL,
  "body" text NOT NULL,
  "language" text NOT NULL DEFAULT 'sl',
  "is_default" boolean NOT NULL DEFAULT false,
  "template_type" text NOT NULL DEFAULT 'review',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "is_read" boolean NOT NULL DEFAULT false,
  "entity_type" text,
  "entity_id" uuid,
  "created_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid,
  "user_email" text,
  "action" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "payload" jsonb,
  "ip_address" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "facilities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL,
  "name" text NOT NULL,
  "address" text,
  "notes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "contracts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "facility_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "contract_number" text NOT NULL UNIQUE,
  "assigned_technician_id" uuid,
  "review_frequency" "review_frequency" NOT NULL DEFAULT 'monthly',
  "custom_months" jsonb,
  "start_date" date NOT NULL,
  "end_date" date,
  "email_template_id" uuid,
  "smb_path" text,
  "value_without_vat" numeric(12, 2),
  "value_without_vat_per_year" numeric(12, 2),
  "customer_email" text,
  "invoice_delivery" "invoice_delivery" NOT NULL DEFAULT 'email',
  "contract_documents" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TABLE "reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "contract_id" uuid NOT NULL,
  "facility_id" uuid NOT NULL,
  "scheduled_month" date NOT NULL,
  "status" "review_status" NOT NULL DEFAULT 'pending',
  "pdf_path" text,
  "pdf_filename" text,
  "pdf_size" integer,
  "completed_at" timestamp,
  "completed_by_id" uuid,
  "notes" text,
  "email_sent" boolean NOT NULL DEFAULT false,
  "smb_saved" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "unique_contract_month" UNIQUE ("contract_id", "scheduled_month")
);

--> statement-breakpoint
CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "review_id" uuid NOT NULL UNIQUE,
  "contract_id" uuid NOT NULL,
  "status" "invoice_status" NOT NULL DEFAULT 'pending',
  "invoice_number" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "completed_by_id" uuid,
  "notes" text
);

--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_email_template_id_email_templates_id_fk" FOREIGN KEY ("email_template_id") REFERENCES "email_templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_completed_by_id_users_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
