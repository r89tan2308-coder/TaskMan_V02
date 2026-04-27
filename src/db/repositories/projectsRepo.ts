import { db } from '../index';
import { Project } from '../../entities/project/types';

const generateId = (): string => {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

export async function createProject(
  project: Omit<Project, 'id'> & Partial<Pick<Project, 'id'>>
): Promise<string> {
  const id = project.id ?? generateId();
  await db.projects.add({ ...project, id } as Project);
  return id;
}

export async function updateProject(project: Project): Promise<void> {
  await db.projects.put(project);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function listProjects(): Promise<Project[]> {
  return db.projects.toArray();
}
