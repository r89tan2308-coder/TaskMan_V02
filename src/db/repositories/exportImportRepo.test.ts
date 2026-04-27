import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => {
  const makeTable = () => {
    const state = {
      rows: [] as unknown[],
      added: [] as unknown[]
    };
    return {
      state,
      toArray: vi.fn(async () => state.rows),
      clear: vi.fn(async () => {
        state.rows = [];
      }),
      bulkAdd: vi.fn(async (items: unknown[]) => {
        state.added.push(...items);
        state.rows.push(...items);
      })
    };
  };

  const db = {
    tasks: makeTable(),
    projects: makeTable(),
    rewards: makeTable(),
    dailyLogs: makeTable(),
    ledgerEvents: makeTable(),
    appMeta: makeTable(),
    transaction: vi.fn(async (_mode: string, _tables: unknown[], callback: () => Promise<void>) =>
      callback()
    )
  };

  return { db };
});

vi.mock('../index', () => ({
  db: mockDb.db
}));

import { readAllForExport, replaceAllFromImport, validateBackupImportPayload } from './exportImportRepo';

const tables = [
  mockDb.db.tasks,
  mockDb.db.projects,
  mockDb.db.rewards,
  mockDb.db.dailyLogs,
  mockDb.db.ledgerEvents,
  mockDb.db.appMeta
];

const createdAt = '2026-04-24T06:00:00.000Z';
const updatedAt = '2026-04-24T07:00:00.000Z';

const makeTask = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  title: 'Backup task',
  bucket: 'today',
  rarity: 'common',
  periodicity: 'one-time',
  createdAt,
  updatedAt,
  ...overrides
});

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: 'project-1',
  title: 'Backup project',
  status: 'active',
  createdAt,
  ...overrides
});

const makeReward = (overrides: Record<string, unknown> = {}) => ({
  id: 'reward-1',
  name: 'Coffee',
  cost: 10,
  repeatable: true,
  createdAt,
  updatedAt,
  ...overrides
});

const makeDailyLog = (overrides: Record<string, unknown> = {}) => ({
  id: 'daily-log-1',
  taskId: 'task-1',
  date: '2026-04-24',
  loggedAt: '2026-04-24T08:00:00.000Z',
  deltaXp: 5,
  ...overrides
});

const makeLedgerEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'event-1',
  kind: 'task',
  taskId: 'task-1',
  deltaXp: 5,
  createdAt: '2026-04-24T08:00:00.000Z',
  ...overrides
});

const makeBackupBundle = (overrides: Record<string, unknown> = {}) => ({
  meta: {
    schemaVersion: 1,
    exportedAt: '2026-04-24T09:00:00.000Z',
    source: 'taskman-pwa'
  },
  tasks: [makeTask()],
  projects: [makeProject()],
  rewards: [makeReward()],
  dailyLogs: [makeDailyLog()],
  ledgerEvents: [makeLedgerEvent()],
  appMeta: {
    interfaceTheme: 'classic'
  },
  ...overrides
});

const expectNoDestructiveWrites = () => {
  expect(mockDb.db.transaction).not.toHaveBeenCalled();
  for (const table of tables) {
    expect(table.clear).not.toHaveBeenCalled();
    expect(table.bulkAdd).not.toHaveBeenCalled();
  }
};

const expectInvalidImportToRejectBeforeRestore = async (payload: unknown) => {
  await expect(replaceAllFromImport(payload as never)).rejects.toThrow(/Invalid backup import/);
  expectNoDestructiveWrites();
};

