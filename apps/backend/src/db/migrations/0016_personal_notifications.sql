-- Personal notifications: user_id set = only that user sees it, null = shared system notification
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications (user_id);
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_due';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_overdue';
