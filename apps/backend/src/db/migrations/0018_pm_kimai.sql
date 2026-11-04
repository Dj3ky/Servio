-- Kimai link on projects and the connection settings for it.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_projects') IS NOT NULL THEN
    ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS kimai_project_id INTEGER;
    ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS kimai_project_name TEXT;
    -- A Kimai project shared by two Servio projects would double-count its hours
    CREATE UNIQUE INDEX IF NOT EXISTS pm_projects_kimai_project_idx ON pm_projects(kimai_project_id);
    CREATE TABLE IF NOT EXISTS pm_kimai_config (
      id INTEGER PRIMARY KEY DEFAULT 1,
      url TEXT NOT NULL,
      token_encrypted TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  END IF;
END $$;
