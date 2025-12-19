import { listEvents } from '../db/repositories/ledgerRepo';
import { computeXpBalance } from '../logic/ledger';

export async function getXpBalance(): Promise<number> {
  const events = await listEvents();
  return computeXpBalance(events);
}
