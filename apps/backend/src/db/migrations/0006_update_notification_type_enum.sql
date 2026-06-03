-- Remove notifications of types being dropped
DELETE FROM notifications WHERE type IN ('invoice_waiting', 'review_completed');

-- Recreate enum with email_bounced replacing the removed types
CREATE TYPE notification_type_new AS ENUM ('smb_failed', 'email_failed', 'backup_failed', 'review_overdue', 'email_bounced');

ALTER TABLE notifications
  ALTER COLUMN type TYPE notification_type_new
  USING type::text::notification_type_new;

DROP TYPE notification_type;
ALTER TYPE notification_type_new RENAME TO notification_type;
