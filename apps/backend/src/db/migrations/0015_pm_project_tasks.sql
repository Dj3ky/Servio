-- Project action items, usually created in weekly meetings and carried over until done
CREATE TABLE IF NOT EXISTS pm_project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open',
  meeting_id UUID REFERENCES pm_weekly_meetings(id) ON DELETE SET NULL,
  completed_meeting_id UUID REFERENCES pm_weekly_meetings(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,
  created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pm_project_tasks_project_idx ON pm_project_tasks(project_id);
