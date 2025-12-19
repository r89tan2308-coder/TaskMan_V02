// Domain types for streak configuration/state; no streak math here.
export type StreakPeriod =
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'custom'; lengthDays: number }; // custom period length in days

export interface StreakRule {
  requiredCountPerPeriod: number; // how many completions needed per period
}

export interface StreakState {
  currentCount: number;
  bestCount: number;
  period: StreakPeriod;
  rule: StreakRule;
  lastEventAt?: string; // ISO datetime of last completion
}
