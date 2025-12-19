// Domain types for daily log entries (derived from tasks only); no calculations here.
export interface DailyLogEntry {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD for grouping
  loggedAt: string; // ISO datetime when task was logged
  deltaXp: number;
  note?: string;
}

export interface DailyLogDay {
  date: string; // YYYY-MM-DD
  entries: DailyLogEntry[];
}
