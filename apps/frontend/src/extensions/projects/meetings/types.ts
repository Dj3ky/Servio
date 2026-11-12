import type { PmTask, TaskDraft } from '../tasks';

export type EntryStatus = 'active' | 'on_hold' | 'completed';
export const ENTRY_STATUSES: EntryStatus[] = ['active', 'on_hold', 'completed'];

export interface MeetingListItem {
  id: string; meetingDate: string; notes: string | null;
  createdByName: string | null; createdAt: string;
  projectCount: number; notedCount: number; completedCount: number; onHoldCount: number;
  tasksCreated: number; tasksClosed: number;
}

export interface MeetingSummary {
  lastMeetingDate: string | null; activeProjects: number; openTasks: number; overdueTasks: number;
}

export interface MeetingEntry {
  id: string; projectId: string; projectNumber: string; projectName: string;
  projectPriority: string; entryStatus: EntryStatus; notes: string | null;
  projectSortIndex: number;
  employeeId: string | null; employeeName: string | null;
}

export interface MeetingDetail {
  id: string; meetingDate: string; notes: string | null;
  createdByName: string | null; createdAt: string;
  entries: MeetingEntry[];
  tasks: PmTask[];
  prev: { id: string; meetingDate: string } | null;
  next: { id: string; meetingDate: string } | null;
}

export interface ActiveProject {
  id: string; projectNumber: string; name: string; priority: string; status: string; sortIndex: number;
  notes: string | null;
  employeeId: string | null; employeeName: string | null;
  lastEntryStatus: string | null; lastEntryNotes: string | null; lastMeetingDate: string | null;
}

// One project row in the new / edit meeting form
export interface FormEntry {
  projectId: string; projectNumber: string; projectName: string; sortIndex: number;
  employeeId: string | null; employeeName: string | null;
  entryStatus: EntryStatus; notes: string;
  lastEntryNotes: string | null; lastMeetingDate: string | null;
  projectNotes: string | null;
}

export type NewTaskDraft = TaskDraft & { key: string; projectId: string };
