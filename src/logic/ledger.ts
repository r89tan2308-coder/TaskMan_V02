import { LedgerEvent } from '../entities/ledger/types';

export interface LedgerState {
  balance: number;
}

export function applyEvent(state: LedgerState, event: LedgerEvent): LedgerState {
  return {
    balance: state.balance + event.deltaXp
  };
}

export function computeXpBalance(events: LedgerEvent[]): number {
  return events.reduce((sum, event) => sum + event.deltaXp, 0);
}
