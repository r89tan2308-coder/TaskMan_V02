import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Task, Periodicity, Rarity } from '../entities/task/types';
import { LedgerEvent } from '../entities/ledger/types';
import { isTaskAllowedOnDate, normalizeAllowedWeekdays } from '../entities/task/weekdays';
import { listTasks } from '../services/tasksService';
import { listEvents } from '../db/repositories/ledgerRepo';
import { useLocale, type AppLocale } from '../i18n/appLocale';

type CalendarView = 'day' | 'week' | 'month';

const RARITY_STYLES: Record<Rarity, { border: string; text: string; accent: string }> = {
  common: { border: 'border-l-slate-400', text: 'tm-rarity-text', accent: 'tm-rarity-common' },
  rare: { border: 'border-l-sky-500', text: 'tm-rarity-text', accent: 'tm-rarity-rare' },
  epic: { border: 'border-l-violet-500', text: 'tm-rarity-text', accent: 'tm-rarity-epic' },
  legendary: { border: 'border-l-amber-500', text: 'tm-rarity-text', accent: 'tm-rarity-legendary' }
};

const CALENDAR_COPY = {
  ru: {
    dateLocale: 'ru-RU',
    periodicityLabels: {
      daily: 'Ежедневно',
      weekly: 'Раз в неделю',
      'one-time': 'Разово',
      monthly: 'Раз в месяц',
      yearly: 'Раз в год'
    } satisfies Record<Periodicity, string>,
    weekdayLabels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    allowedWeekdayLabels: {
      1: 'Пн',
      2: 'Вт',
      3: 'Ср',
      4: 'Чт',
      5: 'Пт',
      6: 'Сб',
      7: 'Вс'
    },
    quotaPeriodLabels: {
      week: 'нед.',
      month: 'мес.'
    },
    goal: 'Цель',
    days: 'Дни',
    progress: 'Прогресс',
    goalClosed: 'цель закрыта',
    selectedDay: 'Выбранный день',
    close: 'Закрыть',
    openDay: 'Открыть день',
    noTasksForDay: 'На этот день задач нет.',
    dayTasks: 'Задачи дня',
    noDirectEvents: 'На этот день прямых событий нет.',
    periodGoals: 'Цели периода',
    noPeriodGoals: 'На этот день доступных целей периода нет.',
    today: 'Сегодня',
    previous: 'Назад',
    next: 'Вперёд',
    viewAria: 'Режим календаря',
    viewLabels: {
      day: 'День',
      week: 'Неделя',
      month: 'Месяц'
    } satisfies Record<CalendarView, string>,
    loading: 'Загрузка...',
    noTasks: 'Нет задач',
    more: (count: number) => `+${count} ещё`
  },
  en: {
    dateLocale: 'en-US',
    periodicityLabels: {
      daily: 'Daily',
      weekly: 'Weekly',
      'one-time': 'One-time',
      monthly: 'Monthly',
      yearly: 'Yearly'
    } satisfies Record<Periodicity, string>,
    weekdayLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    allowedWeekdayLabels: {
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
      7: 'Sun'
    },
    quotaPeriodLabels: {
      week: 'wk',
      month: 'mo'
    },
    goal: 'Goal',
    days: 'Days',
    progress: 'Progress',
    goalClosed: 'goal reached',
    selectedDay: 'Selected Day',
    close: 'Close',
    openDay: 'Open Day',
    noTasksForDay: 'There are no tasks for this day.',
    dayTasks: 'Day Tasks',
    noDirectEvents: 'There are no direct events for this day.',
    periodGoals: 'Period Goals',
    noPeriodGoals: 'There are no available period goals for this day.',
    today: 'Today',
    previous: 'Previous',
    next: 'Next',
    viewAria: 'Calendar view',
    viewLabels: {
      day: 'Day',
      week: 'Week',
      month: 'Month'
    } satisfies Record<CalendarView, string>,
    loading: 'Loading...',
    noTasks: 'No tasks',
    more: (count: number) => `+${count} more`
  }
} satisfies Record<AppLocale, unknown>;

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

