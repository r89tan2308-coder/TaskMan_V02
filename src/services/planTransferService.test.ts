import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/repositories/ledgerRepo', () => ({
  listEvents: vi.fn()
}));

vi.mock('./projectsService', () => ({
  createProject: vi.fn(),
  listProjects: vi.fn()
}));

vi.mock('./tasksService', () => ({
  createTask: vi.fn(),
  listTasks: vi.fn()
}));

import { listEvents } from '../db/repositories/ledgerRepo';
import { createProject, listProjects } from './projectsService';
import { createTask, listTasks } from './tasksService';
import {
  applyPlanImportSelection,
  buildDefaultPlanImportSelection,
  formatDeadlineAsPlanDate,
  isPlanDateString,
  parsePlanDateToDeadline,
  preparePlanImportPreview,
  validatePlanImportPayload
} from './planTransferService';

const listEventsMock = vi.mocked(listEvents);
const listProjectsMock = vi.mocked(listProjects);
const createProjectMock = vi.mocked(createProject);
const listTasksMock = vi.mocked(listTasks);
const createTaskMock = vi.mocked(createTask);

describe('planTransferService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEventsMock.mockResolvedValue([]);
    listProjectsMock.mockResolvedValue([]);
    createProjectMock.mockResolvedValue('project-created');
    listTasksMock.mockResolvedValue([]);
    createTaskMock.mockResolvedValue('task-created');
  });

  it('validates plan date strings', () => {
    expect(isPlanDateString('2026-04-15')).toBe(true);
    expect(isPlanDateString('2026-02-30')).toBe(false);
    expect(isPlanDateString('15-04-2026')).toBe(false);
  });

  it('converts due date to deadline and back', () => {
    const deadline = parsePlanDateToDeadline('2026-04-15');
    expect(deadline).toBeTruthy();
    expect(formatDeadlineAsPlanDate(deadline)).toBe('2026-04-15');
  });

  it('validates minimal import payload', () => {
    const payload = validatePlanImportPayload({
      schemaVersion: 1,
      createProjects: [{ clientId: 'proj-a', title: 'Alpha' }],
      createTasks: [
        {
          title: 'Task A',
          projectRef: 'proj-a',
          bucket: 'next',
          dueDate: '2026-04-15',
          periodicity: 'one-time',
          note: 'Some note',
          rarity: 'common',
          value: 5
        }
      ]
    });

    expect(payload.createProjects).toHaveLength(1);
    expect(payload.createTasks).toHaveLength(1);
    expect(payload.createTasks[0].value).toBe(5);
  });

  it('accepts the plan export format as an import source', () => {
    const payload = validatePlanImportPayload({
      schemaVersion: 1,
      exportedAt: '2026-04-24T09:00:00.000Z',
      timezone: 'Europe/Moscow',
      projects: [
        {
          id: 'project-a',
          title: 'Alpha',
          description: 'From export',
          status: 'active'
        }
      ],
      tasks: [
        {
          title: 'Task A',
          projectId: 'project-a',
          bucket: 'next',
          dueDate: '2026-04-15',
          periodicity: 'one-time',
          rarity: 'common',
          value: 5,
          status: 'open'
        }
      ]
    });

    expect(payload.createProjects).toEqual([
      {
        clientId: 'project-a',
        title: 'Alpha',
        description: 'From export'
      }
    ]);
    expect(payload.createTasks[0]).toMatchObject({
      title: 'Task A',
      projectRef: 'project-a',
      bucket: 'next'
    });
  });

  it('normalizes none periodicity to one-time', () => {
    const payload = validatePlanImportPayload({
      schemaVersion: 1,
      createProjects: [],
      createTasks: [
        {
          title: 'Task B',
          bucket: 'today',
          dueDate: null,
          periodicity: 'none',
          rarity: 'common',
          value: 2
        }
      ]
    });

    expect(payload.createTasks[0].periodicity).toBe('one-time');
  });

  it('rejects invalid bucket values', () => {
    expect(() =>
      validatePlanImportPayload({
        schemaVersion: 1,
        createProjects: [],
        createTasks: [
          {
            title: 'Task A',
            bucket: 'later',
            dueDate: null,
            periodicity: 'one-time',
            rarity: 'common',
            value: 5
          }
        ]
      })
    ).toThrow(/bucket/i);
  });

  it('builds preview with existing and new project references', async () => {
    listProjectsMock.mockResolvedValue([
      {
        id: 'existing-project',
        title: 'Existing',
        description: 'Already here',
        status: 'active',
        createdAt: '2026-04-01T00:00:00.000Z'
      }
    ]);

    const preview = await preparePlanImportPreview({
      schemaVersion: 1,
      createProjects: [{ clientId: 'proj-a', title: 'Alpha' }],
      createTasks: [
        {
          title: 'Task A',
          projectRef: 'proj-a',
          bucket: 'today',
          dueDate: null,
          periodicity: 'one-time',
          rarity: 'common',
          value: 5
        },
        {
          title: 'Task B',
          projectRef: 'existing-project',
          bucket: 'next',
          dueDate: '2026-04-16',
          periodicity: 'weekly',
          rarity: 'rare',
          value: 8
        }
      ]
    });

    expect(preview.projects[0].mode).toBe('create');
    expect(preview.tasks[0].projectMode).toBe('create');
    expect(preview.tasks[1].projectMode).toBe('existing');
    expect(preview.tasks[1].projectTitle).toBe('Existing');
  });

  it('rejects preview when projectRef cannot be resolved', async () => {
    await expect(
      preparePlanImportPreview({
        schemaVersion: 1,
        createProjects: [],
        createTasks: [
          {
            title: 'Task A',
            projectRef: 'missing-project',
            bucket: 'today',
            dueDate: null,
            periodicity: 'one-time',
            rarity: 'common',
            value: 5
          }
        ]
      })
    ).rejects.toThrow(/ссылок на проекты/i);
  });

  it('excludes exact duplicate tasks from default selection', async () => {
    listTasksMock.mockResolvedValue([
      {
        id: 'existing-task',
        title: 'Task A',
        bucket: 'today',
        deadline: undefined,
        periodicity: 'one-time',
        comment: 'Same note',
        rarity: 'common',
        xpOverride: 5,
        archived: false,
        createdAt: '2026-04-01T00:00:00.000Z',
        updatedAt: '2026-04-01T00:00:00.000Z'
      }
    ]);

    const preview = await preparePlanImportPreview({
      schemaVersion: 1,
      createProjects: [],
      createTasks: [
        {
          title: 'Task A',
          bucket: 'today',
          dueDate: null,
          periodicity: 'one-time',
          note: 'Same note',
          rarity: 'common',
          value: 5
        }
      ]
    });

    const selection = buildDefaultPlanImportSelection(preview);

    expect(preview.tasks[0].exactDuplicate).toBe(true);
    expect(selection.taskIds).toHaveLength(0);
  });

  it('blocks selected tasks whose referenced project was deselected', async () => {
    const preview = await preparePlanImportPreview({
      schemaVersion: 1,
      createProjects: [{ clientId: 'proj-a', title: 'Alpha' }],
      createTasks: [
        {
          title: 'Task A',
          projectRef: 'proj-a',
          bucket: 'next',
          dueDate: null,
          periodicity: 'one-time',
          rarity: 'common',
          value: 5
        }
      ]
    });

    await expect(
      applyPlanImportSelection(preview, {
        projectClientIds: [],
        taskIds: ['task:0']
      })
    ).rejects.toThrow(/ссылок на проекты/i);
  });

  it('imports only selected projects and tasks', async () => {
    createProjectMock.mockResolvedValue('new-project-id');

    const preview = await preparePlanImportPreview({
      schemaVersion: 1,
      createProjects: [
        { clientId: 'proj-a', title: 'Alpha' },
        { clientId: 'proj-b', title: 'Beta' }
      ],
      createTasks: [
        {
          title: 'Task A',
          projectRef: 'proj-a',
          bucket: 'today',
          dueDate: '2026-04-16',
          periodicity: 'one-time',
          rarity: 'rare',
          value: 7
        },
        {
          title: 'Task B',
          bucket: 'backlog',
          dueDate: null,
          periodicity: 'monthly',
          rarity: 'common',
          value: 3
        }
      ]
    });

    const result = await applyPlanImportSelection(preview, {
      projectClientIds: ['proj-a'],
      taskIds: ['task:0']
    });

    expect(createProjectMock).toHaveBeenCalledTimes(1);
    expect(createProjectMock).toHaveBeenCalledWith({
      title: 'Alpha',
      description: undefined
    });
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith({
      title: 'Task A',
      projectId: 'new-project-id',
      bucket: 'today',
      deadline: expect.any(String),
      periodicity: 'one-time',
      comment: undefined,
      rarity: 'rare',
      xpOverride: 7
    });
    expect(result.createdProjects).toBe(1);
    expect(result.createdTasks).toBe(1);
  });
});
