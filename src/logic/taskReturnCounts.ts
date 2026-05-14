import type { LedgerEvent } from '../entities/ledger/types';
import type { Task } from '../entities/task/types';
import { isTaskAllowedOnDate } from '../entities/task/weekdays';
import { buildTaskStatusById } from './taskStatus';

export interface TaskReturnCounts {
  badgeCount: number;
  overdueIncompleteCount: number;
  todayIncompleteCount: number;
}

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfLocalWeek = (date: Date) => {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  return start;
};

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const buildDateWithTime = (year: number, monthIndex: number, day: number, timeSource: Date) => {
  const clampedDay = Math.min(day, getDaysInMonth(year, monthIndex));
  return new Date(
    year,
    monthIndex,
    clampedDay,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  );
};

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getCurrentPeriodDeadline = (task: Task, now = new Date()) => {
  const anchor = parseIsoDate(task.deadline);
  if (!anchor) return null;
  if (task.periodicity === 'one-time') return anchor;
  if (now.getTime() < anchor.getTime()) return anchor;

  if (task.periodicity === 'daily') {
    return buildDateWithTime(now.getFullYear(), now.getMonth(), now.getDate(), anchor);
  }

  if (task.periodicity === 'weekly') {
    const candidate = startOfLocalWeek(now);
    const anchorOffset = (anchor.getDay() + 6) % 7;
    candidate.setDate(candidate.getDate() + anchorOffset);
    candidate.setHours(
      anchor.getHours(),
      anchor.getMinutes(),
      anchor.getSeconds(),
      anchor.getMilliseconds()
    );
    return candidate;
  }

  if (task.periodicity === 'monthly') {
    return buildDateWithTime(now.getFullYear(), now.getMonth(), anchor.getDate(), anchor);
  }

  if (task.periodicity === 'yearly') {
    return buildDateWithTime(now.getFullYear(), anchor.getMonth(), anchor.getDate(), anchor);
  }

  return anchor;
};

const isTaskAllowedInTodayFlow = (task: Task, date: Date) =>
  task.periodicity === 'one-time' ? true : isTaskAllowedOnDate(task, date);

const shouldSurfaceTaskInToday = (task: Task, now = new Date()) => {
  if (!isTaskAllowedInTodayFlow(task, now)) return false;
  if (task.periodicity === 'daily') return true;
  const currentDeadline = getCurrentPeriodDeadline(task, now);
  return Boolean(currentDeadline && isSameLocalDate(currentDeadline, now));
};

export const getTaskReturnCounts = (
  tasks: Task[],
  events: LedgerEvent[],
  referenceDate = new Date()
): TaskReturnCounts => {
  const statusById = buildTaskStatusById(tasks, events, referenceDate);
  const overdueTaskIds = new Set<string>();
  const todayTaskIds = new Set<string>();

  for (const task of tasks) {
    const status = statusById[task.id] ?? 'pending';
    if (status !== 'pending' && status !== 'overdue') continue;
    if (!isTaskAllowedInTodayFlow(task, referenceDate)) continue;

    if (status === 'overdue') {
      overdueTaskIds.add(task.id);
      continue;
    }

    if (task.bucket === 'today' || shouldSurfaceTaskInToday(task, referenceDate)) {
      todayTaskIds.add(task.id);
    }
  }

  const uniqueBadgeTaskIds = new Set([...overdueTaskIds, ...todayTaskIds]);
  return {
    badgeCount: uniqueBadgeTaskIds.size,
    overdueIncompleteCount: overdueTaskIds.size,
    todayIncompleteCount: todayTaskIds.size
  };
};
