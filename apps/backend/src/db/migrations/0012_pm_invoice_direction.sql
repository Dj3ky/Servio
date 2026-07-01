-- Split project invoices into issued vs received, add received total to projects
ALTER TABLE pm_project_invoices ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'issued';
ALTER TABLE pm_projects ADD COLUMN IF NOT EXISTS received_amount NUMERIC(12,2) NOT NULL DEFAULT 0;
