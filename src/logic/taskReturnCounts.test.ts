import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '../entities/ledger/types';
import type { Task } from '../entities/task/types';
import { getTaskReturnCounts } from './taskReturnCounts';

const localIso = (year: number, month: number, day: number, hour = 0, minute = 0) =>
  new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();

const BASE_TIMESTAMP = localIso(2026, 4, 17, 8, 0);

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

const buildDoneEvent = (taskId: string, createdAt: string): LedgerEvent => ({
  id: `event-${taskId}`,
  kind: 'task',
  taskId,
  deltaXp: 5,
  createdAt,
  note: 'TASK_DONE',
  meta: {
    eventType: 'TASK_DONE'
  }
});

describe('task return counts', () => {
  it('counts incomplete Today tasks and overdue tasks for the app badge', () => {
    const referenceDate = new Date(2026, 3, 17, 12, 0);
    const todayTask = buildTask({ id: 'today-task', bucket: 'today' });
    const inboxTask = buildTask({ id: 'inbox-task', bucket: 'inbox' });
    const overdueTask = buildTask({
      id: 'overdue-task',
      bucket: 'backlog',
      deadline: localIso(2026, 4, 17, 9, 0)
    });

    expect(getTaskReturnCounts([todayTask, inboxTask, overdueTask], [], referenceDate)).toEqual({
      badgeCount: 2,
      overdueIncompleteCount: 1,
      todayIncompleteCount: 1
    });
  });

  it('clears the badge count when actionable tasks are completed', () => {
    const referenceDate = new Date(2026, 3, 17, 12, 0);
    const task = buildTask({ id: 'done-task', bucket: 'today' });

    expect(
      getTaskReturnCounts([task], [buildDoneEvent(task.id, localIso(2026, 4, 17, 11, 0))], referenceDate)
    ).toEqual({
      badgeCount: 0,
      overdueIncompleteCount: 0,
      todayIncompleteCount: 0
    });
  });

  it('surfaces daily tasks for today even without a Today bucket', () => {
    const referenceDate = new Date(2026, 3, 17, 8, 0);
    const dailyTask = buildTask({
      id: 'daily-task',
      bucket: 'next',
      periodicity: 'daily'
    });

    expect(getTaskReturnCounts([dailyTask], [], referenceDate).todayIncompleteCount).toBe(1);
  });
});
