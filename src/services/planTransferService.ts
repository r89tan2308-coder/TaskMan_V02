import {
  PlanExportPayload,
  PlanImportPayload,
  PlanImportPreview,
  PlanImportResult,
  PlanImportSelection
} from '../entities/plan/types';
import type { Periodicity, Rarity, Task, TaskBucket } from '../entities/task/types';
import { buildTaskStatusById } from '../logic/taskStatus';
import { xpForTask } from '../logic/xp';
import { listEvents } from '../db/repositories/ledgerRepo';
import { createProject, listProjects } from './projectsService';
import { createTask, listTasks } from './tasksService';

const ALLOWED_BUCKETS: TaskBucket[] = ['today', 'next', 'backlog', 'inbox'];
const ALLOWED_PERIODICITIES: Periodicity[] = ['daily', 'weekly', 'one-time', 'monthly', 'yearly'];
const ALLOWED_RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
const PERIODICITY_ALIASES: Record<string, Periodicity> = {
  none: 'one-time',
  once: 'one-time',
  one_time: 'one-time',
  onetime: 'one-time'
};
const INVALID_PLAN_FORMAT_MESSAGE = 'Файл плана повреждён или имеет неверный формат.';
const INVALID_PLAN_PROJECT_REF_MESSAGE =
  'Некоторые элементы нельзя импортировать из-за неверных ссылок на проекты.';
const DUPLICATE_PLAN_TASK_MESSAGE =
  'Некоторые задачи уже существуют среди открытых. Снимите их перед импортом.';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeText = (value?: string | null) => (value ?? '').trim().toLowerCase();

const pad2 = (value: number) => value.toString().padStart(2, '0');

const getLocalDateString = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const isAllowedBucket = (value: unknown): value is TaskBucket =>
  typeof value === 'string' && ALLOWED_BUCKETS.includes(value as TaskBucket);

const isAllowedPeriodicity = (value: unknown): value is Periodicity =>
  typeof value === 'string' && ALLOWED_PERIODICITIES.includes(value as Periodicity);

const normalizePlanPeriodicity = (value: unknown): Periodicity | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (isAllowedPeriodicity(normalized)) return normalized;
  return PERIODICITY_ALIASES[normalized.toLowerCase()] ?? null;
};

const isAllowedRarity = (value: unknown): value is Rarity =>
  typeof value === 'string' && ALLOWED_RARITIES.includes(value as Rarity);

const normalizePlanPayloadShape = (payload: Record<string, unknown>) => {
  if (Array.isArray(payload.createProjects) && Array.isArray(payload.createTasks)) {
    return payload;
  }

  if (!Array.isArray(payload.projects) || !Array.isArray(payload.tasks)) {
    return payload;
  }

  return {
    schemaVersion: payload.schemaVersion,
    createProjects: payload.projects.map((entry) => {
      if (!isRecord(entry)) return entry;
      return {
        clientId: entry.clientId ?? entry.id,
        title: entry.title,
        description: entry.description
      };
    }),
    createTasks: payload.tasks.map((entry) => {
      if (!isRecord(entry)) return entry;
      return {
        title: entry.title,
        projectRef: entry.projectRef ?? entry.projectId ?? null,
        bucket: entry.bucket,
        dueDate: entry.dueDate ?? null,
        periodicity: entry.periodicity,
        note: entry.note,
        rarity: entry.rarity,
        value: entry.value
      };
    })
  };
};

const isValidPlanDatePart = (year: number, month: number, day: number) => {
  const date = new Date(year, month - 1, day, 0, 0, 0, 0);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
};

export const isPlanDateString = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  return isValidPlanDatePart(Number(match[1]), Number(match[2]), Number(match[3]));
};

export const formatDeadlineAsPlanDate = (deadline?: string) => {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  return getLocalDateString(date);
};

