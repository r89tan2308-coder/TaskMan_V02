import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { listEvents } from '../db/repositories/ledgerRepo';
import { listTasks } from '../db/repositories/tasksRepo';
import { reminderCopy } from '../i18n/reminders';
import { getTaskReturnCounts } from '../logic/taskReturnCounts';
import { getNotificationPermissionState, showSafeNotification } from './notificationService';

export type ReminderType = 'eveningReview' | 'morningCheckIn' | 'overdueReminder';

export interface ReminderSettings {
  eveningReviewEnabled: boolean;
  eveningReviewTime: string;
  lastNotificationShownAt: Partial<Record<ReminderType, string>>;
  morningCheckInEnabled: boolean;
  morningCheckInTime: string;
  overdueReminderEnabled: boolean;
}

export const REMINDER_SETTINGS_META_KEY = 'reminderSettings';

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  eveningReviewEnabled: false,
  eveningReviewTime: '20:00',
  lastNotificationShownAt: {},
  morningCheckInEnabled: false,
  morningCheckInTime: '09:00',
  overdueReminderEnabled: false
};

const OVERDUE_REMINDER_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const REMINDER_CHECK_INTERVAL_MS = 60_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeTime = (value: unknown, fallback: string) =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : fallback;

const normalizeLastShown = (value: unknown): Partial<Record<ReminderType, string>> => {
  if (!isRecord(value)) return {};
  const next: Partial<Record<ReminderType, string>> = {};
  for (const key of ['eveningReview', 'morningCheckIn', 'overdueReminder'] as ReminderType[]) {
    if (typeof value[key] === 'string' && Number.isFinite(Date.parse(value[key]))) {
      next[key] = value[key];
    }
  }
  return next;
};

export const normalizeReminderSettings = (value: unknown): ReminderSettings => {
  if (!isRecord(value)) return { ...DEFAULT_REMINDER_SETTINGS };
  return {
    eveningReviewEnabled:
      typeof value.eveningReviewEnabled === 'boolean'
        ? value.eveningReviewEnabled
        : DEFAULT_REMINDER_SETTINGS.eveningReviewEnabled,
    eveningReviewTime: normalizeTime(
      value.eveningReviewTime,
      DEFAULT_REMINDER_SETTINGS.eveningReviewTime
    ),
    lastNotificationShownAt: normalizeLastShown(value.lastNotificationShownAt),
    morningCheckInEnabled:
      typeof value.morningCheckInEnabled === 'boolean'
        ? value.morningCheckInEnabled
        : DEFAULT_REMINDER_SETTINGS.morningCheckInEnabled,
    morningCheckInTime: normalizeTime(
      value.morningCheckInTime,
      DEFAULT_REMINDER_SETTINGS.morningCheckInTime
    ),
    overdueReminderEnabled:
      typeof value.overdueReminderEnabled === 'boolean'
        ? value.overdueReminderEnabled
        : DEFAULT_REMINDER_SETTINGS.overdueReminderEnabled
  };
};

export const getReminderSettings = async () =>
  normalizeReminderSettings(await getAppMetaValue<unknown>(REMINDER_SETTINGS_META_KEY));

export const saveReminderSettings = async (settings: ReminderSettings) => {
  await setAppMetaValue(REMINDER_SETTINGS_META_KEY, settings);
};

export const updateReminderSettings = async (patch: Partial<ReminderSettings>) => {
  const current = await getReminderSettings();
  const next = normalizeReminderSettings({
    ...current,
    ...patch,
    lastNotificationShownAt: {
      ...current.lastNotificationShownAt,
      ...patch.lastNotificationShownAt
    }
  });
  await saveReminderSettings(next);
  return next;
};

const timeHasPassedToday = (time: string, now: Date) => {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  return now.getTime() >= target.getTime();
};

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const wasShownToday = (settings: ReminderSettings, type: ReminderType, now: Date) => {
  const last = settings.lastNotificationShownAt[type];
  if (!last) return false;
  const parsed = new Date(last);
  return Number.isFinite(parsed.getTime()) && toLocalDateKey(parsed) === toLocalDateKey(now);
};

const isWithinCooldown = (
  settings: ReminderSettings,
  type: ReminderType,
  now: Date,
  cooldownMs: number
) => {
  const last = settings.lastNotificationShownAt[type];
  if (!last) return false;
  const parsed = Date.parse(last);
  return Number.isFinite(parsed) && now.getTime() - parsed < cooldownMs;
};

const markReminderShown = async (
  settings: ReminderSettings,
  type: ReminderType,
  now: Date
) => {
  await saveReminderSettings({
    ...settings,
    lastNotificationShownAt: {
      ...settings.lastNotificationShownAt,
      [type]: now.toISOString()
    }
  });
};

const maybeShowReminder = async (
  settings: ReminderSettings,
  type: ReminderType,
  now: Date,
  title: string
) => {
  const shown = await showSafeNotification({
    tag: `taskman-${type}`,
    title
  });
  if (shown) {
    await markReminderShown(settings, type, now);
  }
};

export const runReminderCheck = async (now = new Date()) => {
  if (getNotificationPermissionState() !== 'granted') return;

  const settings = await getReminderSettings();
  if (
    !settings.morningCheckInEnabled &&
    !settings.eveningReviewEnabled &&
    !settings.overdueReminderEnabled
  ) {
    return;
  }

  const [tasks, events] = await Promise.all([listTasks(), listEvents()]);
  const counts = getTaskReturnCounts(tasks, events, now);

  if (
    settings.morningCheckInEnabled &&
    counts.todayIncompleteCount > 0 &&
    timeHasPassedToday(settings.morningCheckInTime, now) &&
    !wasShownToday(settings, 'morningCheckIn', now)
  ) {
    await maybeShowReminder(
      settings,
      'morningCheckIn',
      now,
      reminderCopy.todayTasks(counts.todayIncompleteCount)
    );
    return;
  }

  if (
    settings.overdueReminderEnabled &&
    counts.overdueIncompleteCount > 0 &&
    !isWithinCooldown(settings, 'overdueReminder', now, OVERDUE_REMINDER_COOLDOWN_MS)
  ) {
    await maybeShowReminder(
      settings,
      'overdueReminder',
      now,
      reminderCopy.overdueTasks(counts.overdueIncompleteCount)
    );
    return;
  }

  if (
    settings.eveningReviewEnabled &&
    timeHasPassedToday(settings.eveningReviewTime, now) &&
    !wasShownToday(settings, 'eveningReview', now)
  ) {
    await maybeShowReminder(settings, 'eveningReview', now, reminderCopy.eveningReview);
  }
};

export const startReminderRuntime = () => {
  if (typeof window === 'undefined') return () => undefined;
  let disposed = false;

  const tick = () => {
    if (disposed) return;
    void runReminderCheck();
  };

  tick();
  const intervalId = window.setInterval(tick, REMINDER_CHECK_INTERVAL_MS);
  return () => {
    disposed = true;
    window.clearInterval(intervalId);
  };
};
