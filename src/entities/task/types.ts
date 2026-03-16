// Domain types for tasks; logic lives elsewhere.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Periodicity = 'daily' | 'weekly' | 'one-time' | 'monthly' | 'yearly';

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
  checklist?: TaskChecklistItem[];
  skillTags?: string[];
  rarity: Rarity;
  periodicity: Periodicity;
  quota?: {
    count: number;
    per: 'week' | 'month';
  };
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
