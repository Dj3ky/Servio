ALTER TABLE "settings"
  ADD COLUMN IF NOT EXISTS "backup_to_nas" boolean NOT NULL DEFAULT false;
