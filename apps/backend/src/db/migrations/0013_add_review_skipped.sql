-- Allow a scheduled review to be intentionally skipped for its month
ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'skipped';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS skip_reason TEXT;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMP;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS skipped_by_id UUID REFERENCES users(id);
