import type { Task } from '../entities/task/types';
import { xpForTask } from './xp';

export const PROJECT_COMPLETION_BONUS_RATE = 0.1;
export const PROJECT_COMPLETION_BONUS_MIN_XP = 3;
export const PROJECT_COMPLETION_BONUS_MAX_XP = 50;
export const PROJECT_COMPLETION_BONUS_MIN_TASKS = 3;
export const PROJECT_COMPLETION_BONUS_MIN_BASE_XP = 20;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const getProjectBaseXp = (tasks: Task[]) =>
  tasks.reduce((total, task) => total + xpForTask(task), 0);

export const isProjectCompletionBonusEligible = (tasks: Task[]) => {
  const baseXp = getProjectBaseXp(tasks);
  return tasks.length >= PROJECT_COMPLETION_BONUS_MIN_TASKS || baseXp >= PROJECT_COMPLETION_BONUS_MIN_BASE_XP;
};

export const getProjectCompletionBonusXp = (tasks: Task[]) => {
  if (!isProjectCompletionBonusEligible(tasks)) return null;
  const baseXp = getProjectBaseXp(tasks);
  return clamp(
    Math.round(baseXp * PROJECT_COMPLETION_BONUS_RATE),
    PROJECT_COMPLETION_BONUS_MIN_XP,
    PROJECT_COMPLETION_BONUS_MAX_XP
  );
};
