import { useEffect, useMemo, useState } from 'react';
import { Task, Periodicity, Rarity } from '../entities/task/types';
import { listTasks } from '../services/tasksService';

type CalendarView = 'day' | 'week' | 'month';

const RARITY_STYLES: Record<Rarity, { border: string; text: string; accent: string }> = {
  common: { border: 'border-l-slate-400', text: 'tm-rarity-text', accent: 'tm-rarity-common' },
  rare: { border: 'border-l-sky-500', text: 'tm-rarity-text', accent: 'tm-rarity-rare' },
  epic: { border: 'border-l-violet-500', text: 'tm-rarity-text', accent: 'tm-rarity-epic' },
  legendary: { border: 'border-l-amber-500', text: 'tm-rarity-text', accent: 'tm-rarity-legendary' }
};

const PERIODICITY_LABELS: Record<Periodicity, string> = {
  daily: 'Ежедневно',
  weekly: 'Раз в неделю',
  'one-time': 'Разово',
  monthly: 'Раз в месяц',
  yearly: 'Раз в год'
};

const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
};

const getWeekdayIndex = (date: Date) => {
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
};

const startOfWeek = (date: Date) => addDays(startOfDay(date), -getWeekdayIndex(date));

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const toDateLabel = (date: Date, options?: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...options
  });

const toShortDate = (date: Date) =>
  date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAnchorDate = (task: Task) => parseDate(task.deadline) ?? parseDate(task.createdAt) ?? new Date();

const occursOnDate = (task: Task, date: Date) => {
  const anchor = getAnchorDate(task);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  if (task.periodicity === 'daily') return true;
  if (task.periodicity === 'weekly') {
    return getWeekdayIndex(date) === getWeekdayIndex(anchor);
  }
  if (task.periodicity === 'one-time') {
    return isSameLocalDate(date, anchor);
  }
  if (task.periodicity === 'monthly') {
    const anchorDay = anchor.getDate();
    const clampedDay = Math.min(anchorDay, getDaysInMonth(year, month));
    return day === clampedDay;
  }
  if (task.periodicity === 'yearly') {
    const anchorMonth = anchor.getMonth();
    if (month !== anchorMonth) return false;
    const anchorDay = anchor.getDate();
    const clampedDay = Math.min(anchorDay, getDaysInMonth(year, anchorMonth));
    return day === clampedDay;
  }
  return false;
};

