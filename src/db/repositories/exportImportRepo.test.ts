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

import { readAllForExport, replaceAllFromImport } from './exportImportRepo';

const tables = [
  mockDb.db.tasks,
  mockDb.db.projects,
  mockDb.db.rewards,
  mockDb.db.dailyLogs,
  mockDb.db.ledgerEvents,
  mockDb.db.appMeta
];

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
    const task = {
      id: 'task-1',
      title: 'Backup task',
      bucket: 'today',
      rarity: 'common',
      periodicity: 'one-time',
      createdAt: '2026-04-24T06:00:00.000Z',
      updatedAt: '2026-04-24T06:00:00.000Z'
    };
    const project = {
      id: 'project-1',
      title: 'Backup project',
      status: 'active',
      createdAt: '2026-04-24T06:00:00.000Z'
    };
    const reward = { id: 'reward-1', name: 'Coffee', cost: 10 };
    const ledgerEvent = {
      id: 'event-1',
      kind: 'task',
      taskId: 'task-1',
      deltaXp: 5,
      createdAt: '2026-04-24T06:30:00.000Z'
    };

    mockDb.db.tasks.state.rows = [task];
    mockDb.db.projects.state.rows = [project];
    mockDb.db.rewards.state.rows = [reward];
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
    expect(mockDb.db.ledgerEvents.bulkAdd).toHaveBeenCalledWith([ledgerEvent]);
    expect(mockDb.db.appMeta.bulkAdd).toHaveBeenCalledWith([
      {
        key: 'interfaceTheme',
        value: 'classic',
        updatedAt: expect.any(String)
      }
    ]);
  });
});
