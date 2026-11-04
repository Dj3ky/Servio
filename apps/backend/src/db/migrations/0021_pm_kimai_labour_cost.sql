-- Labour cost per Kimai entry: the entry's internal rate, which Kimai stores as a total for the entry.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_kimai_timesheets') IS NOT NULL THEN
    ALTER TABLE pm_kimai_timesheets ADD COLUMN IF NOT EXISTS internal_cost NUMERIC(12,2);
    ALTER TABLE pm_kimai_timesheets ADD COLUMN IF NOT EXISTS cost_unreliable BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
