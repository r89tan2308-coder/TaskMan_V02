import {
  createTask as repoCreateTask,
  deleteTask as repoDeleteTask,
  listTasks as repoListTasks,
  updateTask as repoUpdateTask
} from '../db/repositories/tasksRepo';
import {
  Task,
  Rarity,
  Periodicity,
  TaskReminder,
  TaskChecklistItem,
  TaskBucket,
  AllowedWeekday
} from '../entities/task/types';
import { suggestTaskBucket } from '../entities/task/buckets';
import { normalizeAllowedWeekdays } from '../entities/task/weekdays';
import { LoggedTaskEventResult, logTaskEventByTaskId } from './taskEventService';

const generateId = (): string => {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const parseTimestamp = (value?: string) => {
  if (!value) return NaN;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : NaN;
};

const normalizeText = (value?: string) => (value ?? '').trim().toLowerCase();

const normalizeTags = (tags?: string[]) =>
  Array.isArray(tags)
    ? tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean).sort().join('|')
    : '';

const normalizeWeekdays = (weekdays?: readonly AllowedWeekday[]) =>
  (normalizeAllowedWeekdays(weekdays) ?? []).join('|');

const isDuplicateTask = (task: Task, input: CreateTaskInput, nowMs: number) => {
  const createdAtMs = parseTimestamp(task.createdAt);
  if (Number.isNaN(createdAtMs)) return false;
  if (Math.abs(nowMs - createdAtMs) > 2000) return false;
  return (
    normalizeText(task.title) === normalizeText(input.title) &&
    task.periodicity === input.periodicity &&
    task.rarity === input.rarity &&
    (task.projectId ?? null) === (input.projectId ?? null) &&
    (task.xpOverride ?? null) === (input.xpOverride ?? null) &&
    (task.deadline ?? null) === (input.deadline ?? null) &&
    normalizeText(task.comment) === normalizeText(input.comment) &&
    Boolean(task.progressEnabled) === Boolean(input.progressEnabled) &&
    (task.progressValue ?? null) === (input.progressValue ?? null) &&
    normalizeTags(task.skillTags) === normalizeTags(input.skillTags) &&
    normalizeWeekdays(task.allowedWeekdays) === normalizeWeekdays(input.allowedWeekdays)
  );
};

export interface CreateTaskInput {
  title: string;
  rarity: Rarity;
  periodicity: Periodicity;
  quota?: {
    count: number;
    per: 'week' | 'month';
  };
  deadline?: string;
  reminder?: TaskReminder;
  xpOverride?: number;
  comment?: string;
  projectId?: string | null;
  checklist?: TaskChecklistItem[];
  skillTags?: string[];
  progressEnabled?: boolean;
  progressValue?: number;
  bucket?: TaskBucket;
  allowedWeekdays?: AllowedWeekday[];
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const sortOrder = nowMs;
  const existingTasks = await repoListTasks();
  const duplicate = existingTasks.find((task) => isDuplicateTask(task, input, nowMs));
  if (duplicate) {
    console.warn('[tasksService.createTask] Duplicate prevented', {
      existingTaskId: duplicate.id,
      title: input.title,
      periodicity: input.periodicity,
      rarity: input.rarity
    });
    return duplicate.id;
  }
  const bucket = suggestTaskBucket({
    bucket: input.bucket,
    rarity: input.rarity,
    periodicity: input.periodicity,
    deadline: input.deadline,
    createdAt: now,
    updatedAt: now
  });

  return repoCreateTask({
    ...input,
    allowedWeekdays: normalizeAllowedWeekdays(input.allowedWeekdays),
    bucket,
    archived: false,
    sortOrder,
    createdAt: now,
    updatedAt: now
  });
}

export async function listTasks(): Promise<Task[]> {
  const tasks = await repoListTasks();
  const getSortValue = (task: Task) =>
    typeof task.sortOrder === 'number' ? task.sortOrder : Date.parse(task.createdAt ?? '') || 0;
  return tasks.sort((a, b) => getSortValue(b) - getSortValue(a));
}

export async function updateTask(task: Task): Promise<void> {
  const updatedAt = new Date().toISOString();
  await repoUpdateTask({ ...task, updatedAt });
}

export async function deleteTask(taskId: string): Promise<void> {
  await repoDeleteTask(taskId);
}

export async function completeTask(
  taskId: string,
  occurredAt?: string
): Promise<LoggedTaskEventResult> {
  return logTaskEventByTaskId(taskId, 'TASK_DONE', occurredAt);
}

export async function undoComplete(
  taskId: string,
  occurredAt?: string
): Promise<LoggedTaskEventResult> {
  return logTaskEventByTaskId(taskId, 'TASK_UNDO', occurredAt);
}
