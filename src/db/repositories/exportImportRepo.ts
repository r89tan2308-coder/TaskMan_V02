import { db } from '../index';
import type {
  AllowedWeekday,
  Periodicity,
  Rarity,
  Task,
  TaskBucket
} from '../../entities/task/types';
import type { Project, ProjectStatus } from '../../entities/project/types';
import type { Reward } from '../../entities/reward/types';
import type { DailyLogEntry } from '../../entities/dailyLog/types';
import type { LedgerEvent, LedgerEventKind } from '../../entities/ledger/types';
import type { ExportMetadata, ImportPayload } from '../../entities/app/types';
import { scheduleAppBadgeRefresh } from '../../services/appBadgeService';

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

export interface ValidatedBackupImport {
  meta: ExportMetadata;
  data: ExportBundleData;
}

const SUPPORTED_BACKUP_SCHEMA_VERSION = 1;

const TASK_BUCKETS = new Set<TaskBucket>(['inbox', 'today', 'next', 'backlog']);
const RARITIES = new Set<Rarity>(['common', 'rare', 'epic', 'legendary']);
const PERIODICITIES = new Set<Periodicity>([
  'daily',
  'weekly',
  'one-time',
  'monthly',
  'yearly'
]);
const ALLOWED_WEEKDAYS = new Set<AllowedWeekday>([1, 2, 3, 4, 5, 6, 7]);
const PROJECT_STATUSES = new Set<ProjectStatus>(['active', 'paused', 'completed', 'archived']);
const LEDGER_EVENT_KINDS = new Set<LedgerEventKind>(['task', 'reward', 'adjustment']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (message: string): never => {
  throw new Error(`Invalid backup import: ${message}`);
};

const requireRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  fail(`${path} must be an object.`);
};

const requireArray = (value: unknown, path: string): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  fail(`${path} must be an array.`);
};

const requireString = (value: unknown, path: string): string => {
  if (typeof value === 'string') {
    return value;
  }
  fail(`${path} must be a string.`);
};

const requireNonEmptyString = (value: unknown, path: string): string => {
  const text = requireString(value, path);
  if (!text.trim()) {
    fail(`${path} must be a non-empty string.`);
  }
  return text;
};

const requireOptionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireString(value, path);
};

const requireOptionalNonEmptyString = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, path);
};

const requireBoolean = (value: unknown, path: string): boolean => {
  if (typeof value === 'boolean') {
    return value;
  }
  fail(`${path} must be a boolean.`);
};

const requireFiniteNumber = (value: unknown, path: string): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  fail(`${path} must be a finite number.`);
};

const requireOptionalFiniteNumber = (value: unknown, path: string): number | undefined => {
  if (value === undefined) return undefined;
  return requireFiniteNumber(value, path);
};

const isValidDateString = (value: string) => Number.isFinite(Date.parse(value));

const requireDateString = (value: unknown, path: string): string => {
  const text = requireNonEmptyString(value, path);
  if (!isValidDateString(text)) {
    fail(`${path} must be a valid date string.`);
  }
  return text;
};

const requireOptionalDateString = (value: unknown, path: string): string | undefined => {
  if (value === undefined) return undefined;
  return requireDateString(value, path);
};

const requireDateOnlyString = (value: unknown, path: string): string => {
  const text = requireNonEmptyString(value, path);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    fail(`${path} must use YYYY-MM-DD format.`);
  }
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    fail(`${path} must be a valid calendar date.`);
  }
  return text;
};

const requireEnum = <T extends string>(
  value: unknown,
  allowed: Set<T>,
  path: string
): T => {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    fail(`${path} contains an unsupported value.`);
  }
  return value as T;
};

const rejectDuplicateIds = <T extends { id: string }>(items: T[], path: string) => {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) {
      fail(`${path} contains duplicate id "${item.id}".`);
    }
    ids.add(item.id);
  }
};

const validateMetadata = (value: unknown): ExportMetadata => {
  const meta = requireRecord(value, 'meta');
  if (meta.schemaVersion !== SUPPORTED_BACKUP_SCHEMA_VERSION) {
    fail(`meta.schemaVersion must be ${SUPPORTED_BACKUP_SCHEMA_VERSION}.`);
  }
  requireDateString(meta.exportedAt, 'meta.exportedAt');
  requireOptionalString(meta.appVersion, 'meta.appVersion');
  if (meta.source !== undefined && meta.source !== 'taskman-pwa') {
    fail('meta.source contains an unsupported value.');
  }
  return meta as unknown as ExportMetadata;
};

