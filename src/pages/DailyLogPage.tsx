import { useEffect, useMemo, useState } from 'react';
import { addEvent, listEvents } from '../db/repositories/ledgerRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { Task } from '../entities/task/types';
import { xpForTask } from '../logic/xp';
import { listTasks } from '../services/tasksService';

const PERIODICITY_LABELS: Record<Task['periodicity'], string> = {
  daily: 'Ежедневно',
  weekly: 'Раз в неделю',
  'one-time': 'Разово',
  monthly: 'Раз в месяц',
  yearly: 'Раз в год'
};

const generateId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const pad2 = (value: number) => value.toString().padStart(2, '0');
const toLocalInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;

const parseLocalDateTime = (input: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
};

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const toLocalDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const formatDateLabel = (value: string) => {
  const parts = value.split('-');
  if (parts.length !== 3) return value;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
};

const formatDayHeading = (value: string) => {
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const label = formatDateLabel(value);
  if (isSameLocalDate(date, today)) return `Сегодня · ${label}`;
  if (isSameLocalDate(date, yesterday)) return `Вчера · ${label}`;
  return label;
};

const isUndoEvent = (event: LedgerEvent) =>
  event.note === 'TASK_UNDO' ||
  event.note === 'undo' ||
  event.meta?.eventType === 'TASK_UNDO';

const isMissedEvent = (event: LedgerEvent) =>
  event.note === 'TASK_MISSED' ||
  event.meta?.eventType === 'TASK_MISSED';

const formatXp = (value: number) => `${value > 0 ? '+' : ''}${value}`;

type DailyLogItem = {
  key: string;
  title: string;
  periodicity?: Task['periodicity'];
  rarity?: Task['rarity'];
  status: 'done' | 'missed';
  eventTime: number;
};

type DailyLogDay = {
  dateKey: string;
  label: string;
  totalXp: number;
  doneCount: number;
  missedCount: number;
  items: DailyLogItem[];
};

