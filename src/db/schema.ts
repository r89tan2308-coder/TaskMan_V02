import Dexie, { Table } from 'dexie';
import { Task } from '../entities/task/types';
import { Reward } from '../entities/reward/types';
import { DailyLogEntry } from '../entities/dailyLog/types';
import { LedgerEvent } from '../entities/ledger/types';
import { Project } from '../entities/project/types';
import { suggestTaskBucket } from '../entities/task/buckets';

export interface AppMetaRecord {
  key: string;
  value: unknown;
  updatedAt: string; // ISO datetime
}

export class TaskmanDB extends Dexie {
  tasks!: Table<Task, string>;
  projects!: Table<Project, string>;
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
    this.version(2)
      .stores({
        tasks: 'id, deadline, rarity, createdAt, bucket',
        projects: 'id, status, createdAt, completedAt',
        rewards: 'id, name, cost',
        dailyLogs: 'id, date, taskId, loggedAt',
        ledgerEvents: 'id, kind, taskId, rewardId, createdAt',
        appMeta: 'key'
      })
      .upgrade(async (tx) => {
        await tx.table('tasks').toCollection().modify((task: Task) => {
          task.bucket = suggestTaskBucket(task);
        });
      });
    this.version(3).stores({
      tasks: 'id, deadline, rarity, createdAt, bucket, projectId',
      projects: 'id, status, createdAt, completedAt',
      rewards: 'id, name, cost',
      dailyLogs: 'id, date, taskId, loggedAt',
      ledgerEvents: 'id, kind, taskId, rewardId, createdAt',
      appMeta: 'key'
    });
  }
}
