-- "Task completed" notification for whoever assigned a PM task and the project manager
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'pm_task_done';
