import {
  createProject as repoCreateProject,
  getProject as repoGetProject,
  listProjects as repoListProjects,
  updateProject as repoUpdateProject
} from '../db/repositories/projectsRepo';
import { Project, ProjectStatus } from '../entities/project/types';

const PROJECT_STATUS_ORDER: Record<ProjectStatus, number> = {
  active: 0,
  paused: 1,
  completed: 2,
  archived: 3
};

export interface CreateProjectInput {
  title: string;
  description?: string;
  status?: ProjectStatus;
}

const normalizeProjectText = (value?: string) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeCompletedAt = (status: ProjectStatus, completedAt?: string) => {
  if (status !== 'completed') return completedAt;
  return completedAt ?? new Date().toISOString();
};

export async function createProject(input: CreateProjectInput): Promise<string> {
  const title = input.title.trim();
  if (!title) {
    throw new Error('Project title is required');
  }

  const status = input.status ?? 'active';
  return repoCreateProject({
    title,
    description: normalizeProjectText(input.description),
    status,
    createdAt: new Date().toISOString(),
    completedAt: normalizeCompletedAt(status)
  });
}

export async function updateProject(project: Project): Promise<void> {
  const title = project.title.trim();
  if (!title) {
    throw new Error('Project title is required');
  }

  await repoUpdateProject({
    ...project,
    title,
    description: normalizeProjectText(project.description),
    completedAt: normalizeCompletedAt(project.status, project.completedAt)
  });
}

export async function listProjects(): Promise<Project[]> {
  const projects = await repoListProjects();
  return [...projects].sort((left, right) => {
    const statusDelta = PROJECT_STATUS_ORDER[left.status] - PROJECT_STATUS_ORDER[right.status];
    if (statusDelta !== 0) return statusDelta;
    const leftCreatedAt = Date.parse(left.createdAt);
    const rightCreatedAt = Date.parse(right.createdAt);
    if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
      return rightCreatedAt - leftCreatedAt;
    }
    return left.title.localeCompare(right.title, 'ru-RU');
  });
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  return repoGetProject(projectId);
}
