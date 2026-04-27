import type { Periodicity, Rarity, TaskBucket } from '../task/types';

export interface PlanExportProject {
  id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused';
}

export interface PlanExportTask {
  title: string;
  projectId?: string | null;
  bucket: TaskBucket;
  dueDate: string | null;
  periodicity: Periodicity;
  note?: string;
  rarity: Rarity;
  value: number;
  status: 'open';
}

export interface PlanExportPayload {
  schemaVersion: 1;
  exportedAt: string;
  timezone: string;
  projects: PlanExportProject[];
  tasks: PlanExportTask[];
}

export interface PlanImportProjectInput {
  clientId: string;
  title: string;
  description?: string;
}

export interface PlanImportTaskInput {
  title: string;
  projectRef?: string | null;
  bucket: TaskBucket;
  dueDate: string | null;
  periodicity: Periodicity;
  note?: string;
  rarity: Rarity;
  value: number;
}

export interface PlanImportPayload {
  schemaVersion: 1;
  createProjects: PlanImportProjectInput[];
  createTasks: PlanImportTaskInput[];
}

export interface PlanImportProjectPreview {
  id: string;
  clientId: string;
  title: string;
  description?: string;
  mode: 'create' | 'reuse';
  existingProjectId?: string;
  existingProjectTitle?: string;
}

export interface PlanImportTaskPreview {
  id: string;
  index: number;
  title: string;
  projectRef?: string | null;
  projectClientId?: string;
  projectId?: string | null;
  projectTitle?: string;
  projectMode: 'none' | 'create' | 'reuse' | 'existing';
  bucket: TaskBucket;
  dueDate: string | null;
  periodicity: Periodicity;
  note?: string;
  rarity: Rarity;
  value: number;
  exactDuplicate: boolean;
  duplicateWarning?: string;
}

export interface PlanImportPreview {
  schemaVersion: 1;
  payload: PlanImportPayload;
  projects: PlanImportProjectPreview[];
  tasks: PlanImportTaskPreview[];
}

export interface PlanImportSelection {
  projectClientIds: string[];
  taskIds: string[];
}

export interface PlanImportResult {
  createdProjects: number;
  reusedProjects: number;
  linkedExistingProjects: number;
  createdTasks: number;
  skippedTasks: number;
}
