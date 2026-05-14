import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { ensureTaskBucket, normalizeTaskSchedule } from './buckets';

const BASE_TIMESTAMP = new Date(2026, 4, 8, 10, 0).toISOString();

const buildTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  title: 'Task',
  bucket: 'inbox',
  rarity: 'common',
  periodicity: 'one-time',
  createdAt: BASE_TIMESTAMP,
  updatedAt: BASE_TIMESTAMP,
  ...overrides
});

describe('task buckets and schedule normalization', () => {
  it('treats selected execution weekdays as a daily recurring schedule', () => {
    expect(
      normalizeTaskSchedule({
        periodicity: 'one-time',
        allowedWeekdays: [1, 2, 3, 4, 5]
      })
    ).toEqual({
      periodicity: 'daily',
      allowedWeekdays: [1, 2, 3, 4, 5]
    });
  });

  it('repairs existing one-time tasks that already have execution weekdays', () => {
    const task = ensureTaskBucket(
      buildTask({
        allowedWeekdays: [1, 2, 3, 4, 5]
      })
    );

    expect(task.periodicity).toBe('daily');
    expect(task.allowedWeekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps true one-time tasks one-time when no execution weekdays are selected', () => {
    expect(normalizeTaskSchedule({ periodicity: 'one-time' })).toEqual({
      periodicity: 'one-time',
      allowedWeekdays: undefined
    });
  });
});
