-- Columns previously only added at server startup; the seed needs them to insert the settings row
ALTER TABLE settings ADD COLUMN IF NOT EXISTS backup_nas_path TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS permissions_config JSONB;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS audit_log_retention_months INTEGER NOT NULL DEFAULT 0;
-- Every settings update targets id = 1, so the row must exist
INSERT INTO settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