describe('exportImportRepo', () => {
  beforeEach(() => {
    for (const table of tables) {
      table.state.rows = [];
      table.state.added = [];
      table.toArray.mockClear();
      table.clear.mockClear();
      table.bulkAdd.mockClear();
    }
    mockDb.db.transaction.mockClear();
  });

  it('restores the flat backup bundle produced by readAllForExport', async () => {
    const task = makeTask();
    const project = makeProject();
    const reward = makeReward();
    const dailyLog = makeDailyLog();
    const ledgerEvent = makeLedgerEvent();

    mockDb.db.tasks.state.rows = [task];
    mockDb.db.projects.state.rows = [project];
    mockDb.db.rewards.state.rows = [reward];
    mockDb.db.dailyLogs.state.rows = [dailyLog];
    mockDb.db.ledgerEvents.state.rows = [ledgerEvent];
    mockDb.db.appMeta.state.rows = [
      {
        key: 'interfaceTheme',
        value: 'classic',
        updatedAt: '2026-04-24T07:00:00.000Z'
      }
    ];

    const exported = await readAllForExport({
      schemaVersion: 1,
      exportedAt: '2026-04-24T08:00:00.000Z',
      source: 'taskman-pwa'
    });

    await replaceAllFromImport(exported);

    expect(mockDb.db.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.db.tasks.clear).toHaveBeenCalledTimes(1);
    expect(mockDb.db.projects.clear).toHaveBeenCalledTimes(1);
    expect(mockDb.db.tasks.bulkAdd).toHaveBeenCalledWith([task]);
    expect(mockDb.db.projects.bulkAdd).toHaveBeenCalledWith([project]);
    expect(mockDb.db.rewards.bulkAdd).toHaveBeenCalledWith([reward]);
    expect(mockDb.db.dailyLogs.bulkAdd).toHaveBeenCalledWith([dailyLog]);
    expect(mockDb.db.ledgerEvents.bulkAdd).toHaveBeenCalledWith([ledgerEvent]);
    expect(mockDb.db.appMeta.bulkAdd).toHaveBeenCalledWith([
      {
        key: 'interfaceTheme',
        value: 'classic',
        updatedAt: expect.any(String)
      }
    ]);
  });

  it('validates the current flat export bundle format', () => {
    expect(validateBackupImportPayload(makeBackupBundle())).toMatchObject({
      meta: {
        schemaVersion: 1,
        source: 'taskman-pwa'
      },
      data: {
        tasks: [{ id: 'task-1' }],
        projects: [{ id: 'project-1' }],
        rewards: [{ id: 'reward-1' }],
        dailyLogs: [{ id: 'daily-log-1' }],
        ledgerEvents: [{ id: 'event-1' }],
        appMeta: {
          interfaceTheme: 'classic'
        }
      }
    });
  });

  it('keeps minimal support for the legacy { meta, data } wrapper', async () => {
    const { meta, ...data } = makeBackupBundle();

    await replaceAllFromImport({ meta, data } as never);

    expect(mockDb.db.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.db.tasks.bulkAdd).toHaveBeenCalledWith(data.tasks);
  });

  it('rejects missing collections before restore', async () => {
    const { rewards: _rewards, ...payload } = makeBackupBundle();

    await expectInvalidImportToRejectBeforeRestore(payload);
  });

  it('rejects non-array collections before restore', async () => {
    await expectInvalidImportToRejectBeforeRestore(makeBackupBundle({ tasks: {} }));
  });

  it('rejects wrong schemaVersion before restore', async () => {
    await expectInvalidImportToRejectBeforeRestore(
      makeBackupBundle({
        meta: {
          schemaVersion: 2,
          exportedAt: '2026-04-24T09:00:00.000Z'
        }
      })
    );
  });

  it.each([
    ['tasks', { tasks: [makeTask(), makeTask({ title: 'Duplicate task title' })] }],
    ['projects', { projects: [makeProject(), makeProject({ title: 'Duplicate project title' })] }],
    ['rewards', { rewards: [makeReward(), makeReward({ name: 'Duplicate reward name' })] }],
    ['dailyLogs', { dailyLogs: [makeDailyLog(), makeDailyLog({ date: '2026-04-25' })] }],
    [
      'ledgerEvents',
      { ledgerEvents: [makeLedgerEvent(), makeLedgerEvent({ deltaXp: -5 })] }
    ]
  ])('rejects duplicate %s ids before restore', async (_collection, override) => {
    await expectInvalidImportToRejectBeforeRestore(makeBackupBundle(override));
  });

  it.each([
    ['invalid task enum', { tasks: [makeTask({ bucket: 'later' })] }],
    ['invalid reward number', { rewards: [makeReward({ cost: Number.NaN })] }],
    ['invalid daily log date', { dailyLogs: [makeDailyLog({ date: '2026-02-31' })] }],
    ['invalid ledger date', { ledgerEvents: [makeLedgerEvent({ createdAt: 'not-a-date' })] }]
  ])('rejects %s before restore', async (_label, override) => {
    await expectInvalidImportToRejectBeforeRestore(makeBackupBundle(override));
  });

  it.each([
    ['task projectId', { tasks: [makeTask({ projectId: 'missing-project' })] }],
    ['daily log taskId', { dailyLogs: [makeDailyLog({ taskId: 'missing-task' })] }],
    ['ledger taskId', { ledgerEvents: [makeLedgerEvent({ taskId: 'missing-task' })] }],
    [
      'ledger rewardId',
      {
        ledgerEvents: [
          makeLedgerEvent({
            id: 'reward-event-1',
            kind: 'reward',
            taskId: undefined,
            rewardId: 'missing-reward',
            deltaXp: -10
          })
        ]
      }
    ]
  ])('rejects broken %s references before restore', async (_label, override) => {
    await expectInvalidImportToRejectBeforeRestore(makeBackupBundle(override));
  });
});
