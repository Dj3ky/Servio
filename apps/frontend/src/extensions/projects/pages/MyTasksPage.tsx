import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { usePermissionsStore } from '@/stores/permissionsStore';
import { TaskLine, TaskForm, isTaskOverdue, usePmEmployees, usePendingTaskIds, type PmTask, type TaskDraft } from '../tasks';

type TaskWithProject = PmTask & { projectNumber: string; projectName: string };

// Must match RECENT_DONE_LIMIT in the backend's pm-tasks route
const DONE_LIMIT = 50;

export default function MyTasksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore(s => s.user);
  const perms = usePermissionsStore(s => s.perms);
  const canManage = !!user && (perms.projects?.manage ?? []).includes(user.role);
  const employees = usePmEmployees(canManage);

  const [assignee, setAssignee] = useState('me');
  const [showDone, setShowDone] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const pending = usePendingTaskIds();

  const { data: tasks = [], isLoading } = useQuery<TaskWithProject[]>({
    queryKey: ['pm-my-tasks', assignee, showDone],
    queryFn: () => api.get(`/pm/tasks?assignee=${assignee}&status=${showDone ? 'all' : 'open'}`),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['pm-my-tasks'] });
    qc.invalidateQueries({ queryKey: ['pm-my-task-count'] });
    qc.invalidateQueries({ queryKey: ['notifications'] });
    qc.invalidateQueries({ queryKey: ['pm-project-tasks'] });
    qc.invalidateQueries({ queryKey: ['pm-meeting-tasks'] });
    qc.invalidateQueries({ queryKey: ['pm-projects'] });
  }

  const toggle = useMutation({
    mutationFn: ({ taskId, done }: { taskId: string; done: boolean }) =>
      api.patch(`/pm/tasks/${taskId}/status`, { status: done ? 'done' : 'open' }),
    onMutate: ({ taskId }) => pending.setPending(taskId, true),
    onSettled: (_data, _err, { taskId }) => pending.setPending(taskId, false),
    onSuccess: (_data, { taskId, done }) => {
      if (done) {
        toast(tItem => (
          <div className="flex items-center gap-3">
            <span className="text-sm">{t('pm.tasks.completedOk')}</span>
            <button
              className="text-sm font-medium underline shrink-0"
              onClick={() => { toggle.mutate({ taskId, done: false }); toast.dismiss(tItem.id); }}
            >
              {t('common.undo')}
            </button>
          </div>
        ), { duration: 6000 });
      }
      invalidate();
    },
    onError: () => toast.error(t('pm.tasks.error')),
  });

  // Editing title / owner / due date — project managers only (same rule as the project Tasks tab)
  const updateTask = useMutation({
    mutationFn: ({ task, body }: { task: TaskWithProject; body: TaskDraft }) =>
      api.patch(`/pm/projects/${task.projectId}/tasks/${task.id}`, body),
    onSuccess: () => { invalidate(); toast.success(t('pm.tasks.updatedOk')); setEditingId(null); },
    onError: () => toast.error(t('pm.tasks.error')),
  });

  const overdue = tasks.filter(task => isTaskOverdue(task));
  const open = tasks.filter(task => task.status === 'open' && !isTaskOverdue(task));
  const done = tasks
    .filter(task => task.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  function renderTask(task: TaskWithProject) {
    if (editingId === task.id) {
      return (
        <div key={task.id} className="p-2 rounded-md border bg-card">
          <TaskForm
            autoFocus
            defaultAssigneeId={null}
            initial={{ title: task.title, assigneeId: task.assigneeId, dueDate: task.dueDate }}
            busy={updateTask.isPending}
            onAdd={body => updateTask.mutate({ task, body })}
            onCancel={() => setEditingId(null)}
          />
        </div>
      );
    }
    return (
      <div key={task.id} className="px-3 py-1.5 rounded-md border bg-card">
        <TaskLine
          title={task.title}
          assigneeName={assignee === 'me' ? undefined : task.assigneeName}
          dueDate={task.dueDate}
          completedAt={task.completedAt}
          done={task.status === 'done'}
          disabled={pending.isPending(task.id)}
          onToggle={isDone => toggle.mutate({ taskId: task.id, done: isDone })}
          meta={
            <button type="button" className="text-muted-foreground hover:underline shrink-0 max-w-[40%] truncate text-left"
              onClick={() => navigate(`/pm/projects/${task.projectId}`)} title={`${task.projectNumber} · ${task.projectName}`}>
              {task.projectName}
              {task.meetingDate && <span className="ml-1.5">· {t('pm.tasks.fromMeeting', { date: formatDate(task.meetingDate) })}</span>}
            </button>
          }
        >
          {canManage && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setEditingId(task.id)} title={t('common.edit')}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </TaskLine>
      </div>
    );
  }

  function renderSection(title: string, list: TaskWithProject[], className = '', countLabel = String(list.length)) {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2">
        <p className={`text-sm font-medium ${className}`}>{title} ({countLabel})</p>
        {list.map(renderTask)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t('pm.tasks.myTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('pm.tasks.mySubtitle')}</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {canManage && (
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me">{t('pm.tasks.filterMine')}</SelectItem>
                <SelectItem value="all">{t('pm.tasks.filterAll')}</SelectItem>
                {employees.filter(u => u.id !== user?.id).map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox checked={showDone} onCheckedChange={v => setShowDone(v === true)} />
            {t('pm.tasks.showDone')}
          </label>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && tasks.length === 0 && <p className="text-sm text-muted-foreground">{t('pm.tasks.noneOpen')}</p>}

      {renderSection(t('pm.tasks.overdue'), overdue, 'text-red-600 dark:text-red-400')}
      {renderSection(t('pm.tasks.open'), open)}
      {renderSection(t('pm.tasks.done'), done, 'text-muted-foreground',
        done.length >= DONE_LIMIT ? t('pm.tasks.latestCount', { count: DONE_LIMIT }) : undefined)}
    </div>
  );
}
