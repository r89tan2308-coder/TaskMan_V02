import { listEvents } from '../db/repositories/ledgerRepo';
import { listTasks } from '../db/repositories/tasksRepo';
import { getTaskReturnCounts } from '../logic/taskReturnCounts';

type BadgeNavigator = Navigator & {
  clearAppBadge?: () => Promise<void>;
  setAppBadge?: (contents?: number) => Promise<void>;
};

let refreshTimer: number | null = null;

const getBadgeNavigator = () =>
  typeof navigator === 'undefined' ? null : (navigator as BadgeNavigator);

export const isAppBadgeSupported = (targetNavigator = getBadgeNavigator()) =>
  Boolean(targetNavigator?.setAppBadge && targetNavigator?.clearAppBadge);

export const applyAppBadgeCount = async (
  count: number,
  targetNavigator = getBadgeNavigator()
) => {
  if (!isAppBadgeSupported(targetNavigator)) return;
  try {
    if (count > 0) {
      await targetNavigator?.setAppBadge?.(count);
    } else {
      await targetNavigator?.clearAppBadge?.();
    }
  } catch {
    // Badging is best-effort and should never affect the task app.
  }
};

export const refreshAppBadge = async () => {
  if (!isAppBadgeSupported()) return;
  try {
    const [tasks, events] = await Promise.all([listTasks(), listEvents()]);
    const { badgeCount } = getTaskReturnCounts(tasks, events);
    await applyAppBadgeCount(badgeCount);
  } catch {
    // Ignore storage/runtime errors: the UI remains the source of truth.
  }
};

export const scheduleAppBadgeRefresh = () => {
  if (refreshTimer !== null || typeof window === 'undefined') return;
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refreshAppBadge();
  }, 0);
};

export const startAppBadgeDayRolloverRefresh = () => {
  if (typeof window === 'undefined') return () => undefined;

  let timeoutId = 0;
  const scheduleNext = () => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1, 0, 0);
    timeoutId = window.setTimeout(() => {
      void refreshAppBadge();
      scheduleNext();
    }, Math.max(60_000, nextDay.getTime() - now.getTime()));
  };

  scheduleNext();
  return () => {
    window.clearTimeout(timeoutId);
  };
};
