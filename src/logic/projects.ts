import { Task } from '../entities/task/types';
import { TaskStatus } from './taskStatus';

const isProjectTask = (task: Task, projectId: string) => task.projectId === projectId;

const isActiveTaskStatus = (status: TaskStatus | undefined) =>
  status === 'pending' || status === 'overdue' || status === 'missed';

const isCompletedTaskStatus = (status: TaskStatus | undefined) => status === 'completed';

export const getProjectTasks = (tasks: Task[], projectId: string) =>
  tasks.filter((task) => isProjectTask(task, projectId));

export const getProjectActiveTasks = (
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>,
  projectId: string
) =>
  getProjectTasks(tasks, projectId).filter((task) => isActiveTaskStatus(taskStatusById[task.id]));

export const getProjectCompletedTasks = (
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>,
  projectId: string
) =>
  getProjectTasks(tasks, projectId).filter((task) => isCompletedTaskStatus(taskStatusById[task.id]));

export const getProjectCompletedCount = (
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>,
  projectId: string
) => getProjectCompletedTasks(tasks, taskStatusById, projectId).length;

export const getProjectProgress = (
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>,
  projectId: string
) => {
  const projectTasks = getProjectTasks(tasks, projectId);
  if (projectTasks.length === 0) return 0;
  const completedCount = getProjectCompletedCount(tasks, taskStatusById, projectId);
  return Math.round((completedCount / projectTasks.length) * 100);
};

export const isProjectCompleted = (
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>,
  projectId: string
) => {
  const projectTasks = getProjectTasks(tasks, projectId);
  if (projectTasks.length === 0) return false;
  return getProjectCompletedCount(tasks, taskStatusById, projectId) === projectTasks.length;
};
