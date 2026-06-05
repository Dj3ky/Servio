ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_reset_token_expiry" timestamp;
