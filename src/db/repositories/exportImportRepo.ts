import { db } from '../index';
import { Task } from '../../entities/task/types';
import { Project } from '../../entities/project/types';
import { Reward } from '../../entities/reward/types';
import { DailyLogEntry } from '../../entities/dailyLog/types';
import { LedgerEvent } from '../../entities/ledger/types';
import { ExportMetadata, ImportPayload } from '../../entities/app/types';

export interface ExportBundle {
  meta: ExportMetadata;
  tasks: Task[];
  projects: Project[];
  rewards: Reward[];
  dailyLogs: DailyLogEntry[];
  ledgerEvents: LedgerEvent[];
  appMeta: Record<string, unknown>;
}

type ExportBundleData = Omit<ExportBundle, 'meta'>;
type SupportedImportPayload = ExportBundle | ImportPayload<ExportBundleData>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getImportData = (payload: SupportedImportPayload): ExportBundleData => {
  if (isRecord(payload) && isRecord(payload.data)) {
    return payload.data as ExportBundleData;
  }
  return payload as ExportBundle;
};

export async function readAllForExport(meta: ExportMetadata): Promise<ExportBundle> {
  const [tasks, projects, rewards, dailyLogs, ledgerEvents, appMeta] = await Promise.all([
    db.tasks.toArray(),
    db.projects.toArray(),
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
    projects,
    rewards,
    dailyLogs,
    ledgerEvents,
    appMeta: metaMap
  };
}

export async function replaceAllFromImport(
  payload: SupportedImportPayload
): Promise<void> {
  await db.transaction(
    'rw',
    [db.tasks, db.projects, db.rewards, db.dailyLogs, db.ledgerEvents, db.appMeta],
    async () => {
      await Promise.all([
        db.tasks.clear(),
        db.projects.clear(),
        db.rewards.clear(),
        db.dailyLogs.clear(),
        db.ledgerEvents.clear(),
        db.appMeta.clear()
      ]);

      const { tasks, projects, rewards, dailyLogs, ledgerEvents, appMeta } = getImportData(payload);

      if (tasks?.length) await db.tasks.bulkAdd(tasks);
      if (projects?.length) await db.projects.bulkAdd(projects);
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
    }
  );
}
