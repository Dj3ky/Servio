-- For installs that enter their real costs as Kimai's normal rates, so a cost equal to the rate is expected.
-- Skipped when the PM tables were removed; the extension recreates them at startup.
DO $$
BEGIN
  IF to_regclass('pm_kimai_config') IS NOT NULL THEN
    ALTER TABLE pm_kimai_config ADD COLUMN IF NOT EXISTS rates_are_costs BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
