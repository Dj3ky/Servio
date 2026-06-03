ALTER TABLE "reviews"
  ADD COLUMN IF NOT EXISTS "files_json" jsonb;
