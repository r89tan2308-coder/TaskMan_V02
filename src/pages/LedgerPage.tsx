import { useEffect, useMemo, useState } from 'react';
import { listEvents } from '../db/repositories/ledgerRepo';
import { LedgerEvent } from '../entities/ledger/types';

export function LedgerPage() {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await listEvents();
      setEvents(data);
      setLoading(false);
    };
    load();
  }, []);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [events]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-3xl font-semibold text-white">Ledger</h1>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : sortedEvents.length === 0 ? (
          <p className="text-slate-400">No events yet</p>
        ) : (
          <div className="space-y-3">
            {sortedEvents.map((event) => {
              const refId = event.taskId ?? event.rewardId;
              const xp = `${event.deltaXp > 0 ? '+' : ''}${event.deltaXp}`;
              const occurredAt = new Date(event.createdAt).toLocaleString();
              return (
                <div
                  key={event.id}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="text-sm text-slate-300">{occurredAt}</p>
                    <p className="text-base font-semibold text-white">{event.kind}</p>
                    {refId && <p className="text-xs text-slate-400">Ref: {refId}</p>}
                  </div>
                  <p
                    className={`text-lg font-bold ${
                      event.deltaXp >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {xp}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
