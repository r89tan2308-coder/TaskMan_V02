import { describe, expect, it } from 'vitest';
import type { Task } from '../entities/task/types';
import {
  getProjectBaseXp,
  getProjectCompletionBonusXp,
  isProjectCompletionBonusEligible
} from './projectBonus';

const baseTask: Task = {
  id: 'task-1',
  title: 'Test',
  bucket: 'next',
  rarity: 'common',
  periodicity: 'one-time',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe('project completion bonus', () => {
  it('computes base xp from child tasks only', () => {
    expect(
      getProjectBaseXp([
        { ...baseTask, id: 'a', xpOverride: 5 },
        { ...baseTask, id: 'b', xpOverride: 7 },
        { ...baseTask, id: 'c', xpOverride: 9 }
      ])
    ).toBe(21);
  });

  it('requires either at least three tasks or at least twenty base xp', () => {
    expect(
      isProjectCompletionBonusEligible([
        { ...baseTask, id: 'a', xpOverride: 5 },
        { ...baseTask, id: 'b', xpOverride: 6 }
      ])
    ).toBe(false);

    expect(
      isProjectCompletionBonusEligible([
        { ...baseTask, id: 'a', xpOverride: 5 },
        { ...baseTask, id: 'b', xpOverride: 6 },
        { ...baseTask, id: 'c', xpOverride: 4 }
      ])
    ).toBe(true);

    expect(
      isProjectCompletionBonusEligible([
        { ...baseTask, id: 'a', xpOverride: 10 },
        { ...baseTask, id: 'b', xpOverride: 10 }
      ])
    ).toBe(true);
  });

  it('rounds bonus and applies minimum cap', () => {
    expect(
      getProjectCompletionBonusXp([
        { ...baseTask, id: 'a', xpOverride: 10 },
        { ...baseTask, id: 'b', xpOverride: 10 }
      ])
    ).toBe(3);
  });

  it('applies maximum cap', () => {
    expect(
      getProjectCompletionBonusXp([
        { ...baseTask, id: 'a', xpOverride: 300 },
        { ...baseTask, id: 'b', xpOverride: 250 },
        { ...baseTask, id: 'c', xpOverride: 200 }
      ])
    ).toBe(50);
  });

  it('returns null when project is too small for bonus', () => {
    expect(
      getProjectCompletionBonusXp([
        { ...baseTask, id: 'a', xpOverride: 5 },
        { ...baseTask, id: 'b', xpOverride: 6 }
      ])
    ).toBeNull();
  });
});
