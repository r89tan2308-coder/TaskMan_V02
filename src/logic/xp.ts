import { Task, Rarity } from '../entities/task/types';

const XP_BY_RARITY: Record<Rarity, number> = {
  common: 10,
  rare: 25,
  epic: 50,
  legendary: 100
};

export function xpForTask(task: Task): number {
  if (typeof task.xpOverride === 'number') {
    return task.xpOverride;
  }
  return XP_BY_RARITY[task.rarity];
}
