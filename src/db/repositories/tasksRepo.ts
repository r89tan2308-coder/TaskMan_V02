import { db } from '../index';
import { Task } from '../../entities/task/types';
import { ensureTaskBucket } from '../../entities/task/buckets';

const generateId = (): string => {
  const uuid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

export async function createTask(task: Omit<Task, 'id'> & Partial<Pick<Task, 'id'>>): Promise<string> {
  const id = task.id ?? generateId();
  await db.tasks.add(ensureTaskBucket({ ...task, id } as Task));
  return id;
}

export async function updateTask(task: Task): Promise<void> {
  await db.tasks.put(ensureTaskBucket(task));
}

export async function getTask(id: string): Promise<Task | undefined> {
  const task = await db.tasks.get(id);
  return task ? ensureTaskBucket(task) : undefined;
}

export async function listTasks(): Promise<Task[]> {
  const tasks = await db.tasks.toArray();
  return tasks.map((task) => ensureTaskBucket(task));
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}
