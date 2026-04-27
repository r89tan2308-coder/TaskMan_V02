import { addEvent, listEvents } from '../db/repositories/ledgerRepo';
import { getProject as repoGetProject, updateProject as repoUpdateProject } from '../db/repositories/projectsRepo';
import { getTask as repoGetTask, listTasks as repoListTasks } from '../db/repositories/tasksRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { Task } from '../entities/task/types';
import { getProjectCompletionBonusXp } from '../logic/projectBonus';
import { getProjectTasks, isProjectCompleted } from '../logic/projects';
import { buildTaskStatusById } from '../logic/taskStatus';
import { xpForTask } from '../logic/xp';

export type TaskEventType = 'TASK_DONE' | 'TASK_UNDO' | 'TASK_MISSED';

export interface ProjectCompletionBonusAward {
  projectId: string;
  projectTitle: string;
  bonusXp: number;
  awardedAt: string;
  eventId: string;
}

export interface LoggedTaskEventResult {
  event: LedgerEvent;
  projectBonus: ProjectCompletionBonusAward | null;
}

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

const toIsoTimestamp = (occurredAt?: string | number | Date) => {
  if (occurredAt instanceof Date) return occurredAt.toISOString();
  if (typeof occurredAt === 'number') return new Date(occurredAt).toISOString();
  if (typeof occurredAt === 'string' && occurredAt.trim()) {
    const parsed = Date.parse(occurredAt);
    return Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString();
  }
  return new Date().toISOString();
};

const buildTaskEvent = (task: Task, eventType: TaskEventType, createdAt: string): LedgerEvent => {
  const baseXp = xpForTask(task);
  const deltaXp = eventType === 'TASK_DONE' ? baseXp : -baseXp;
  return {
    id: generateId(),
    kind: 'task',
    taskId: task.id,
    deltaXp,
    createdAt,
    note: eventType,
    meta: {
      eventType,
      refId: task.id,
      projectId: task.projectId ?? null
    }
  };
};

const maybeAwardProjectCompletionBonus = async (
  task: Task,
  createdAt: string
): Promise<ProjectCompletionBonusAward | null> => {
  if (!task.projectId) return null;
  const project = await repoGetProject(task.projectId);
  if (!project || project.completionBonusAwardedAt || typeof project.completionBonusXp === 'number') {
    return null;
  }

  const [tasks, events] = await Promise.all([repoListTasks(), listEvents()]);
  const taskStatusById = buildTaskStatusById(tasks, events);
  if (!isProjectCompleted(tasks, taskStatusById, project.id)) {
    return null;
  }

  const projectTasks = getProjectTasks(tasks, project.id);
  const bonusXp = getProjectCompletionBonusXp(projectTasks);
  if (bonusXp === null) {
    return null;
  }

  const bonusEvent: LedgerEvent = {
    id: generateId(),
    kind: 'adjustment',
    deltaXp: bonusXp,
    createdAt,
    note: 'PROJECT_COMPLETION_BONUS',
    meta: {
      eventType: 'PROJECT_COMPLETION_BONUS',
      projectId: project.id,
      title: project.title,
      bonusXp
    }
  };

  await addEvent(bonusEvent);
  await repoUpdateProject({
    ...project,
    completedAt: project.completedAt ?? createdAt,
    completionBonusXp: bonusXp,
    completionBonusAwardedAt: createdAt,
    completionBonusEventId: bonusEvent.id
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    bonusXp,
    awardedAt: createdAt,
    eventId: bonusEvent.id
  };
};

export async function logTaskEvent(
  task: Task,
  eventType: TaskEventType,
  occurredAt?: string | number | Date
): Promise<LoggedTaskEventResult> {
  const createdAt = toIsoTimestamp(occurredAt);
  const event = buildTaskEvent(task, eventType, createdAt);
  await addEvent(event);

  const projectBonus =
    eventType === 'TASK_DONE' ? await maybeAwardProjectCompletionBonus(task, createdAt) : null;

  return { event, projectBonus };
}

export async function logTaskEventByTaskId(
  taskId: string,
  eventType: TaskEventType,
  occurredAt?: string | number | Date
): Promise<LoggedTaskEventResult> {
  const task = await repoGetTask(taskId);
  if (!task) throw new Error('Task not found');
  return logTaskEvent(task, eventType, occurredAt);
}
