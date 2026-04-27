import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../entities/ledger/types';
import type { Task } from '../entities/task/types';
import {
  buildTaskStatusById,
  getCompletedTodayTaskIds,
  parseEventTimestamp
} from './taskStatus';

const localIso = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();

const BASE_TIMESTAMP = localIso(2026, 4, 1, 9, 0);

const buildTask = (overrides: Partial<Task> & Pick<Task, 'id'>): Task => ({
  id: overrides.id,
  title: overrides.title ?? overrides.id,
  bucket: 'today',
  rarity: 'common',
  periodicity: 'one-time',
  createdAt: BASE_TIMESTAMP,
  updatedAt: BASE_TIMESTAMP,
  ...overrides
});

let eventCounter = 0;

const buildEvent = (
  overrides: Partial<LedgerEvent> & Pick<LedgerEvent, 'taskId' | 'createdAt'>
): LedgerEvent => ({
  id: overrides.id ?? `event-${++eventCounter}`,
  kind: 'task',
  deltaXp: 10,
  note: 'TASK_DONE',
  ...overrides
});

const getStatus = (task: Task, events: LedgerEvent[], referenceDate: Date) =>
  buildTaskStatusById([task], events, referenceDate)[task.id];

describe('taskStatus', () => {
  it('parses ISO and numeric-string event timestamps', () => {
    expect(parseEventTimestamp('1700000000000')).toBe(1700000000000);
    expect(parseEventTimestamp(localIso(2026, 4, 17, 9, 30))).toBe(
      new Date(2026, 3, 17, 9, 30, 0, 0).getTime()
    );
  });

  it('treats archived tasks as completed', () => {
    const task = buildTask({
      id: 'archived-task',
      archived: true,
      deadline: localIso(2026, 4, 17, 9, 0)
    });

    expect(getStatus(task, [], new Date(2026, 3, 17, 12, 0))).toBe('completed');
  });

  it('does not carry daily completion into the next day', () => {
    const task = buildTask({
      id: 'daily-task',
      periodicity: 'daily',
      deadline: localIso(2026, 4, 16, 9, 0)
    });

    const events = [
      buildEvent({
        taskId: task.id,
        createdAt: localIso(2026, 4, 16, 8, 30)
      })
    ];

    expect(getStatus(task, events, new Date(2026, 3, 17, 10, 0))).toBe('overdue');
  });

  it('uses weekly events only from the current week', () => {
    const completedThisWeek = buildTask({
      id: 'weekly-current',
      periodicity: 'weekly',
      deadline: localIso(2026, 4, 6, 9, 0)
    });
    const staleFromPreviousWeek = buildTask({
      id: 'weekly-stale',
      periodicity: 'weekly',
      deadline: localIso(2026, 4, 6, 9, 0)
    });

    const referenceDate = new Date(2026, 3, 15, 10, 0);
    const events = [
      buildEvent({
        taskId: completedThisWeek.id,
        createdAt: localIso(2026, 4, 14, 18, 0)
      }),
      buildEvent({
        taskId: staleFromPreviousWeek.id,
        createdAt: localIso(2026, 4, 8, 18, 0)
      })
    ];

    const statuses = buildTaskStatusById([completedThisWeek, staleFromPreviousWeek], events, referenceDate);

    expect(statuses[completedThisWeek.id]).toBe('completed');
    expect(statuses[staleFromPreviousWeek.id]).toBe('overdue');
  });

  it('clamps monthly deadlines to the last day of shorter months', () => {
    const task = buildTask({
      id: 'monthly-task',
      periodicity: 'monthly',
      deadline: localIso(2026, 1, 31, 9, 0)
    });

    expect(getStatus(task, [], new Date(2026, 1, 28, 10, 0))).toBe('overdue');
  });

  it('clamps yearly deadlines for leap-day anchors in non-leap years', () => {
    const task = buildTask({
      id: 'yearly-task',
      periodicity: 'yearly',
      deadline: localIso(2024, 2, 29, 9, 0)
    });

    expect(getStatus(task, [], new Date(2025, 1, 28, 10, 0))).toBe('overdue');
  });

  it('prefers the latest missed event over earlier completion', () => {
    const task = buildTask({
      id: 'missed-task',
      deadline: localIso(2026, 4, 17, 9, 0)
    });

    const events = [
      buildEvent({
        taskId: task.id,
        createdAt: localIso(2026, 4, 17, 8, 0)
      }),
      buildEvent({
        taskId: task.id,
        createdAt: localIso(2026, 4, 17, 9, 30),
        deltaXp: 0,
        note: 'TASK_MISSED',
        meta: { eventType: 'TASK_MISSED' }
      })
    ];

    expect(getStatus(task, events, new Date(2026, 3, 17, 10, 0))).toBe('missed');
  });

  it('falls back to deadline status after an undo event', () => {
    const task = buildTask({
      id: 'undo-task',
      deadline: localIso(2026, 4, 17, 9, 0)
    });

    const events = [
      buildEvent({
        taskId: task.id,
        createdAt: localIso(2026, 4, 17, 8, 0)
      }),
      buildEvent({
        taskId: task.id,
        createdAt: localIso(2026, 4, 17, 9, 30),
        deltaXp: -10,
        note: 'TASK_UNDO',
        meta: { eventType: 'TASK_UNDO' }
      })
    ];

    expect(getStatus(task, events, new Date(2026, 3, 17, 10, 0))).toBe('overdue');
  });

  it('returns only tasks still completed by the latest event today', () => {
    const completed = buildTask({ id: 'completed-today' });
    const undone = buildTask({ id: 'undone-today' });
    const missed = buildTask({ id: 'missed-today' });
    const yesterdayOnly = buildTask({ id: 'yesterday-only' });

    const referenceDate = new Date(2026, 3, 17, 18, 0);
    const events = [
      buildEvent({
        taskId: completed.id,
        createdAt: localIso(2026, 4, 17, 9, 0)
      }),
      buildEvent({
        taskId: undone.id,
        createdAt: localIso(2026, 4, 17, 9, 15)
      }),
      buildEvent({
        taskId: undone.id,
        createdAt: localIso(2026, 4, 17, 9, 45),
        deltaXp: -10,
        note: 'TASK_UNDO',
        meta: { eventType: 'TASK_UNDO' }
      }),
      buildEvent({
        taskId: missed.id,
        createdAt: localIso(2026, 4, 17, 10, 0),
        deltaXp: 0,
        note: 'TASK_MISSED',
        meta: { eventType: 'TASK_MISSED' }
      }),
      buildEvent({
        taskId: yesterdayOnly.id,
        createdAt: localIso(2026, 4, 16, 20, 0)
      })
    ];

    expect(getCompletedTodayTaskIds([completed, undone, missed, yesterdayOnly], events, referenceDate)).toEqual(
      new Set([completed.id])
    );
  });
});
