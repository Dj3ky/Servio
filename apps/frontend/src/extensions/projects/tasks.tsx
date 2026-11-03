import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { isPastDue } from './dates';

export interface PmTask {
  id: string; projectId: string; title: string;
  assigneeId: string | null; assigneeName: string | null;
  dueDate: string | null; status: 'open' | 'done';
  meetingId: string | null; meetingDate: string | null;
  completedMeetingId: string | null; completedAt: string | null;
}

export interface TaskDraft { title: string; assigneeId: string | null; dueDate: string | null; }

export function isTaskOverdue(task: { status: string; dueDate: string | null }) {
  return task.status === 'open' && isPastDue(task.dueDate);
}

export function usePmEmployees(enabled = true) {
  const { data = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['pm-employees'],
    queryFn: () => api.get('/pm/employees'),
    enabled,
  });
  return data;
}

// One task row: checkbox, title, owner, due date. Extra actions go in `children`.
export function TaskLine({
  title, assigneeName, dueDate, done, onToggle, meta, children, disabled,
}: {
  title: string; assigneeName: string | null | undefined; dueDate: string | null; done: boolean; // undefined hides the owner
  onToggle?: (done: boolean) => void; meta?: ReactNode; children?: ReactNode; disabled?: boolean;
}) {
  const { t } = useTranslation();
  const overdue = isTaskOverdue({ status: done ? 'done' : 'open', dueDate });
  return (
    <div className="flex items-center gap-2 text-xs min-h-7">
      {onToggle
        ? <Checkbox checked={done} onCheckedChange={v => onToggle(v === true)} disabled={disabled} />
        : <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${done ? 'bg-green-500' : 'bg-primary'}`} />}
      <span className={`flex-1 min-w-0 break-words ${done ? 'line-through text-muted-foreground' : ''}`}>{title}</span>
      {meta}
      {assigneeName !== undefined && <span className="text-muted-foreground shrink-0">{assigneeName ?? '—'}</span>}
      <span className={`font-mono shrink-0 w-[78px] text-right ${overdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-muted-foreground'}`}
        title={overdue ? t('pm.tasks.overdue') : undefined}>
        {dueDate ? formatDate(dueDate) : ''}
      </span>
      {children}
    </div>
  );
}

// Inline task form: title, owner, due date. With `initial` it edits an existing task.
export function TaskForm({
  defaultAssigneeId, initial, onAdd, onCancel, busy, autoFocus,
}: {
  defaultAssigneeId: string | null; initial?: TaskDraft; onAdd: (draft: TaskDraft) => void; onCancel?: () => void;
  busy?: boolean; autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const employees = usePmEmployees();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [assigneeId, setAssigneeId] = useState(initial ? initial.assigneeId ?? '' : defaultAssigneeId ?? '');
  const [dueDate, setDueDate] = useState(initial?.dueDate?.slice(0, 10) ?? '');

  function submit() {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), assigneeId: assigneeId || null, dueDate: dueDate || null });
    setTitle('');
    setDueDate('');
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        className="h-7 text-xs flex-1 min-w-[180px]"
        placeholder={t('pm.tasks.titlePlaceholder')}
        value={title}
        autoFocus={autoFocus}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
      />
      <Select value={assigneeId || '__none__'} onValueChange={v => setAssigneeId(v === '__none__' ? '' : v)}>
        <SelectTrigger className="h-7 text-xs w-[150px]" title={t('pm.tasks.assignee')}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">{t('pm.tasks.noAssignee')}</SelectItem>
          {employees.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Input type="date" className="h-7 text-xs w-[140px]" title={t('pm.tasks.dueDate')} value={dueDate} onChange={e => setDueDate(e.target.value)} />
      <Button type="button" size="sm" className="h-7 text-xs" onClick={submit} disabled={!title.trim() || busy}>
        {initial ? t('common.save') : <><Plus className="h-3 w-3 mr-1" />{t('pm.tasks.addLong')}</>}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onCancel} title={t('common.cancel')}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
