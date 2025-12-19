// Domain types for calendar exports; no logic here.
export interface CalendarReminder {
  offsetMinutes: number; // minutes before event
}

export interface CalendarTaskEvent {
  id: string;
  taskId: string;
  title: string;
  deadline: string; // ISO datetime
  reminder?: CalendarReminder; // single VALARM in MVP
}