const getDateLocale = (locale: AppLocale) => CALENDAR_COPY[locale].dateLocale;

const toDateLabel = (date: Date, locale: AppLocale, options?: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString(getDateLocale(locale), {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    ...options
  });

const toShortDate = (date: Date, locale: AppLocale) =>
  date.toLocaleDateString(getDateLocale(locale), { day: '2-digit', month: '2-digit' });

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getAnchorDate = (task: Task) => parseDate(task.deadline) ?? parseDate(task.createdAt) ?? new Date();

const isQuotaTask = (task: Task) =>
  Boolean(task.quota && task.quota.count > 0 && (task.quota.per === 'week' || task.quota.per === 'month'));

const occursOnDate = (task: Task, date: Date) => {
  if (isQuotaTask(task)) return false;
  if (task.periodicity !== 'one-time' && !isTaskAllowedOnDate(task, date)) return false;
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

const isPeriodGoalAvailableOnDate = (task: Task, date: Date) => {
  if (!isQuotaTask(task)) return false;
  if (task.periodicity === 'one-time') {
    return occursOnDate({ ...task, quota: undefined }, date);
  }
  return isTaskAllowedOnDate(task, date);
};

const parseEventTimestamp = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : NaN;
  }
  return NaN;
};

const isDoneEvent = (event: LedgerEvent) =>
  event.note === 'TASK_DONE' || event.meta?.eventType === 'TASK_DONE';

