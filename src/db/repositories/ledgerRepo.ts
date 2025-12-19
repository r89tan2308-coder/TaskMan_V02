import { db } from '../index';
import { LedgerEvent } from '../../entities/ledger/types';

export async function addEvent(event: LedgerEvent): Promise<void> {
  await db.ledgerEvents.add(event);
}

export async function listEvents(): Promise<LedgerEvent[]> {
  return db.ledgerEvents.orderBy('createdAt').toArray();
}
