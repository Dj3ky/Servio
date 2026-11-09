-- Dated notes on a project, written by the assigned employee or anyone who manages projects.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_projects') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS pm_project_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
      author_id UUID REFERENCES users(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS pm_project_notes_project_idx ON pm_project_notes(project_id);
  END IF;
END $$;
