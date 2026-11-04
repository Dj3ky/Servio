-- Manual project order, set with the arrows on the Projects page. New projects go last.
-- Existing projects keep their current order, oldest first.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_projects') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'pm_projects' AND column_name = 'sort_index'
  ) THEN
    ALTER TABLE pm_projects ADD COLUMN sort_index SERIAL;
    UPDATE pm_projects p SET sort_index = o.position
    FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS position FROM pm_projects) o
    WHERE p.id = o.id;
  END IF;
END $$;