const formatDeadlineTime = (value?: string) => {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const hours = parsed.getHours().toString().padStart(2, '0');
  const minutes = parsed.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const sortTasksForCalendarDate = (tasks: Task[]) =>
  [...tasks].sort((left, right) => {
    const leftTime = parseDate(left.deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
    const rightTime = parseDate(right.deadline)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.title.localeCompare(right.title, 'ru-RU');
  });

function CalendarTaskSection({
  title,
  tasks,
  emptyText,
  mode,
  quotaProgressByTaskId
}: {
  title: string;
  tasks: Task[];
  emptyText: string;
  mode: 'task' | 'goal';
  quotaProgressByTaskId?: Map<string, { done: number; count: number; percent: number; reached: boolean }>;
}) {
  const { locale } = useLocale();
  const copy = CALENDAR_COPY[locale];
  return (
    <section className="tm-calendar-task-section space-y-3">
      <div className="tm-calendar-section-header flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tm-title">{title}</h3>
        <span className="text-xs text-amber-200/70">{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="tm-panel-soft tm-calendar-empty-panel p-4">
          <p className="text-sm text-amber-200/80">{emptyText}</p>
        </div>
      ) : (
        <div className="tm-calendar-task-list space-y-3">
          {tasks.map((task) => {
            const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
            const deadlineTime = mode === 'task' ? formatDeadlineTime(task.deadline) : null;
            const commentPreview = task.comment?.trim()
              ? task.comment.trim().slice(0, 160)
              : null;
            const allowedWeekdays = normalizeAllowedWeekdays(task.allowedWeekdays);
            const weekdayLabel = allowedWeekdays
              ? allowedWeekdays.map((weekday) => copy.allowedWeekdayLabels[weekday]).join(', ')
              : null;
            const quotaProgress = quotaProgressByTaskId?.get(task.id);
            return (
              <div
                key={`${mode}-${task.id}`}
                className={`tm-card tm-calendar-task-card ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-4 py-3 space-y-1.5`}
              >
                <p className="tm-calendar-task-title text-amber-50 font-semibold break-words">{task.title}</p>
                <p className="tm-calendar-task-meta text-xs text-amber-200/70">
                  {copy.periodicityLabels[task.periodicity]}
                  {mode === 'task' && deadlineTime ? ` · ${deadlineTime}` : ''}
                  {mode === 'goal' && task.quota
                    ? ` · ${copy.goal} ${task.quota.count}/${copy.quotaPeriodLabels[task.quota.per]}`
                    : ''}
                </p>
                {weekdayLabel ? (
                  <p className="tm-calendar-task-meta text-xs text-amber-200/65">{copy.days}: {weekdayLabel}</p>
                ) : null}
                {mode === 'goal' && quotaProgress ? (
                  <p className="tm-calendar-task-meta text-xs text-amber-200/75">
                    {copy.progress}: {quotaProgress.done} / {quotaProgress.count}
                    {quotaProgress.reached ? ` · ${copy.goalClosed}` : ''}
                  </p>
                ) : null}
                {commentPreview ? (
                  <p className="tm-calendar-task-comment text-sm text-amber-100/85 whitespace-pre-wrap break-words">
                    {commentPreview}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CalendarDayModal({
  date,
  dayTasks,
  periodGoals,
  quotaProgressByTaskId,
  onClose,
  onOpenDayView
}: {
  date: Date;
  dayTasks: Task[];
  periodGoals: Task[];
  quotaProgressByTaskId: Map<string, { done: number; count: number; percent: number; reached: boolean }>;
  onClose: () => void;
  onOpenDayView: () => void;
}) {
  const { locale } = useLocale();
  const copy = CALENDAR_COPY[locale];
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, []);

  return (
    <div
      className="tm-calendar-day-modal-overlay fixed inset-0 z-50 bg-black/65 flex items-start sm:items-center justify-center px-4 py-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg tm-panel tm-calendar-day-modal p-4 sm:p-5 max-h-[85vh] overflow-y-auto space-y-4"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs tm-label">{copy.selectedDay}</p>
            <h2 id={titleId} className="text-xl font-semibold tm-title break-words">
              {toDateLabel(date, locale, { weekday: 'long', day: '2-digit', month: 'long' })}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="tm-button tm-button-ghost tm-button-sm">
            {copy.close}
          </button>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onOpenDayView} className="tm-button tm-button-ghost tm-button-sm">
            {copy.openDay}
          </button>
        </div>

        {dayTasks.length === 0 && periodGoals.length === 0 ? (
          <div className="tm-panel-soft p-4">
            <p className="text-sm text-amber-200/80">{copy.noTasksForDay}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <CalendarTaskSection
              title={copy.dayTasks}
              tasks={dayTasks}
              emptyText={copy.noDirectEvents}
              mode="task"
            />
            <CalendarTaskSection
              title={copy.periodGoals}
              tasks={periodGoals}
              emptyText={copy.noPeriodGoals}
              mode="goal"
              quotaProgressByTaskId={quotaProgressByTaskId}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { locale } = useLocale();
  const copy = CALENDAR_COPY[locale];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(() => startOfDay(new Date()));
  const [inspectedDate, setInspectedDate] = useState<Date | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [tasksData, eventsData] = await Promise.all([listTasks(), listEvents()]);
      setTasks(tasksData);
      setLedgerEvents(eventsData);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!inspectedDate) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspectedDate(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [inspectedDate]);

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

  const buildQuotaProgressByTaskId = (referenceDate: Date) => {
    const result = new Map<string, { done: number; count: number; percent: number; reached: boolean }>();
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = addDays(weekStart, 7);
    const monthStart = startOfMonth(referenceDate);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const weekCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();

    for (const event of ledgerEvents) {
      if (event.kind !== 'task' || !event.taskId || !isDoneEvent(event)) continue;
      const eventTime = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      if (eventTime >= weekStart.getTime() && eventTime < weekEnd.getTime()) {
        weekCounts.set(event.taskId, (weekCounts.get(event.taskId) ?? 0) + 1);
      }
      if (eventTime >= monthStart.getTime() && eventTime < monthEnd.getTime()) {
        monthCounts.set(event.taskId, (monthCounts.get(event.taskId) ?? 0) + 1);
      }
    }

    for (const task of activeTasks) {
      if (!task.quota) continue;
      const count = task.quota.count;
      const done = task.quota.per === 'week' ? weekCounts.get(task.id) ?? 0 : monthCounts.get(task.id) ?? 0;
      const percent = count > 0 ? Math.min(100, Math.round((done / count) * 100)) : 100;
      result.set(task.id, { done, count, percent, reached: done >= count });
    }

    return result;
  };

  const tasksForDate = (date: Date) =>
    activeTasks.filter((task) => occursOnDate(task, date));

  const periodGoalsForDate = (date: Date) =>
    activeTasks.filter((task) => isPeriodGoalAvailableOnDate(task, date));

  const openDateDetails = (date: Date) => {
    const normalized = startOfDay(date);
    setSelectedDate(normalized);
    if (view !== 'day') setInspectedDate(normalized);
  };

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
    if (view === 'day') return toDateLabel(selectedDate, locale);
    if (view === 'week') {
      const start = range.start;
      const end = range.end;
      return `${toShortDate(start, locale)} — ${toShortDate(end, locale)}`;
    }
    return selectedDate.toLocaleDateString(getDateLocale(locale), { month: 'long', year: 'numeric' });
  }, [locale, range, selectedDate, view]);

  const inspectedDateTasks = useMemo(
    () => (inspectedDate ? sortTasksForCalendarDate(tasksForDate(inspectedDate)) : []),
    [activeTasks, inspectedDate]
  );
  const inspectedDateGoals = useMemo(
    () => (inspectedDate ? sortTasksForCalendarDate(periodGoalsForDate(inspectedDate)) : []),
    [activeTasks, inspectedDate]
  );
  const selectedDateQuotaProgress = useMemo(
    () => buildQuotaProgressByTaskId(selectedDate),
    [activeTasks, ledgerEvents, selectedDate]
  );
  const inspectedDateQuotaProgress = useMemo(
    () => (inspectedDate ? buildQuotaProgressByTaskId(inspectedDate) : new Map()),
    [activeTasks, inspectedDate, ledgerEvents]
  );

  return (
    <div className="min-h-screen tm-calendar-page">
      <div className="tm-calendar-container max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal tm-calendar-frame space-y-4 p-3 sm:p-6">
          <div className="tm-calendar-toolbar flex flex-wrap items-center justify-between gap-3">
            <h1 className="sr-only">Calendar</h1>
            <div className="tm-calendar-controls flex flex-wrap items-center gap-2">
              <button onClick={setToday} className="tm-button tm-button-ghost tm-button-sm">
                {copy.today}
              </button>
              <button
                onClick={() => shiftDate('prev')}
                className="tm-button tm-button-ghost tm-button-sm"
              >
                {copy.previous}
              </button>
              <button
                onClick={() => shiftDate('next')}
                className="tm-button tm-button-ghost tm-button-sm"
              >
                {copy.next}
              </button>
              <div className="tm-segmented-control" role="group" aria-label={copy.viewAria}>
                {(['day', 'week', 'month'] as CalendarView[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setView(mode)}
                    className={`tm-button tm-button-sm tm-segmented-item ${
                      view === mode ? 'tm-button-primary is-selected' : 'tm-button-ghost'
                    }`}
                    aria-pressed={view === mode}
                  >
                    {copy.viewLabels[mode]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="tm-panel-soft tm-calendar-header-panel p-3">
            <p className="tm-label">{headerLabel}</p>
          </div>

          {loading ? (
            <p className="text-amber-200/80">{copy.loading}</p>
          ) : view === 'day' ? (
            <div className="tm-calendar-day-view space-y-3">
              <CalendarTaskSection
                title={copy.dayTasks}
                tasks={sortTasksForCalendarDate(tasksForDate(selectedDate))}
                emptyText={copy.noDirectEvents}
                mode="task"
              />
              <CalendarTaskSection
                title={copy.periodGoals}
                tasks={sortTasksForCalendarDate(periodGoalsForDate(selectedDate))}
                emptyText={copy.noPeriodGoals}
                mode="goal"
                quotaProgressByTaskId={selectedDateQuotaProgress}
              />
            </div>
          ) : view === 'week' ? (
            <div className="tm-calendar-week-view space-y-3">
              {calendarDays.map((date) => {
                const dayTasks = tasksForDate(date);
                const isToday = isSameLocalDate(date, new Date());
                return (
                  <div key={date.toISOString()} className="tm-panel-soft tm-calendar-week-day p-3 space-y-2">
                    <div className="tm-calendar-week-day-header flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openDateDetails(date)}
                        className={`tm-calendar-week-date text-sm text-left ${isToday ? 'tm-title' : 'tm-label'}`}
                      >
                        {toDateLabel(date, locale, { day: '2-digit', month: 'short' })}
                      </button>
                      <span className="tm-calendar-weekday-label text-xs text-amber-200/70">
                        {copy.weekdayLabels[getWeekdayIndex(date)]}
                      </span>
                    </div>
                    {dayTasks.length === 0 ? (
                      <p className="tm-calendar-week-empty text-amber-200/70 text-sm">{copy.noTasks}</p>
                    ) : (
                      <div className="tm-calendar-week-task-list space-y-2">
                        {dayTasks.map((task) => {
                          const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
                          return (
                            <div
                              key={task.id}
                              className={`tm-card tm-calendar-week-task ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2`}
                            >
                              <p className="tm-calendar-week-task-title text-sm text-amber-50 break-words">{task.title}</p>
                              <p className="tm-calendar-task-meta text-xs text-amber-200/70">
                                {copy.periodicityLabels[task.periodicity]}
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
            <div className="tm-calendar-month-view space-y-3">
              <div className="tm-calendar-weekdays grid grid-cols-7 gap-1 sm:gap-2 text-xs text-amber-200/70">
                {copy.weekdayLabels.map((label) => (
                  <div key={label} className="tm-calendar-weekday text-center">
                    {label}
                  </div>
                ))}
              </div>
              <div className="tm-calendar-month-grid grid grid-cols-7 gap-1 sm:gap-2">
                {calendarDays.map((date) => {
                  const dayTasks = tasksForDate(date);
                  const isCurrentMonth = date.getMonth() === selectedDate.getMonth();
                  const isToday = isSameLocalDate(date, new Date());
                  const isSelected = isSameLocalDate(date, selectedDate);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => openDateDetails(date)}
                      className={`tm-panel-soft tm-calendar-month-cell p-1.5 sm:p-2 text-left min-h-[72px] sm:min-h-[96px] flex flex-col gap-1 ${
                        isCurrentMonth ? '' : 'opacity-50'
                      } ${isToday ? 'border border-amber-400/60' : ''} ${
                        isSelected ? 'border border-amber-300' : ''
                      }`}
                    >
                      <div className="tm-calendar-month-cell-header flex items-center justify-between gap-2">
                        <span className="tm-calendar-date-number text-xs text-amber-200/80">
                          {date.getDate()}
                        </span>
                        {dayTasks.length > 0 ? (
                          <span className="tm-calendar-task-count text-[10px] text-amber-200/70">
                            {dayTasks.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="tm-calendar-month-preview-list space-y-1">
                        {dayTasks.slice(0, 3).map((task) => {
                          const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
                          return (
                            <span
                              key={task.id}
                              className={`tm-calendar-month-task-preview block text-[10px] truncate ${rarityStyle.text}`}
                            >
                              {task.title}
                            </span>
                          );
                        })}
                        {dayTasks.length > 3 ? (
                          <span className="tm-calendar-month-more text-[10px] text-amber-200/70">
                            {copy.more(dayTasks.length - 3)}
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
          {inspectedDate ? (
            <CalendarDayModal
              date={inspectedDate}
              dayTasks={inspectedDateTasks}
              periodGoals={inspectedDateGoals}
              quotaProgressByTaskId={inspectedDateQuotaProgress}
              onClose={() => setInspectedDate(null)}
              onOpenDayView={() => {
                setSelectedDate(inspectedDate);
            setView('day');
            setInspectedDate(null);
          }}
        />
      ) : null}
    </div>
  );
}
