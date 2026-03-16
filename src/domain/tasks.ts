// Domain types for tasks; logic is defined elsewhere.
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Periodicity = 'daily' | 'weekly' | 'one-time' | 'monthly' | 'yearly';

export interface TaskReminder {
  offsetMinutes: number; // minutes before deadline to notify (single reminder per task)
}

export interface Task {
  id?: number;
  title: string;
  comment?: string;
  skillTags?: string[];
  rarity: Rarity;
  periodicity: Periodicity;
  deadline?: string; // ISO datetime
  reminder?: TaskReminder;
  xpOverride?: number; // optional per-task XP override; otherwise use rarity defaults
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}
