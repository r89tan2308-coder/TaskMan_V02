import { LedgerEvent } from '../entities/ledger/types';
import { StreakPeriod, StreakRule, StreakState } from '../entities/streak/types';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function taskEventIsDone(event: LedgerEvent): boolean {
  if (event.note === 'TASK_DONE' || event.meta?.eventType === 'TASK_DONE') return true;
  if (
    event.note === 'TASK_MISSED' ||
    event.meta?.eventType === 'TASK_MISSED' ||
    event.note === 'TASK_UNDO' ||
    event.note === 'undo' ||
    event.meta?.eventType === 'TASK_UNDO'
  ) {
    return false;
  }
  return event.deltaXp > 0;
}

export function computeStreak(
  events: LedgerEvent[],
  period: StreakPeriod,
  rule: StreakRule
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

  const counts = new Map<string, { count: number; order: number }>();
  let lastEventAt = '';
  const stepMs = periodStepMs(period);

  for (const event of taskEvents) {
    const ts = new Date(event.createdAt).getTime();
    if (Number.isNaN(ts)) continue;
    if (!lastEventAt || ts > new Date(lastEventAt).getTime()) {
      lastEventAt = event.createdAt;
    }
    const date = new Date(ts);
    let keyInfo: { key: string; order: number };
    if (period.kind === 'daily') {
      keyInfo = dailyKey(date);
    } else if (period.kind === 'weekly') {
      keyInfo = weeklyKey(date);
    } else {
      keyInfo = customKey(date, period);
    }
    const existing = counts.get(keyInfo.key);
    const count = (existing?.count ?? 0) + 1;
    counts.set(keyInfo.key, { count, order: keyInfo.order });
  }

  const entries = Array.from(counts.entries()).map(([key, value]) => ({ key, ...value }));
  entries.sort((a, b) => b.order - a.order);

  let currentCount = 0;
  const required = rule.requiredCountPerPeriod;
  if (entries.length) {
    let cursorOrder = entries[0].order;
    for (const entry of entries) {
      if (entry.order === cursorOrder && entry.count >= required) {
        currentCount += 1;
        cursorOrder -= stepMs;
      } else {
        break;
      }
    }
  }

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
    lastEventAt: lastEventAt || undefined
  };
}

export function computeTaskDailyStreak(events: LedgerEvent[], taskId: string): StreakState {
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
  let lastCompletedAt = '';

  for (const event of taskEvents) {
    const timestamp = new Date(event.createdAt).getTime();
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

    if (completed && (!lastCompletedAt || timestamp > new Date(lastCompletedAt).getTime())) {
      lastCompletedAt = event.createdAt;
    }
  }

  const entries = Array.from(latestByDay.values()).sort((left, right) => right.order - left.order);
  const stepMs = DAY_MS;
  let currentCount = 0;

  if (entries.length > 0 && entries[0].completed) {
    let expectedOrder = entries[0].order;
    for (const entry of entries) {
      if (entry.order !== expectedOrder || !entry.completed) break;
      currentCount += 1;
      expectedOrder -= stepMs;
    }
  }

  let bestCount = 0;
  for (let index = 0; index < entries.length; index += 1) {
    if (!entries[index].completed) continue;
    let length = 1;
    let expectedOrder = entries[index].order - stepMs;
    for (let innerIndex = index + 1; innerIndex < entries.length; innerIndex += 1) {
      const entry = entries[innerIndex];
      if (entry.order !== expectedOrder || !entry.completed) break;
      length += 1;
      expectedOrder -= stepMs;
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
