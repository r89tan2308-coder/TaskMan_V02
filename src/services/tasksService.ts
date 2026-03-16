import { addEvent } from '../db/repositories/ledgerRepo';
import {
  createTask as repoCreateTask,
  deleteTask as repoDeleteTask,
  getTask as repoGetTask,
  listTasks as repoListTasks,
  updateTask as repoUpdateTask
} from '../db/repositories/tasksRepo';
import { Task, Rarity, Periodicity, TaskReminder, TaskChecklistItem } from '../entities/task/types';
import { LedgerEvent } from '../entities/ledger/types';
import { xpForTask } from '../logic/xp';

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

const isDuplicateTask = (task: Task, input: CreateTaskInput, nowMs: number) => {
  const createdAtMs = parseTimestamp(task.createdAt);
  if (Number.isNaN(createdAtMs)) return false;
  if (Math.abs(nowMs - createdAtMs) > 2000) return false;
  return (
    normalizeText(task.title) === normalizeText(input.title) &&
    task.periodicity === input.periodicity &&
    task.rarity === input.rarity &&
    (task.xpOverride ?? null) === (input.xpOverride ?? null) &&
    (task.deadline ?? null) === (input.deadline ?? null) &&
    normalizeText(task.comment) === normalizeText(input.comment) &&
    Boolean(task.progressEnabled) === Boolean(input.progressEnabled) &&
    (task.progressValue ?? null) === (input.progressValue ?? null) &&
    normalizeTags(task.skillTags) === normalizeTags(input.skillTags)
  );
};

export interface CreateTaskInput {
  title: string;
  rarity: Rarity;
  periodicity: Periodicity;
  deadline?: string;
  reminder?: TaskReminder;
  xpOverride?: number;
  comment?: string;
  checklist?: TaskChecklistItem[];
  skillTags?: string[];
  progressEnabled?: boolean;
  progressValue?: number;
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
  return repoCreateTask({
    ...input,
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

export async function completeTask(taskId: string, occurredAt?: string): Promise<void> {
  const task = await repoGetTask(taskId);
  if (!task) throw new Error('Task not found');
  const createdAt = occurredAt ?? new Date().toISOString();
  const event: LedgerEvent = {
    id: generateId(),
    kind: 'task',
    taskId,
    deltaXp: xpForTask(task),
    createdAt
  };
  await addEvent(event);
}

export async function undoComplete(taskId: string, occurredAt?: string): Promise<void> {
  const task = await repoGetTask(taskId);
  if (!task) throw new Error('Task not found');
  const createdAt = occurredAt ?? new Date().toISOString();
  const event: LedgerEvent = {
    id: generateId(),
    kind: 'task',
    taskId,
    deltaXp: -xpForTask(task),
    createdAt,
    note: 'undo'
  };
  await addEvent(event);
}
