-- Configurable backup retention: N most recent, plus one per calendar month for M months before that
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_keep_recent INTEGER NOT NULL DEFAULT 30;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_keep_monthly INTEGER NOT NULL DEFAULT 12;
