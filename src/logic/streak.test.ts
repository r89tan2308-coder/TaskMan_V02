import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../entities/ledger/types';
import { computeStreak, computeTaskDailyStreak } from './streak';

const localIso = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();

let eventCounter = 0;

const buildEvent = (
  overrides: Partial<LedgerEvent> & Pick<LedgerEvent, 'taskId' | 'createdAt'>
): LedgerEvent => ({
  id: overrides.id ?? `event-${++eventCounter}`,
  kind: 'task',
  deltaXp: 10,
  note: 'TASK_DONE',
  meta: {
    eventType: 'TASK_DONE'
  },
  ...overrides
});

describe('streak logic', () => {
  it('counts consecutive successful periods, not raw task events', () => {
    const events = [
      buildEvent({ taskId: 'a', createdAt: localIso(2026, 4, 15, 9, 0) }),
      buildEvent({ taskId: 'b', createdAt: localIso(2026, 4, 16, 9, 0) }),
      buildEvent({ taskId: 'c', createdAt: localIso(2026, 4, 16, 10, 0) }),
      buildEvent({ taskId: 'd', createdAt: localIso(2026, 4, 17, 9, 0) })
    ];

    expect(
      computeStreak(events, { kind: 'daily' }, { requiredCountPerPeriod: 1 }, new Date(2026, 3, 17, 12, 0))
    ).toMatchObject({
      currentCount: 3,
      bestCount: 3
    });
  });

  it('does not count missed and undone task events as streak completions', () => {
    const events = [
      buildEvent({ taskId: 'done', createdAt: localIso(2026, 4, 15, 9, 0) }),
      buildEvent({
        taskId: 'missed',
        createdAt: localIso(2026, 4, 16, 9, 0),
        deltaXp: -10,
        note: 'TASK_MISSED',
        meta: { eventType: 'TASK_MISSED' }
      }),
      buildEvent({ taskId: 'undone', createdAt: localIso(2026, 4, 16, 10, 0) }),
      buildEvent({
        taskId: 'undone',
        createdAt: localIso(2026, 4, 16, 11, 0),
        deltaXp: -10,
        note: 'TASK_UNDO',
        meta: { eventType: 'TASK_UNDO' }
      }),
      buildEvent({ taskId: 'today', createdAt: localIso(2026, 4, 17, 9, 0) })
    ];

    expect(
      computeStreak(events, { kind: 'daily' }, { requiredCountPerPeriod: 1 }, new Date(2026, 3, 17, 12, 0))
    ).toMatchObject({
      currentCount: 1,
      bestCount: 1
    });
  });

  it('expires current app streaks when the latest completed period is stale', () => {
    const events = [
      buildEvent({ taskId: 'a', createdAt: localIso(2026, 4, 15, 9, 0) }),
      buildEvent({ taskId: 'b', createdAt: localIso(2026, 4, 16, 9, 0) })
    ];

    expect(
      computeStreak(events, { kind: 'daily' }, { requiredCountPerPeriod: 1 }, new Date(2026, 3, 17, 12, 0))
    ).toMatchObject({
      currentCount: 2,
      bestCount: 2
    });

    expect(
      computeStreak(events, { kind: 'daily' }, { requiredCountPerPeriod: 1 }, new Date(2026, 3, 18, 12, 0))
    ).toMatchObject({
      currentCount: 0,
      bestCount: 2
    });
  });

  it('keeps a task daily streak through the next unfinished day only', () => {
    const events = [
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 15, 9, 0) }),
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 16, 9, 0) }),
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 17, 9, 0) })
    ];

    expect(computeTaskDailyStreak(events, 'daily', new Date(2026, 3, 18, 12, 0))).toMatchObject({
      currentCount: 3,
      bestCount: 3
    });

    expect(computeTaskDailyStreak(events, 'daily', new Date(2026, 3, 19, 12, 0))).toMatchObject({
      currentCount: 0,
      bestCount: 3
    });
  });

  it('breaks a task daily streak when the latest event for a day is missed or undo', () => {
    const events = [
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 15, 9, 0) }),
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 16, 9, 0) }),
      buildEvent({ taskId: 'daily', createdAt: localIso(2026, 4, 17, 9, 0) }),
      buildEvent({
        taskId: 'daily',
        createdAt: localIso(2026, 4, 17, 11, 0),
        deltaXp: -10,
        note: 'TASK_UNDO',
        meta: { eventType: 'TASK_UNDO' }
      })
    ];

    expect(computeTaskDailyStreak(events, 'daily', new Date(2026, 3, 18, 12, 0))).toMatchObject({
      currentCount: 0,
      bestCount: 2
    });
  });
});
