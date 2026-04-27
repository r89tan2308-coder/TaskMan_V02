import { LedgerEvent } from '../entities/ledger/types';
import { Task } from '../entities/task/types';

export type TaskStatus = 'pending' | 'overdue' | 'completed' | 'missed';

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

const pad2 = (value: number) => value.toString().padStart(2, '0');

export const parseEventTimestamp = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value !== 'string') {
    return NaN;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numericFallback = Number(value);
  return Number.isFinite(numericFallback) ? numericFallback : NaN;
};

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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

const getTaskPeriodKey = (task: Task, date: Date) => {
  if (task.periodicity === 'one-time') return 'one-time';
  if (task.periodicity === 'daily') {
    return `day:${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  if (task.periodicity === 'weekly') {
    const weekStart = startOfLocalWeek(date);
    return `week:${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(
      weekStart.getDate()
    )}`;
  }
  if (task.periodicity === 'monthly') {
    return `month:${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }
  if (task.periodicity === 'yearly') {
    return `year:${date.getFullYear()}`;
  }
  return 'unknown';
};

const getLatestEventForTaskPeriod = (task: Task, events: LedgerEvent[], referenceDate: Date) => {
  const targetKey = getTaskPeriodKey(task, referenceDate);
  let latest: LedgerEvent | null = null;
  let latestTime = NaN;
  for (const event of events) {
    const eventTime = parseEventTimestamp(event.createdAt);
    if (Number.isNaN(eventTime)) continue;
    if (getTaskPeriodKey(task, new Date(eventTime)) !== targetKey) continue;
    if (!latest || Number.isNaN(latestTime) || latestTime < eventTime) {
      latest = event;
      latestTime = eventTime;
    }
  }
  return latest;
};

export const isUndoEvent = (event: LedgerEvent) =>
  event.note === 'TASK_UNDO' ||
  event.note === 'undo' ||
  event.meta?.eventType === 'TASK_UNDO';

export const isMissedEvent = (event: LedgerEvent) =>
  event.note === 'TASK_MISSED' ||
  event.meta?.eventType === 'TASK_MISSED';

export const isDoneEvent = (event: LedgerEvent) =>
  event.note === 'TASK_DONE' ||
  event.meta?.eventType === 'TASK_DONE' ||
  event.deltaXp > 0;

export const buildTaskStatusById = (
  tasks: Task[],
  events: LedgerEvent[],
  referenceDate = new Date()
) => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const eventsByTaskId = new Map<string, LedgerEvent[]>();

  for (const event of events) {
    if (event.kind !== 'task' || !event.taskId) continue;
    if (!tasksById.has(event.taskId)) continue;
    const taskEvents = eventsByTaskId.get(event.taskId) ?? [];
    taskEvents.push(event);
    eventsByTaskId.set(event.taskId, taskEvents);
  }

  const nextStatusById: Record<string, TaskStatus> = {};
  for (const task of tasks) {
    if (task.archived) {
      nextStatusById[task.id] = 'completed';
      continue;
    }

    const latest = getLatestEventForTaskPeriod(task, eventsByTaskId.get(task.id) ?? [], referenceDate);
    if (latest && !isUndoEvent(latest)) {
      if (isMissedEvent(latest)) {
        nextStatusById[task.id] = 'missed';
        continue;
      }
      if (isDoneEvent(latest)) {
        nextStatusById[task.id] = 'completed';
        continue;
      }
    }

    const currentDeadline = getCurrentPeriodDeadline(task, referenceDate);
    nextStatusById[task.id] =
      currentDeadline && currentDeadline.getTime() < referenceDate.getTime()
        ? 'overdue'
        : 'pending';
  }

  return nextStatusById;
};

export const getCompletedTodayTaskIds = (tasks: Task[], events: LedgerEvent[], referenceDate = new Date()) => {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const latestByTaskIdToday = new Map<string, LedgerEvent>();

  for (const event of events) {
    if (event.kind !== 'task' || !event.taskId) continue;
    const task = tasksById.get(event.taskId);
    if (!task) continue;
    const eventTime = parseEventTimestamp(event.createdAt);
    if (Number.isNaN(eventTime)) continue;
    const eventDate = new Date(eventTime);
    if (!isSameLocalDate(eventDate, referenceDate)) continue;
    const existingToday = latestByTaskIdToday.get(event.taskId);
    const existingTodayTime = existingToday
      ? parseEventTimestamp(existingToday.createdAt)
      : NaN;
    if (!existingToday || Number.isNaN(existingTodayTime) || existingTodayTime < eventTime) {
      latestByTaskIdToday.set(event.taskId, event);
    }
  }

  const completedToday = new Set<string>();
  for (const [taskId, event] of latestByTaskIdToday.entries()) {
    if (isUndoEvent(event) || isMissedEvent(event)) continue;
    if (event.deltaXp > 0) {
      completedToday.add(taskId);
    }
  }

  return completedToday;
};
