-- The PM task a notification is about, so it can be marked read when the task closes
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS task_id UUID;
CREATE INDEX IF NOT EXISTS notifications_task_id_idx ON notifications (task_id);
