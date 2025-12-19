// Domain types for ledger entries; no calculations here.
export type LedgerEventKind = 'task' | 'reward' | 'adjustment';

export interface LedgerEvent {
  id: string;
  kind: LedgerEventKind;
  taskId?: string;
  rewardId?: string;
  deltaXp: number; // sign set at logging time
  createdAt: string; // ISO datetime
  note?: string;
  meta?: Record<string, unknown>;
}