const formatDeadlineTime = (value?: string) => {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const hours = parsed.getHours().toString().padStart(2, '0');
  const minutes = parsed.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const tasksData = await listTasks();
      setTasks(tasksData);
      setLoading(false);
    };
    load();
  }, []);

  const range = useMemo(() => {
    if (view === 'day') {
      return { start: startOfDay(selectedDate), end: startOfDay(selectedDate) };
    }
    if (view === 'week') {
      const start = startOfWeek(selectedDate);
      return { start, end: addDays(start, 6) };
    }
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    const start = startOfWeek(monthStart);
    const end = addDays(startOfWeek(monthEnd), 6);
    return { start, end };
  }, [selectedDate, view]);

  const calendarDays = useMemo(() => {
    const days: Date[] = [];
    let current = range.start;
    while (current <= range.end) {
      days.push(current);
      current = addDays(current, 1);
    }
    return days;
  }, [range]);

  const activeTasks = useMemo(() => tasks.filter((task) => !task.archived), [tasks]);

  const tasksForDate = (date: Date) =>
    activeTasks.filter((task) => occursOnDate(task, date));

  const shiftDate = (direction: 'prev' | 'next') => {
    const delta = direction === 'prev' ? -1 : 1;
    if (view === 'day') {
      setSelectedDate((prev) => addDays(prev, delta));
      return;
    }
    if (view === 'week') {
      setSelectedDate((prev) => addDays(prev, delta * 7));
      return;
    }
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const setToday = () => setSelectedDate(startOfDay(new Date()));

  const headerLabel = useMemo(() => {
    if (view === 'day') return toDateLabel(selectedDate);
    if (view === 'week') {
      const start = range.start;
      const end = range.end;
      return `${toShortDate(start)} — ${toShortDate(end)}`;
    }
    return selectedDate.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  }, [range, selectedDate, view]);

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-3xl font-semibold tm-title">Calendar</h1>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={setToday} className="tm-button tm-button-ghost tm-button-sm">
                Сегодня
              </button>
              <button
                onClick={() => shiftDate('prev')}
                className="tm-button tm-button-ghost tm-button-sm"
              >
                Назад
              </button>
              <button
                onClick={() => shiftDate('next')}
                className="tm-button tm-button-ghost tm-button-sm"
              >
                Вперёд
              </button>
              <div className="flex items-center gap-1">
                {(['day', 'week', 'month'] as CalendarView[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setView(mode)}
                    className={`tm-button tm-button-sm ${
                      view === mode ? 'tm-button-primary' : 'tm-button-ghost'
                    }`}
                  >
                    {mode === 'day' ? 'День' : mode === 'week' ? 'Неделя' : 'Месяц'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tm-panel-soft p-3">
            <p className="tm-label">{headerLabel}</p>
          </div>

          {loading ? (
            <p className="text-amber-200/80">Загрузка...</p>
          ) : view === 'day' ? (
            <div className="space-y-3">
              {tasksForDate(selectedDate).length === 0 ? (
                <p className="text-amber-200/80">Нет задач на этот день.</p>
              ) : (
                tasksForDate(selectedDate).map((task) => {
                  const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
                  const deadlineTime = formatDeadlineTime(task.deadline);
                  return (
                    <div
                      key={task.id}
                      className={`tm-card ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-4 py-3`}
                    >
                      <p className="text-amber-50 font-semibold">{task.title}</p>
                      <p className="text-xs text-amber-200/70">
                        {PERIODICITY_LABELS[task.periodicity]}
                        {deadlineTime ? ` · ${deadlineTime}` : ''}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          ) : view === 'week' ? (
            <div className="space-y-3">
              {calendarDays.map((date) => {
                const dayTasks = tasksForDate(date);
                const isToday = isSameLocalDate(date, new Date());
                return (
                  <div key={date.toISOString()} className="tm-panel-soft p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-sm ${isToday ? 'tm-title' : 'tm-label'}`}>
                        {toDateLabel(date, { day: '2-digit', month: 'short' })}
                      </p>
                      <span className="text-xs text-amber-200/70">
                        {WEEKDAY_LABELS[getWeekdayIndex(date)]}
                      </span>
                    </div>
                    {dayTasks.length === 0 ? (
                      <p className="text-amber-200/70 text-sm">Нет задач</p>
                    ) : (
                      <div className="space-y-2">
                        {dayTasks.map((task) => {
                          const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
                          return (
                            <div
                              key={task.id}
                              className={`tm-card ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2`}
                            >
                              <p className="text-sm text-amber-50">{task.title}</p>
                              <p className="text-xs text-amber-200/70">
                                {PERIODICITY_LABELS[task.periodicity]}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-7 gap-2 text-xs text-amber-200/70">
                {WEEKDAY_LABELS.map((label) => (
                  <div key={label} className="text-center">
                    {label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {calendarDays.map((date) => {
                  const dayTasks = tasksForDate(date);
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const isToday = isSameLocalDate(date, new Date());
                  const isSelected = isSameLocalDate(date, selectedDate);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`tm-panel-soft p-2 text-left min-h-[96px] flex flex-col gap-1 ${
                        isCurrentMonth ? '' : 'opacity-50'
                      } ${isToday ? 'border border-amber-400/60' : ''} ${
                        isSelected ? 'border border-amber-300' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-amber-200/80">
                          {date.getDate()}
                        </span>
                        {dayTasks.length > 0 ? (
                          <span className="text-[10px] text-amber-200/70">
                            {dayTasks.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-1">
                        {dayTasks.slice(0, 3).map((task) => {
                          const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
                          return (
                            <span
                              key={task.id}
                              className={`block text-[10px] truncate ${rarityStyle.text}`}
                            >
                              {task.title}
                            </span>
                          );
                        })}
                        {dayTasks.length > 3 ? (
                          <span className="text-[10px] text-amber-200/70">
                            +{dayTasks.length - 3} ещё
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
