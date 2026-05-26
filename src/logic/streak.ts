import { LedgerEvent } from '../entities/ledger/types';
import { StreakPeriod, StreakRule, StreakState } from '../entities/streak/types';

const DAY_MS = 24 * 60 * 60 * 1000;

type PeriodKeyInfo = { key: string; order: number };

function startOfDayLocal(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function periodStepMs(period: StreakPeriod): number {
  if (period.kind === 'daily') return DAY_MS;
  if (period.kind === 'weekly') return 7 * DAY_MS;
  return period.lengthDays * DAY_MS;
}

function dailyKey(date: Date): { key: string; order: number } {
  const order = startOfDayLocal(date);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return { key: `${y}-${m}-${d}`, order };
}

function isoWeek(date: Date): { year: number; week: number; startMs: number } {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  // ISO week: shift to Thursday
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  // start of week (Monday)
  const start = new Date(d.getTime());
  start.setDate(start.getDate() - 3); // back to Monday from Thursday
  start.setHours(0, 0, 0, 0);
  return { year: d.getFullYear(), week, startMs: start.getTime() };
}

function weeklyKey(date: Date): { key: string; order: number } {
  const { year, week, startMs } = isoWeek(date);
  const key = `${year}-W${String(week).padStart(2, '0')}`;
  return { key, order: startMs };
}

function customKey(date: Date, period: StreakPeriod): { key: string; order: number } {
  const startMs = startOfDayLocal(date);
  const stepMs = periodStepMs(period);
  const order = Math.floor(startMs / stepMs) * stepMs;
  return { key: `custom-${order}`, order };
}

function periodKey(date: Date, period: StreakPeriod): PeriodKeyInfo {
  if (period.kind === 'daily') return dailyKey(date);
  if (period.kind === 'weekly') return weeklyKey(date);
  return customKey(date, period);
}

function parseEventTimestamp(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string') return NaN;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numericFallback = Number(value);
  return Number.isFinite(numericFallback) ? numericFallback : NaN;
}

function taskEventIsDone(event: LedgerEvent): boolean {
  if (
    event.note === 'TASK_MISSED' ||
    event.meta?.eventType === 'TASK_MISSED' ||
    event.note === 'TASK_UNDO' ||
    event.note === 'undo' ||
    event.meta?.eventType === 'TASK_UNDO'
  ) {
    return false;
  }
  if (event.note === 'TASK_DONE' || event.meta?.eventType === 'TASK_DONE') return true;
  return event.deltaXp > 0;
}

function countCurrentQualifiedPeriods(
  entriesByOrder: Map<number, { count: number }>,
  referenceOrder: number,
  stepMs: number,
  required: number
) {
  let cursorOrder = referenceOrder;
  const referenceEntry = entriesByOrder.get(referenceOrder);
  if (!referenceEntry || referenceEntry.count < required) {
    cursorOrder -= stepMs;
  }

  let currentCount = 0;
  while (true) {
    const entry = entriesByOrder.get(cursorOrder);
    if (!entry || entry.count < required) break;
    currentCount += 1;
    cursorOrder -= stepMs;
  }

  return currentCount;
}

export function computeStreak(
  events: LedgerEvent[],
  period: StreakPeriod,
  rule: StreakRule,
  referenceDate = new Date()
): StreakState {
  // Streak считается только по task-событиям (логирование задач), не по наградам/импорту.
  const taskEvents = events.filter((e) => e.kind === 'task');

  if (!taskEvents.length) {
    return {
      currentCount: 0,
      bestCount: 0,
      period,
      rule
    };
  }

  const latestByPeriodTask = new Map<
    string,
    {
      periodKey: string;
      order: number;
      timestamp: number;
      completed: boolean;
      createdAt: string;
    }
  >();
  const stepMs = periodStepMs(period);

  for (const event of taskEvents) {
    if (!event.taskId) continue;
    const ts = parseEventTimestamp(event.createdAt);
    if (Number.isNaN(ts)) continue;
    const date = new Date(ts);
    const keyInfo = periodKey(date, period);
    const latestKey = `${keyInfo.key}:${event.taskId}`;
    const existing = latestByPeriodTask.get(latestKey);
    if (!existing || ts > existing.timestamp) {
      latestByPeriodTask.set(latestKey, {
        periodKey: keyInfo.key,
        order: keyInfo.order,
        timestamp: ts,
        completed: taskEventIsDone(event),
        createdAt: event.createdAt
      });
    }
  }

  const counts = new Map<string, { count: number; order: number }>();
  let lastCompletedAt = '';
  let lastCompletedTimestamp = NaN;

  for (const entry of latestByPeriodTask.values()) {
    if (!entry.completed) continue;
    const existing = counts.get(entry.periodKey);
    counts.set(entry.periodKey, {
      count: (existing?.count ?? 0) + 1,
      order: entry.order
    });

    if (
      !lastCompletedAt ||
      Number.isNaN(lastCompletedTimestamp) ||
      entry.timestamp > lastCompletedTimestamp
    ) {
      lastCompletedAt = entry.createdAt;
      lastCompletedTimestamp = entry.timestamp;
    }
  }

  const entries = Array.from(counts.entries()).map(([key, value]) => ({ key, ...value }));
  entries.sort((a, b) => b.order - a.order);

  const required = rule.requiredCountPerPeriod;
  const entriesByOrder = new Map(entries.map((entry) => [entry.order, entry]));
  const referenceOrder = periodKey(referenceDate, period).order;
  const currentCount = countCurrentQualifiedPeriods(
    entriesByOrder,
    referenceOrder,
    stepMs,
    required
  );

  let bestCount = 0;
  for (let i = 0; i < entries.length; i++) {
    let length = 0;
    let cursorOrder = entries[i].order;
    for (let j = i; j < entries.length; j++) {
      const entry = entries[j];
      if (entry.order === cursorOrder && entry.count >= required) {
        length += 1;
        cursorOrder -= stepMs;
      } else if (entry.order < cursorOrder) {
        // once we passed the expected cursor, break inner loop
        break;
      }
    }
    if (length > bestCount) bestCount = length;
  }

  return {
    currentCount,
    bestCount,
    period,
    rule,
    lastEventAt: lastCompletedAt || undefined
  };
}

export function computeTaskDailyStreak(
  events: LedgerEvent[],
  taskId: string,
  referenceDate = new Date()
): StreakState {
  const period: StreakPeriod = { kind: 'daily' };
  const rule: StreakRule = { requiredCountPerPeriod: 1 };
  const taskEvents = events.filter((event) => event.kind === 'task' && event.taskId === taskId);

  if (!taskEvents.length) {
    return {
      currentCount: 0,
      bestCount: 0,
      period,
      rule
    };
  }

  const latestByDay = new Map<
    string,
    { order: number; timestamp: number; completed: boolean; createdAt: string }
  >();

  for (const event of taskEvents) {
    const timestamp = parseEventTimestamp(event.createdAt);
    if (Number.isNaN(timestamp)) continue;
    const date = new Date(timestamp);
    const dayInfo = dailyKey(date);
    const completed = taskEventIsDone(event);
    const existing = latestByDay.get(dayInfo.key);

    if (!existing || timestamp > existing.timestamp) {
      latestByDay.set(dayInfo.key, {
        order: dayInfo.order,
        timestamp,
        completed,
        createdAt: event.createdAt
      });
    }

  }

  let lastCompletedAt = '';
  let lastCompletedTimestamp = NaN;
  for (const entry of latestByDay.values()) {
    if (!entry.completed) continue;
    if (
      !lastCompletedAt ||
      Number.isNaN(lastCompletedTimestamp) ||
      entry.timestamp > lastCompletedTimestamp
    ) {
      lastCompletedAt = entry.createdAt;
      lastCompletedTimestamp = entry.timestamp;
    }
  }

  const entries = Array.from(latestByDay.values()).sort((left, right) => right.order - left.order);
  const entriesByOrder = new Map(entries.map((entry) => [entry.order, entry]));
  const referenceOrder = dailyKey(referenceDate).order;
  let currentCount = 0;
  let expectedOrder = referenceOrder;
  const referenceEntry = entriesByOrder.get(referenceOrder);

  if (!referenceEntry) {
    expectedOrder -= DAY_MS;
  } else if (!referenceEntry.completed) {
    expectedOrder = NaN;
  }

  while (Number.isFinite(expectedOrder)) {
    const entry = entriesByOrder.get(expectedOrder);
    if (!entry || !entry.completed) break;
    currentCount += 1;
    expectedOrder -= DAY_MS;
  }

  let bestCount = 0;
  for (let index = 0; index < entries.length; index += 1) {
    if (!entries[index].completed) continue;
    let length = 1;
    let expectedOrder = entries[index].order - DAY_MS;
    for (let innerIndex = index + 1; innerIndex < entries.length; innerIndex += 1) {
      const entry = entries[innerIndex];
      if (entry.order !== expectedOrder || !entry.completed) break;
      length += 1;
      expectedOrder -= DAY_MS;
    }
    if (length > bestCount) bestCount = length;
  }

  return {
    currentCount,
    bestCount,
    period,
    rule,
    lastEventAt: lastCompletedAt || undefined
  };
}