export const parsePlanDateToDeadline = (dueDate: string | null) => {
  if (!dueDate) return undefined;
  if (!isPlanDateString(dueDate)) {
    throw new Error(`Некорректный формат dueDate: ${dueDate}`);
  }
  const [yearRaw, monthRaw, dayRaw] = dueDate.split('-');
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw), 23, 59, 0, 0);
  return date.toISOString();
};

const getTaskValue = (task: Task) =>
  typeof task.xpOverride === 'number' ? task.xpOverride : xpForTask(task);

const buildProjectSignature = (title: string, description?: string | null) =>
  `${normalizeText(title)}|${normalizeText(description)}`;

const buildTaskSignature = ({
  title,
  projectId,
  bucket,
  dueDate,
  periodicity,
  note,
  rarity,
  value
}: {
  title: string;
  projectId?: string | null;
  bucket: TaskBucket;
  dueDate: string | null;
  periodicity: Periodicity;
  note?: string | null;
  rarity: Rarity;
  value: number;
}) =>
  [
    normalizeText(title),
    projectId ?? '',
    bucket,
    dueDate ?? '',
    periodicity,
    normalizeText(note),
    rarity,
    Math.trunc(value)
  ].join('|');

type PlanImportRuntimeContext = {
  existingProjectIds: Set<string>;
  existingProjectTitleById: Map<string, string>;
  projectIdBySignature: Map<string, string>;
  openTaskSignatureSet: Set<string>;
};

const buildPlanImportRuntimeContext = async (): Promise<PlanImportRuntimeContext> => {
  const [existingProjects, existingTasks, events] = await Promise.all([
    listProjects(),
    listTasks(),
    listEvents()
  ]);
  const taskStatusById = buildTaskStatusById(existingTasks, events);

  return {
    existingProjectIds: new Set(existingProjects.map((project) => project.id)),
    existingProjectTitleById: new Map(existingProjects.map((project) => [project.id, project.title])),
    projectIdBySignature: new Map(
      existingProjects.map((project) => [buildProjectSignature(project.title, project.description), project.id])
    ),
    openTaskSignatureSet: new Set(
      existingTasks
        .filter((task) => !task.archived && taskStatusById[task.id] !== 'completed')
        .map((task) =>
          buildTaskSignature({
            title: task.title,
            projectId: task.projectId ?? null,
            bucket: task.bucket,
            dueDate: formatDeadlineAsPlanDate(task.deadline),
            periodicity: task.periodicity,
            note: task.comment ?? null,
            rarity: task.rarity,
            value: getTaskValue(task)
          })
        )
    )
  };
};

export async function buildPlanExportPayload(): Promise<PlanExportPayload> {
  const [projects, tasks, events] = await Promise.all([listProjects(), listTasks(), listEvents()]);
  const taskStatusById = buildTaskStatusById(tasks, events);

  const activeTasks = tasks
    .filter((task) => !task.archived && taskStatusById[task.id] !== 'completed')
    .map((task) => ({
      title: task.title,
      projectId: task.projectId ?? null,
      bucket: task.bucket,
      dueDate: formatDeadlineAsPlanDate(task.deadline),
      periodicity: task.periodicity,
      note: task.comment?.trim() ? task.comment.trim() : undefined,
      rarity: task.rarity,
      value: getTaskValue(task),
      status: 'open' as const
    }))
    .sort((left, right) => {
      const bucketDelta = ALLOWED_BUCKETS.indexOf(left.bucket) - ALLOWED_BUCKETS.indexOf(right.bucket);
      if (bucketDelta !== 0) return bucketDelta;
      return left.title.localeCompare(right.title, 'ru-RU');
    });

  const referencedProjectIds = new Set(
    activeTasks.map((task) => task.projectId).filter((projectId): projectId is string => Boolean(projectId))
  );

  const activeProjects = projects
    .filter((project) => project.status === 'active' || project.status === 'paused')
    .map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status as 'active' | 'paused'
    }))
    .sort((left, right) => left.title.localeCompare(right.title, 'ru-RU'));

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    timezone,
    projects: activeProjects,
    tasks: activeTasks
  };
}

