import { describe, expect, it } from 'vitest';
import { xpForTask } from './xp';
import type { Task } from '../entities/task/types';

const baseTask: Task = {
  id: 'task-1',
  title: 'Test',
  rarity: 'common',
  periodicity: 'daily',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe('xpForTask', () => {
  it('uses rarity defaults when no override', () => {
    expect(xpForTask({ ...baseTask, rarity: 'rare' })).toBe(25);
    expect(xpForTask({ ...baseTask, rarity: 'epic' })).toBe(50);
    expect(xpForTask({ ...baseTask, rarity: 'legendary' })).toBe(100);
  });

  it('uses xpOverride when provided', () => {
    expect(xpForTask({ ...baseTask, xpOverride: 7 })).toBe(7);
  });
});
