-- Copy of Kimai timesheets for linked projects, so hours stay fast and available when Kimai is down.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_projects') IS NOT NULL THEN
    ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS kimai_synced_at TIMESTAMP;
    ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS kimai_sync_error TEXT;
    CREATE TABLE IF NOT EXISTS pm_kimai_timesheets (
      id INTEGER PRIMARY KEY,
      project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
      entry_date DATE NOT NULL,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      user_name TEXT NOT NULL,
      activity_name TEXT,
      description TEXT
    );
    CREATE INDEX IF NOT EXISTS pm_kimai_timesheets_project_idx ON pm_kimai_timesheets(project_id);
  END IF;
END $$;
