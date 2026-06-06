ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "smb_path_template" text NOT NULL DEFAULT '{year}/{contract_number}/{year_month}_{filename}';
