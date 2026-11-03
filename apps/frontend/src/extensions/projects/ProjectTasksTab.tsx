import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TaskLine, TaskForm, type PmTask, type TaskDraft } from './tasks';

export function ProjectTasksTab({ projectId, tasks, defaultAssigneeId }: {
  projectId: string; tasks: PmTask[]; defaultAssigneeId: string | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pm-project-tasks', projectId] });
    qc.invalidateQueries({ queryKey: ['pm-meeting-tasks'] });
    qc.invalidateQueries({ queryKey: ['pm-my-tasks'] });
    qc.invalidateQueries({ queryKey: ['pm-my-task-count'] });
    qc.invalidateQueries({ queryKey: ['pm-projects'] });
  }

  const addTask = useMutation({
    mutationFn: (draft: TaskDraft) => api.post(`/pm/projects/${projectId}/tasks`, draft),
    onSuccess: () => { invalidate(); toast.success(t('pm.tasks.addedOk')); },
    onError: () => toast.error(t('pm.tasks.error')),
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Partial<TaskDraft> & { status?: 'open' | 'done' } }) =>
      api.patch(`/pm/projects/${projectId}/tasks/${taskId}`, body),
    onSuccess: (_data, { body }) => {
      invalidate();
      if (!body.status) { toast.success(t('pm.tasks.updatedOk')); setEditingId(null); }
    },
    onError: () => toast.error(t('pm.tasks.error')),
  });

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api.delete(`/pm/projects/${projectId}/tasks/${taskId}`),
    onSuccess: () => { invalidate(); toast.success(t('pm.tasks.deletedOk')); },
    onError: () => toast.error(t('pm.tasks.error')),
  });

  const open = tasks.filter(task => task.status === 'open');
  const done = tasks.filter(task => task.status === 'done');

  function renderTask(task: PmTask) {
    if (editingId === task.id) {
      return (
        <div key={task.id} className="p-2 rounded-md border bg-card">
          <TaskForm
            autoFocus
            defaultAssigneeId={null}
            initial={{ title: task.title, assigneeId: task.assigneeId, dueDate: task.dueDate }}
            busy={updateTask.isPending}
            onAdd={body => updateTask.mutate({ taskId: task.id, body })}
            onCancel={() => setEditingId(null)}
          />
        </div>
      );
    }
    return (
      <div key={task.id} className="px-3 py-1.5 rounded-md border bg-card">
        <TaskLine
          title={task.title}
          assigneeName={task.assigneeName}
          dueDate={task.dueDate}
          done={task.status === 'done'}
          disabled={updateTask.isPending}
          onToggle={isDone => updateTask.mutate({ taskId: task.id, body: { status: isDone ? 'done' : 'open' } })}
          meta={task.meetingDate && <span className="text-muted-foreground shrink-0">{t('pm.tasks.fromMeeting', { date: formatDate(task.meetingDate) })}</span>}
        >
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingId(task.id)} title={t('common.edit')}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive shrink-0" title={t('common.delete')}
            onClick={() => { if (confirm(t('pm.tasks.deleteConfirm'))) deleteTask.mutate(task.id); }}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </TaskLine>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="p-4">
          <TaskForm defaultAssigneeId={defaultAssigneeId} busy={addTask.isPending} onAdd={draft => addTask.mutate(draft)} />
        </CardContent>
      </Card>

      {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t('common.noData')}</p>}

      {open.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">{t('pm.tasks.open')} ({open.length})</p>
          {open.map(renderTask)}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t('pm.tasks.done')} ({done.length})</p>
          {done.map(renderTask)}
        </div>
      )}
    </div>
  );
}
