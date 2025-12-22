import { db } from '../index';
import { Task } from '../../entities/task/types';
import { Reward } from '../../entities/reward/types';
import { DailyLogEntry } from '../../entities/dailyLog/types';
import { LedgerEvent } from '../../entities/ledger/types';
import { ExportMetadata, ImportPayload } from '../../entities/app/types';

export interface ExportBundle {
  meta: ExportMetadata;
  tasks: Task[];
  rewards: Reward[];
  dailyLogs: DailyLogEntry[];
  ledgerEvents: LedgerEvent[];
  appMeta: Record<string, unknown>;
}

export async function readAllForExport(meta: ExportMetadata): Promise<ExportBundle> {
  const [tasks, rewards, dailyLogs, ledgerEvents, appMeta] = await Promise.all([
    db.tasks.toArray(),
    db.rewards.toArray(),
    db.dailyLogs.toArray(),
    db.ledgerEvents.toArray(),
    db.appMeta.toArray()
  ]);

  const metaMap: Record<string, unknown> = {};
  for (const entry of appMeta) {
    metaMap[entry.key] = entry.value;
  }

  return {
    meta,
    tasks,
    rewards,
    dailyLogs,
    ledgerEvents,
    appMeta: metaMap
  };
}

export async function replaceAllFromImport(
  payload: ImportPayload<Omit<ExportBundle, 'meta'>>
): Promise<void> {
  await db.transaction('rw', [db.tasks, db.rewards, db.dailyLogs, db.ledgerEvents, db.appMeta], async () => {
    await Promise.all([
      db.tasks.clear(),
      db.rewards.clear(),
      db.dailyLogs.clear(),
      db.ledgerEvents.clear(),
      db.appMeta.clear()
    ]);

    const { tasks, rewards, dailyLogs, ledgerEvents, appMeta } = payload.data;

    if (tasks?.length) await db.tasks.bulkAdd(tasks);
    if (rewards?.length) await db.rewards.bulkAdd(rewards);
    if (dailyLogs?.length) await db.dailyLogs.bulkAdd(dailyLogs);
    if (ledgerEvents?.length) await db.ledgerEvents.bulkAdd(ledgerEvents);

    if (appMeta) {
      const entries = Object.entries(appMeta).map(([key, value]) => ({
        key,
        value,
        updatedAt: new Date().toISOString()
      }));
      if (entries.length) await db.appMeta.bulkAdd(entries);
    }
  });
}
