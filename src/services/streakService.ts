import { listEvents } from '../db/repositories/ledgerRepo';
import { StreakPeriod, StreakRule, StreakState } from '../entities/streak/types';
import { computeStreak } from '../logic/streak';

export async function getStreak(period: StreakPeriod, rule: StreakRule): Promise<StreakState> {
  const events = await listEvents();
  return computeStreak(events, period, rule);
}
