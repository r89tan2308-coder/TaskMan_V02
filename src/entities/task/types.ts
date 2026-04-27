// Domain types for tasks; logic lives elsewhere.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Periodicity = 'daily' | 'weekly' | 'one-time' | 'monthly' | 'yearly';
export type TaskBucket = 'inbox' | 'today' | 'next' | 'backlog';
export type AllowedWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface TaskReminder {
  offsetMinutes: number; // single reminder per task (minutes before deadline)
}

export type TaskChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  order: number;
};

export interface Task {
  id: string;
  title: string;
  comment?: string;
  projectId?: string | null;
  checklist?: TaskChecklistItem[];
  skillTags?: string[];
  bucket: TaskBucket;
  rarity: Rarity;
  periodicity: Periodicity;
  quota?: {
    count: number;
    per: 'week' | 'month';
  };
  allowedWeekdays?: AllowedWeekday[];
  deadline?: string; // ISO datetime
  reminder?: TaskReminder;
  xpOverride?: number; // optional per-task XP override; otherwise use rarity defaults
  progressEnabled?: boolean;
  progressValue?: number; // 0-100 percent when enabled
  sortOrder?: number; // manual ordering value; higher means closer to top
  archived?: boolean; // hidden from active lists when true
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
