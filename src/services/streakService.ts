import { listEvents } from '../db/repositories/ledgerRepo';
import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { StreakPeriod, StreakRule, StreakState } from '../entities/streak/types';
import { computeStreak } from '../logic/streak';

const STREAK_OVERRIDE_KEY = 'streakOverride';

interface StreakOverride {
  currentCount: number;
  bestCount: number;
}

export async function getStreak(period: StreakPeriod, rule: StreakRule): Promise<StreakState> {
  const events = await listEvents();
  const computed = computeStreak(events, period, rule);
  const override = await getAppMetaValue<StreakOverride>(STREAK_OVERRIDE_KEY);
  if (
    override &&
    Number.isFinite(override.currentCount) &&
    Number.isFinite(override.bestCount) &&
    override.currentCount >= 0 &&
    override.bestCount >= 0
  ) {
    return {
      ...computed,
      currentCount: Math.trunc(override.currentCount),
      bestCount: Math.trunc(override.bestCount)
    };
  }
  return computed;
}

export async function setStreakOverride(
  currentCount: number,
  bestCount: number
): Promise<void> {
  await setAppMetaValue(STREAK_OVERRIDE_KEY, {
    currentCount,
    bestCount
  });
}
