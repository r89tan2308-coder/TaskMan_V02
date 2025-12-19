import Dexie, { Table } from 'dexie';
import { Task } from '../entities/task/types';
import { Reward } from '../entities/reward/types';
import { DailyLogEntry } from '../entities/dailyLog/types';
import { LedgerEvent } from '../entities/ledger/types';

export interface AppMetaRecord {
  key: string;
  value: unknown;
  updatedAt: string; // ISO datetime
}

export class TaskmanDB extends Dexie {
  tasks!: Table<Task, string>;
  rewards!: Table<Reward, string>;
  dailyLogs!: Table<DailyLogEntry, string>;
  ledgerEvents!: Table<LedgerEvent, string>;
  appMeta!: Table<AppMetaRecord, string>;

  constructor() {
    super('taskman');
    this.version(1).stores({
      tasks: 'id, deadline, rarity, createdAt',
      rewards: 'id, name, cost',
      dailyLogs: 'id, date, taskId, loggedAt',
      ledgerEvents: 'id, kind, taskId, rewardId, createdAt',
      appMeta: 'key'
    });
  }
}