export function DailyLogPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggingTaskId, setLoggingTaskId] = useState<string | null>(null);
  const [useCustomLogDate, setUseCustomLogDate] = useState(false);
  const [customLogDateInput, setCustomLogDateInput] = useState(() => toLocalInputValue(new Date()));

  const load = async () => {
    setLoading(true);
    const [tasksData, eventsData] = await Promise.all([listTasks(), listEvents()]);
    setTasks(tasksData);
    setEvents(eventsData);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const tasksById = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks]
  );

  const history = useMemo<DailyLogDay[]>(() => {
    const byDate = new Map<string, Map<string, LedgerEvent>>();
    for (const event of events) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const eventTime = Date.parse(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      const dateKey = toLocalDateKey(new Date(eventTime));
      const byTask = byDate.get(dateKey) ?? new Map<string, LedgerEvent>();
      const existing = byTask.get(event.taskId);
      if (!existing || Date.parse(existing.createdAt) < eventTime) {
        byTask.set(event.taskId, event);
      }
      byDate.set(dateKey, byTask);
    }

    const days: DailyLogDay[] = [];
    for (const [dateKey, byTask] of byDate.entries()) {
      let totalXp = 0;
      let doneCount = 0;
      let missedCount = 0;
      const items: DailyLogItem[] = [];
      for (const [taskId, event] of byTask.entries()) {
        if (isUndoEvent(event)) continue;
        const status = isMissedEvent(event)
          ? 'missed'
          : event.deltaXp > 0
            ? 'done'
            : null;
        if (!status) continue;
        const task = tasksById.get(taskId);
        const eventTime = Date.parse(event.createdAt);
        totalXp += event.deltaXp;
        if (status === 'done') doneCount += 1;
        if (status === 'missed') missedCount += 1;
        items.push({
          key: `${dateKey}-${taskId}`,
          title: task?.title ?? 'Удаленная задача',
          periodicity: task?.periodicity,
          rarity: task?.rarity,
          status,
          eventTime: Number.isNaN(eventTime) ? 0 : eventTime
        });
      }
      if (!items.length) continue;
      items.sort((left, right) => right.eventTime - left.eventTime);
      days.push({
        dateKey,
        label: formatDayHeading(dateKey),
        totalXp,
        doneCount,
        missedCount,
        items
      });
    }

    return days.sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1));
  }, [events, tasksById]);

  const setLogDateToNow = () => {
    setCustomLogDateInput(toLocalInputValue(new Date()));
  };

  const resolveLogOccurredAt = () => {
    if (!useCustomLogDate) return Date.now();
    const parsed = parseLocalDateTime(customLogDateInput);
    if (!parsed) return null;
    return parsed.getTime();
  };

  const logTask = async (task: Task, missed: boolean) => {
    const occurredAt = resolveLogOccurredAt();
    if (occurredAt === null) {
      alert('Укажите корректную дату и время события.');
      return;
    }
    setLoggingTaskId(task.id);
    const eventType = missed ? 'TASK_MISSED' : 'TASK_DONE';
    const event: LedgerEvent = {
      id: generateId(),
      kind: 'task',
      taskId: task.id,
      deltaXp: missed ? -xpForTask(task) : xpForTask(task),
      createdAt: new Date(occurredAt).toISOString(),
      note: eventType,
      meta: { eventType, refId: task.id, occurredAt }
    };
    await addEvent(event);
    await load();
    setLoggingTaskId(null);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-6 p-3 sm:p-6">
          <h1 className="text-3xl font-semibold tm-title">Daily Log</h1>

          <section className="tm-panel tm-reveal tm-reveal-delay-1 p-4 space-y-3">
            <div className="tm-history-header">
              <h2 className="text-lg font-semibold tm-title">Сегодня</h2>
            </div>
            <div className="tm-panel-soft p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm text-amber-200/90">
                <input
                  type="checkbox"
                  checked={useCustomLogDate}
                  onChange={(event) => setUseCustomLogDate(event.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                Записывать событие задним числом
              </label>
              {useCustomLogDate ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="datetime-local"
                    value={customLogDateInput}
                    onChange={(event) => setCustomLogDateInput(event.target.value)}
                    className="tm-input w-full sm:max-w-xs"
                  />
                  <button
                    type="button"
                    onClick={setLogDateToNow}
                    className="tm-button tm-button-ghost tm-button-sm"
                  >
                    Сейчас
                  </button>
                </div>
              ) : null}
              <p className="text-xs text-amber-200/70">
                {useCustomLogDate
                  ? 'Отметки пойдут в аналитику по выбранной дате.'
                  : 'По умолчанию отметки записываются текущим временем.'}
              </p>
            </div>
            {loading ? (
              <p className="text-amber-200/80">Загрузка...</p>
            ) : tasks.length === 0 ? (
              <p className="text-amber-200/80">Нет задач для логирования.</p>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => {
                  const busy = loggingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className="tm-card px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div>
                        <p className="text-amber-50 font-semibold">{task.title}</p>
                        <p className="text-xs text-amber-200/80">
                          {PERIODICITY_LABELS[task.periodicity]} · {task.rarity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => logTask(task, false)}
                          disabled={busy}
                          className="tm-button tm-button-primary text-emerald-200"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => logTask(task, true)}
                          disabled={busy}
                          className="tm-button tm-button-danger text-rose-200"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="tm-panel tm-reveal tm-reveal-delay-2 p-4 space-y-3">
            <div className="tm-history-header">
              <h2 className="text-lg font-semibold tm-title">История</h2>
            </div>
            {loading ? (
              <p className="text-amber-200/80">Загрузка...</p>
            ) : history.length === 0 ? (
              <p className="text-amber-200/80">Записей пока нет.</p>
            ) : (
              <div className="space-y-3">
                {history.map((day) => (
                  <div key={day.dateKey} className="tm-panel-soft p-3 space-y-2">
                    <div className="tm-history-header">
                      <div>
                        <p className="tm-history-date">{day.label}</p>
                        <p className="tm-history-meta">
                          ✓ Сделано: {day.doneCount} · ✕ Пропущено: {day.missedCount}
                        </p>
                      </div>
                      <p className="tm-history-meta">XP: {formatXp(day.totalXp)}</p>
                    </div>
                    <div className="tm-history-list">
                      {day.items.map((item) => (
                        <div key={item.key} className="tm-history-row">
                          <div>
                            <p className="text-sm font-semibold text-amber-50">
                              {item.title}
                            </p>
                            {item.periodicity ? (
                              <p className="tm-history-meta">
                                {PERIODICITY_LABELS[item.periodicity]}
                                {item.rarity ? ` · ${item.rarity}` : ''}
                              </p>
                            ) : (
                              <p className="tm-history-meta">Удаленная задача</p>
                            )}
                          </div>
                          <span
                            className={`tm-badge ${
                              item.status === 'missed' ? 'tm-badge-danger' : ''
                            }`}
                          >
                            {item.status === 'missed' ? '✕' : '✓'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
