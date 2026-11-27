-- Completed project whose billing is finished below the contract value; the reports then use the invoiced amount as its value.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_projects') IS NOT NULL THEN
    ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS billing_closed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
