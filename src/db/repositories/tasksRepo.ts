import { db } from '../index';
import { Task } from '../../entities/task/types';

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
  await db.tasks.add({ ...task, id });
  return id;
}

export async function updateTask(task: Task): Promise<void> {
  await db.tasks.put(task);
}

export async function getTask(id: string): Promise<Task | undefined> {
  return db.tasks.get(id);
}

export async function listTasks(): Promise<Task[]> {
  return db.tasks.toArray();
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}
