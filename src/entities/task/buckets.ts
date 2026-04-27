import type { Task, TaskBucket } from './types';
import { normalizeAllowedWeekdays } from './weekdays';

const DAY_MS = 24 * 60 * 60 * 1000;

const isValidDate = (value: Date) => !Number.isNaN(value.getTime());

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return isValidDate(date) ? date : null;
};

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const differenceInCalendarDays = (left: Date, right: Date) => {
  const leftStart = startOfLocalDay(left).getTime();
  const rightStart = startOfLocalDay(right).getTime();
  return Math.round((leftStart - rightStart) / DAY_MS);
};

export const isTaskBucket = (value: unknown): value is TaskBucket =>
  value === 'inbox' || value === 'today' || value === 'next' || value === 'backlog';

export const suggestTaskBucket = (
  task: Pick<Task, 'deadline' | 'periodicity' | 'createdAt' | 'updatedAt' | 'rarity'> &
    Partial<Pick<Task, 'bucket'>>
): TaskBucket => {
  if (isTaskBucket(task.bucket)) return task.bucket;

  const now = new Date();
  const deadline = parseIsoDate(task.deadline);

  if (task.periodicity === 'daily') return 'today';

  if (deadline) {
    const dayDelta = differenceInCalendarDays(deadline, now);
    if (dayDelta <= 0) return 'today';
    if (dayDelta <= 3) return 'next';
    return 'backlog';
  }

  if (task.periodicity !== 'one-time') {
    return 'next';
  }

  const createdAt = parseIsoDate(task.createdAt) ?? parseIsoDate(task.updatedAt);
  if (createdAt) {
    const ageMs = Math.max(0, now.getTime() - createdAt.getTime());
    if (ageMs <= 2 * DAY_MS) return 'inbox';
  }

  return task.rarity === 'common' ? 'backlog' : 'next';
};

export const ensureTaskBucket = (task: Task): Task => ({
  ...task,
  allowedWeekdays: normalizeAllowedWeekdays(task.allowedWeekdays),
  bucket: suggestTaskBucket(task)
});