const validateChecklist = (value: unknown, path: string) => {
  const checklist = requireArray(value, path);
  for (const [index, itemValue] of checklist.entries()) {
    const item = requireRecord(itemValue, `${path}[${index}]`);
    requireNonEmptyString(item.id, `${path}[${index}].id`);
    requireString(item.text, `${path}[${index}].text`);
    requireBoolean(item.done, `${path}[${index}].done`);
    requireFiniteNumber(item.order, `${path}[${index}].order`);
  }
};

const validateTask = (value: unknown, index: number): Task => {
  const path = `tasks[${index}]`;
  const task = requireRecord(value, path);
  requireNonEmptyString(task.id, `${path}.id`);
  requireString(task.title, `${path}.title`);
  requireEnum(task.bucket, TASK_BUCKETS, `${path}.bucket`);
  requireEnum(task.rarity, RARITIES, `${path}.rarity`);
  requireEnum(task.periodicity, PERIODICITIES, `${path}.periodicity`);
  requireDateString(task.createdAt, `${path}.createdAt`);
  requireDateString(task.updatedAt, `${path}.updatedAt`);
  requireOptionalString(task.comment, `${path}.comment`);

  if (task.projectId !== undefined && task.projectId !== null) {
    requireNonEmptyString(task.projectId, `${path}.projectId`);
  }
  if (task.checklist !== undefined) {
    validateChecklist(task.checklist, `${path}.checklist`);
  }
  if (task.skillTags !== undefined) {
    for (const [tagIndex, tag] of requireArray(task.skillTags, `${path}.skillTags`).entries()) {
      requireString(tag, `${path}.skillTags[${tagIndex}]`);
    }
  }
  if (task.quota !== undefined) {
    const quota = requireRecord(task.quota, `${path}.quota`);
    requireFiniteNumber(quota.count, `${path}.quota.count`);
    requireEnum(quota.per, new Set(['week', 'month']), `${path}.quota.per`);
  }
  if (task.allowedWeekdays !== undefined) {
    for (const [dayIndex, day] of requireArray(
      task.allowedWeekdays,
      `${path}.allowedWeekdays`
    ).entries()) {
      if (typeof day !== 'number' || !ALLOWED_WEEKDAYS.has(day as AllowedWeekday)) {
        fail(`${path}.allowedWeekdays[${dayIndex}] contains an unsupported value.`);
      }
    }
  }
  requireOptionalDateString(task.deadline, `${path}.deadline`);
  if (task.reminder !== undefined) {
    const reminder = requireRecord(task.reminder, `${path}.reminder`);
    requireFiniteNumber(reminder.offsetMinutes, `${path}.reminder.offsetMinutes`);
  }
  requireOptionalFiniteNumber(task.xpOverride, `${path}.xpOverride`);
  if (task.progressEnabled !== undefined) {
    requireBoolean(task.progressEnabled, `${path}.progressEnabled`);
  }
  if (task.progressValue !== undefined) {
    const progressValue = requireFiniteNumber(task.progressValue, `${path}.progressValue`);
    if (progressValue < 0 || progressValue > 100) {
      fail(`${path}.progressValue must be between 0 and 100.`);
    }
  }
  requireOptionalFiniteNumber(task.sortOrder, `${path}.sortOrder`);
  if (task.archived !== undefined) {
    requireBoolean(task.archived, `${path}.archived`);
  }
  return task as unknown as Task;
};

const validateProject = (value: unknown, index: number): Project => {
  const path = `projects[${index}]`;
  const project = requireRecord(value, path);
  requireNonEmptyString(project.id, `${path}.id`);
  requireString(project.title, `${path}.title`);
  requireOptionalString(project.description, `${path}.description`);
  requireEnum(project.status, PROJECT_STATUSES, `${path}.status`);
  requireDateString(project.createdAt, `${path}.createdAt`);
  requireOptionalDateString(project.completedAt, `${path}.completedAt`);
  requireOptionalFiniteNumber(project.completionBonusXp, `${path}.completionBonusXp`);
  requireOptionalDateString(project.completionBonusAwardedAt, `${path}.completionBonusAwardedAt`);
  requireOptionalNonEmptyString(project.completionBonusEventId, `${path}.completionBonusEventId`);
  return project as unknown as Project;
};

const validateReward = (value: unknown, index: number): Reward => {
  const path = `rewards[${index}]`;
  const reward = requireRecord(value, path);
  requireNonEmptyString(reward.id, `${path}.id`);
  requireString(reward.name, `${path}.name`);
  requireFiniteNumber(reward.cost, `${path}.cost`);
  requireBoolean(reward.repeatable, `${path}.repeatable`);
  requireOptionalFiniteNumber(reward.cooldownHours, `${path}.cooldownHours`);
  requireDateString(reward.createdAt, `${path}.createdAt`);
  requireDateString(reward.updatedAt, `${path}.updatedAt`);
  return reward as unknown as Reward;
};

