// Domain types for tasks; logic lives elsewhere.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Periodicity = 'daily' | 'one-time';

export interface TaskReminder {
  offsetMinutes: number; // single reminder per task (minutes before deadline)
}

export interface Task {
  id: string;
  title: string;
  rarity: Rarity;
  periodicity: Periodicity;
  deadline?: string; // ISO datetime
  reminder?: TaskReminder;
  xpOverride?: number; // optional per-task XP override; otherwise use rarity defaults
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