export function validatePlanImportPayload(payload: unknown): PlanImportPayload {
  if (!isRecord(payload)) {
    throw new Error(INVALID_PLAN_FORMAT_MESSAGE);
  }
  const normalizedPayload = normalizePlanPayloadShape(payload);
  if (normalizedPayload.schemaVersion !== 1) {
    throw new Error('Некорректный schemaVersion в файле плана.');
  }
  if (!Array.isArray(normalizedPayload.createProjects)) {
    throw new Error('Некорректный файл плана: createProjects должен быть массивом.');
  }
  if (!Array.isArray(normalizedPayload.createTasks)) {
    throw new Error('Некорректный файл плана: createTasks должен быть массивом.');
  }

  const clientIds = new Set<string>();
  const createProjects = normalizedPayload.createProjects.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Некорректный createProjects[${index}].`);
    }
    const clientId = typeof entry.clientId === 'string' ? entry.clientId.trim() : '';
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const description =
      typeof entry.description === 'string' && entry.description.trim()
        ? entry.description.trim()
        : undefined;
    if (!clientId) {
      throw new Error(`createProjects[${index}].clientId обязателен.`);
    }
    if (clientIds.has(clientId)) {
      throw new Error(`Повторяющийся clientId в createProjects: ${clientId}`);
    }
    if (!title) {
      throw new Error(`createProjects[${index}].title обязателен.`);
    }
    clientIds.add(clientId);
    return { clientId, title, description };
  });

  const createTasks = normalizedPayload.createTasks.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Некорректный createTasks[${index}].`);
    }
    const title = typeof entry.title === 'string' ? entry.title.trim() : '';
    const projectRef =
      entry.projectRef === null || entry.projectRef === undefined
        ? null
        : typeof entry.projectRef === 'string' && entry.projectRef.trim()
        ? entry.projectRef.trim()
        : '__invalid__';
    const bucket = entry.bucket;
    const dueDateRaw = entry.dueDate;
    const periodicity = normalizePlanPeriodicity(entry.periodicity);
    const note = typeof entry.note === 'string' && entry.note.trim() ? entry.note.trim() : undefined;
    const rarity = entry.rarity;
    const value = typeof entry.value === 'number' ? entry.value : Number.NaN;

    if (!title) {
      throw new Error(`createTasks[${index}].title обязателен.`);
    }
    if (projectRef === '__invalid__') {
      throw new Error(`createTasks[${index}].projectRef должен быть строкой или null.`);
    }
    if (!isAllowedBucket(bucket)) {
      throw new Error(`createTasks[${index}] содержит неподдерживаемый bucket.`);
    }
    if (!(dueDateRaw === null || isPlanDateString(dueDateRaw))) {
      throw new Error(`createTasks[${index}] содержит некорректный dueDate.`);
    }
    if (!periodicity) {
      throw new Error(
        `createTasks[${index}] содержит неподдерживаемую periodicity. Разрешены: daily, weekly, one-time, monthly, yearly.`
      );
    }
    if (!isAllowedRarity(rarity)) {
      throw new Error(`createTasks[${index}] содержит неподдерживаемую rarity.`);
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`createTasks[${index}].value должен быть положительным числом.`);
    }

    const dueDate: string | null = typeof dueDateRaw === 'string' ? dueDateRaw.trim() : null;

    return {
      title,
      projectRef,
      bucket,
      dueDate,
      periodicity,
      note,
      rarity,
      value: Math.round(value)
    };
  });

  return {
    schemaVersion: 1,
    createProjects,
    createTasks
  };
}