const validateDailyLogEntry = (value: unknown, index: number): DailyLogEntry => {
  const path = `dailyLogs[${index}]`;
  const entry = requireRecord(value, path);
  requireNonEmptyString(entry.id, `${path}.id`);
  requireNonEmptyString(entry.taskId, `${path}.taskId`);
  requireDateOnlyString(entry.date, `${path}.date`);
  requireDateString(entry.loggedAt, `${path}.loggedAt`);
  requireFiniteNumber(entry.deltaXp, `${path}.deltaXp`);
  requireOptionalString(entry.note, `${path}.note`);
  return entry as unknown as DailyLogEntry;
};

const validateLedgerEvent = (value: unknown, index: number): LedgerEvent => {
  const path = `ledgerEvents[${index}]`;
  const event = requireRecord(value, path);
  requireNonEmptyString(event.id, `${path}.id`);
  requireEnum(event.kind, LEDGER_EVENT_KINDS, `${path}.kind`);
  if (event.taskId !== undefined) {
    requireNonEmptyString(event.taskId, `${path}.taskId`);
  }
  if (event.rewardId !== undefined) {
    requireNonEmptyString(event.rewardId, `${path}.rewardId`);
  }
  requireFiniteNumber(event.deltaXp, `${path}.deltaXp`);
  requireDateString(event.createdAt, `${path}.createdAt`);
  requireOptionalString(event.note, `${path}.note`);
  if (event.meta !== undefined) {
    requireRecord(event.meta, `${path}.meta`);
  }
  return event as unknown as LedgerEvent;
};

const validateAppMeta = (value: unknown): Record<string, unknown> => {
  const appMeta = requireRecord(value, 'appMeta');
  for (const key of Object.keys(appMeta)) {
    if (!key.trim()) {
      fail('appMeta contains an empty key.');
    }
  }
  return appMeta;
};

const validateCrossTableReferences = (data: ExportBundleData) => {
  const projectIds = new Set(data.projects.map((project) => project.id));
  const taskIds = new Set(data.tasks.map((task) => task.id));
  const rewardIds = new Set(data.rewards.map((reward) => reward.id));

  for (const task of data.tasks) {
    if (task.projectId && !projectIds.has(task.projectId)) {
      fail(`tasks contains projectId "${task.projectId}" that is not present in projects.`);
    }
  }

  for (const entry of data.dailyLogs) {
    if (!taskIds.has(entry.taskId)) {
      fail(`dailyLogs contains taskId "${entry.taskId}" that is not present in tasks.`);
    }
  }

  for (const event of data.ledgerEvents) {
    if (event.taskId && !taskIds.has(event.taskId)) {
      fail(`ledgerEvents contains taskId "${event.taskId}" that is not present in tasks.`);
    }
    if (event.rewardId && !rewardIds.has(event.rewardId)) {
      fail(`ledgerEvents contains rewardId "${event.rewardId}" that is not present in rewards.`);
    }
  }
};

export const validateBackupImportPayload = (payload: unknown): ValidatedBackupImport => {
  const root = requireRecord(payload, 'payload');
  const meta = validateMetadata(root.meta);
  // Keep legacy { meta, data } support because the existing app-level import type already
  // accepted ImportPayload<ExportBundleData>. Do not broaden beyond this wrapper shape.
  const dataRoot = isRecord(root.data) ? root.data : root;

  const data: ExportBundleData = {
    tasks: requireArray(dataRoot.tasks, 'tasks').map(validateTask),
    projects: requireArray(dataRoot.projects, 'projects').map(validateProject),
    rewards: requireArray(dataRoot.rewards, 'rewards').map(validateReward),
    dailyLogs: requireArray(dataRoot.dailyLogs, 'dailyLogs').map(validateDailyLogEntry),
    ledgerEvents: requireArray(dataRoot.ledgerEvents, 'ledgerEvents').map(validateLedgerEvent),
    appMeta: validateAppMeta(dataRoot.appMeta)
  };

  rejectDuplicateIds(data.tasks, 'tasks');
  rejectDuplicateIds(data.projects, 'projects');
  rejectDuplicateIds(data.rewards, 'rewards');
  rejectDuplicateIds(data.dailyLogs, 'dailyLogs');
  rejectDuplicateIds(data.ledgerEvents, 'ledgerEvents');
  validateCrossTableReferences(data);

  return { meta, data };
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

export async function replaceAllFromValidatedImport(
  validatedImport: ValidatedBackupImport
): Promise<void> {
  const { tasks, projects, rewards, dailyLogs, ledgerEvents, appMeta } = validatedImport.data;

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

export async function replaceAllFromImport(payload: SupportedImportPayload): Promise<void> {
  const validatedImport = validateBackupImportPayload(payload);
  await replaceAllFromValidatedImport(validatedImport);
  scheduleAppBadgeRefresh();
}
