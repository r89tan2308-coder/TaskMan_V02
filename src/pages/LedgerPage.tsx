import { useEffect, useMemo, useState } from 'react';
import { deleteEvent, listEvents } from '../db/repositories/ledgerRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { Task } from '../entities/task/types';
import { listTasks } from '../services/tasksService';

export function LedgerPage() {
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [eventsData, tasksData] = await Promise.all([listEvents(), listTasks()]);
      setEvents(eventsData);
      setTasks(tasksData);
      setLoading(false);
    };
    load();
  }, []);

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task.title])),
    [tasks]
  );

  const handleDelete = async (event: LedgerEvent) => {
    if (event.kind !== 'task' && event.kind !== 'adjustment') return;
    const confirmed = window.confirm('Delete this event from ledger?');
    if (!confirmed) return;
    setDeletingIds((prev) => (prev.includes(event.id) ? prev : [...prev, event.id]));
    try {
      await deleteEvent(event.id);
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
    } catch (error) {
      alert('Failed to delete event.');
    } finally {
      setDeletingIds((prev) => prev.filter((id) => id !== event.id));
    }
  };

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [events]);

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <h1 className="text-3xl font-semibold tm-title">Ledger</h1>

          {loading ? (
            <p className="text-amber-200/80">Loading...</p>
          ) : sortedEvents.length === 0 ? (
            <p className="text-amber-200/80">No events yet</p>
          ) : (
            <div className="space-y-3">
              {sortedEvents.map((event) => {
                const refId = event.taskId ?? event.rewardId;
                const xp = `${event.deltaXp > 0 ? '+' : ''}${event.deltaXp}`;
                const occurredAt = new Date(event.createdAt).toLocaleString();
                const isDeleting = deletingIds.includes(event.id);
                const taskTitle = event.taskId ? tasksById.get(event.taskId) : undefined;
                const metaTitle = typeof event.meta?.title === 'string' ? event.meta.title : undefined;
                const bonusTitle =
                  event.meta?.eventType === 'PROJECT_COMPLETION_BONUS'
                    ? `Бонус за завершение проекта: ${xp}`
                    : null;
                const deleteTitle =
                  event.note === 'TASK_DELETE'
                    ? metaTitle
                      ? `Удалена: ${metaTitle}`
                      : 'Удалена задача'
                    : null;
                const primaryLabel =
                  bonusTitle ?? deleteTitle ?? (event.kind === 'task' && taskTitle ? taskTitle : event.kind);
                const showRef = !deleteTitle && (event.kind !== 'task' || !taskTitle);
                return (
                  <div
                    key={event.id}
                    className="tm-card px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm text-amber-200/80">{occurredAt}</p>
                      <p className="text-base font-semibold text-amber-50">{primaryLabel}</p>
                      {showRef && refId ? (
                        <p className="text-xs text-amber-200/70">Ref: {refId}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-lg font-bold ${
                          event.deltaXp >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {xp}
                      </p>
                      {event.kind === 'task' || event.kind === 'adjustment' ? (
                        <button
                          onClick={() => handleDelete(event)}
                          disabled={isDeleting}
                          className="tm-button tm-button-danger tm-button-sm"
                        >
                          {isDeleting ? 'Deleting...' : 'Delete'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