export async function preparePlanImportPreview(payload: unknown): Promise<PlanImportPreview> {
  const validated = validatePlanImportPayload(payload);
  const runtime = await buildPlanImportRuntimeContext();

  const projectPreviewByClientId = new Map<
    string,
    {
      clientId: string;
      title: string;
      description?: string;
      mode: 'create' | 'reuse';
      existingProjectId?: string;
      existingProjectTitle?: string;
    }
  >();

  const projects = validated.createProjects.map((project) => {
    const existingProjectId = runtime.projectIdBySignature.get(
      buildProjectSignature(project.title, project.description)
    );
    const previewProject = {
      id: `project:${project.clientId}`,
      clientId: project.clientId,
      title: project.title,
      description: project.description,
      mode: existingProjectId ? 'reuse' as const : 'create' as const,
      existingProjectId,
      existingProjectTitle: existingProjectId
        ? runtime.existingProjectTitleById.get(existingProjectId) ?? project.title
        : undefined
    };
    projectPreviewByClientId.set(project.clientId, previewProject);
    return previewProject;
  });

  const tasks = validated.createTasks.map((task, index) => {
    let projectMode: 'none' | 'create' | 'reuse' | 'existing' = 'none';
    let projectClientId: string | undefined;
    let projectId: string | null = null;
    let projectTitle: string | undefined;

    if (task.projectRef) {
      const previewProject = projectPreviewByClientId.get(task.projectRef);
      if (previewProject) {
        projectMode = previewProject.mode;
        projectClientId = previewProject.clientId;
        projectId = previewProject.existingProjectId ?? null;
        projectTitle = previewProject.existingProjectTitle ?? previewProject.title;
      } else if (runtime.existingProjectIds.has(task.projectRef)) {
        projectMode = 'existing';
        projectId = task.projectRef;
        projectTitle = runtime.existingProjectTitleById.get(task.projectRef) ?? 'Существующий проект';
      } else {
        throw new Error(INVALID_PLAN_PROJECT_REF_MESSAGE);
      }
    }

    const duplicateProjectId =
      projectMode === 'create' && projectClientId ? `__new-project:${projectClientId}` : projectId;
    const exactDuplicate = runtime.openTaskSignatureSet.has(
      buildTaskSignature({
        title: task.title,
        projectId: duplicateProjectId ?? null,
        bucket: task.bucket,
        dueDate: task.dueDate,
        periodicity: task.periodicity,
        note: task.note ?? null,
        rarity: task.rarity,
        value: task.value
      })
    );

    return {
      id: `task:${index}`,
      index,
      title: task.title,
      projectRef: task.projectRef ?? null,
      projectClientId,
      projectId,
      projectTitle,
      projectMode,
      bucket: task.bucket,
      dueDate: task.dueDate,
      periodicity: task.periodicity,
      note: task.note,
      rarity: task.rarity,
      value: task.value,
      exactDuplicate,
      duplicateWarning: exactDuplicate ? 'Похоже, такая открытая задача уже есть.' : undefined
    };
  });

  return {
    schemaVersion: 1,
    payload: validated,
    projects,
    tasks
  };
}

export function buildDefaultPlanImportSelection(preview: PlanImportPreview): PlanImportSelection {
  return {
    projectClientIds: preview.projects.map((project) => project.clientId),
    taskIds: preview.tasks.filter((task) => !task.exactDuplicate).map((task) => task.id)
  };
}

