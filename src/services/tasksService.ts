import { addEvent } from '../db/repositories/ledgerRepo';
import { createTask as repoCreateTask, getTask as repoGetTask, listTasks as repoListTasks } from '../db/repositories/tasksRepo';
import { Task, Rarity, Periodicity, TaskReminder } from '../entities/task/types';
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

export interface CreateTaskInput {
  title: string;
  rarity: Rarity;
  periodicity: Periodicity;
  deadline?: string;
  reminder?: TaskReminder;
  xpOverride?: number;
}

export async function createTask(input: CreateTaskInput): Promise<string> {
  const now = new Date().toISOString();
  return repoCreateTask({
    ...input,
    createdAt: now,
    updatedAt: now
  });
}

export async function listTasks(): Promise<Task[]> {
  return repoListTasks();
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