const applyValidatedPlanImportPayload = async (
  validated: PlanImportPayload,
  runtime?: PlanImportRuntimeContext
): Promise<PlanImportResult> => {
  const resolvedRuntime = runtime ?? (await buildPlanImportRuntimeContext());
  const existingProjectIds = new Set(resolvedRuntime.existingProjectIds);
  const projectIdByClientId = new Map<string, string>();
  const projectIdBySignature = new Map(resolvedRuntime.projectIdBySignature);
  const openTaskSignatureSet = new Set(resolvedRuntime.openTaskSignatureSet);
  const createdProjectIds = new Set<string>();

  let createdProjects = 0;
  let reusedProjects = 0;
  for (const project of validated.createProjects) {
    const signature = buildProjectSignature(project.title, project.description);
    const existingId = projectIdBySignature.get(signature);
    if (existingId) {
      projectIdByClientId.set(project.clientId, existingId);
      reusedProjects += 1;
      continue;
    }
    const nextId = await createProject({
      title: project.title,
      description: project.description
    });
    projectIdByClientId.set(project.clientId, nextId);
    projectIdBySignature.set(signature, nextId);
    existingProjectIds.add(nextId);
    createdProjectIds.add(nextId);
    createdProjects += 1;
  }

  let createdTasks = 0;
  let skippedTasks = 0;
  const linkedExistingProjectIds = new Set<string>();

  for (const task of validated.createTasks) {
    let resolvedProjectId: string | undefined;
    if (task.projectRef) {
      if (projectIdByClientId.has(task.projectRef)) {
        resolvedProjectId = projectIdByClientId.get(task.projectRef);
        if (resolvedProjectId && !createdProjectIds.has(resolvedProjectId)) {
          linkedExistingProjectIds.add(resolvedProjectId);
        }
      } else if (existingProjectIds.has(task.projectRef)) {
        resolvedProjectId = task.projectRef;
        if (!createdProjectIds.has(task.projectRef)) {
          linkedExistingProjectIds.add(task.projectRef);
        }
      } else {
        throw new Error(INVALID_PLAN_PROJECT_REF_MESSAGE);
      }
    }

    const signature = buildTaskSignature({
      title: task.title,
      projectId: resolvedProjectId ?? null,
      bucket: task.bucket,
      dueDate: task.dueDate,
      periodicity: task.periodicity,
      note: task.note ?? null,
      rarity: task.rarity,
      value: task.value
    });

    if (openTaskSignatureSet.has(signature)) {
      skippedTasks += 1;
      continue;
    }

    await createTask({
      title: task.title,
      projectId: resolvedProjectId,
      bucket: task.bucket,
      deadline: parsePlanDateToDeadline(task.dueDate),
      periodicity: task.periodicity,
      comment: task.note,
      rarity: task.rarity,
      xpOverride: task.value
    });

    openTaskSignatureSet.add(signature);
    createdTasks += 1;
  }

  return {
    createdProjects,
    reusedProjects,
    linkedExistingProjects: linkedExistingProjectIds.size,
    createdTasks,
    skippedTasks
  };
};

export async function applyPlanImportSelection(
  preview: PlanImportPreview,
  selection: PlanImportSelection
): Promise<PlanImportResult> {
  const selectedProjectClientIds = new Set(selection.projectClientIds);
  const selectedTaskIds = new Set(selection.taskIds);

  for (const task of preview.tasks) {
    if (!selectedTaskIds.has(task.id)) continue;
    if (task.exactDuplicate) {
      throw new Error(DUPLICATE_PLAN_TASK_MESSAGE);
    }
    if (task.projectClientId && !selectedProjectClientIds.has(task.projectClientId)) {
      throw new Error(INVALID_PLAN_PROJECT_REF_MESSAGE);
    }
  }

  const taskIndexSet = new Set(
    preview.tasks.filter((task) => selectedTaskIds.has(task.id)).map((task) => task.index)
  );

  return applyValidatedPlanImportPayload({
    schemaVersion: 1,
    createProjects: preview.payload.createProjects.filter((project) =>
      selectedProjectClientIds.has(project.clientId)
    ),
    createTasks: preview.payload.createTasks.filter((_task, index) => taskIndexSet.has(index))
  });
}

export async function importPlanPayload(payload: unknown): Promise<PlanImportResult> {
  const preview = await preparePlanImportPreview(payload);
  return applyPlanImportSelection(preview, buildDefaultPlanImportSelection(preview));
}
