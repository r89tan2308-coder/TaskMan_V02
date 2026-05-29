import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode
} from 'react';
import { createPortal } from 'react-dom';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { Project } from '../entities/project/types';
import {
  Task,
  Periodicity,
  Rarity,
  TaskChecklistItem,
  TaskBucket,
  AllowedWeekday
} from '../entities/task/types';
import {
  WEEKDAY_LABELS_SHORT,
  WEEKDAY_WEEKENDS,
  WEEKDAY_WORKDAYS,
  formatAllowedWeekdaysLabel,
  isTaskAllowedOnDate,
  normalizeAllowedWeekdays
} from '../entities/task/weekdays';
import { Reward } from '../entities/reward/types';
import { deleteTask, listTasks, updateTask } from '../services/tasksService';
import { listProjects } from '../services/projectsService';
import { logTaskEvent } from '../services/taskEventService';
import { getXpBalance } from '../services/xpService';
import { addEvent, deleteEvent, listEvents } from '../db/repositories/ledgerRepo';
import { getAppMetaValue } from '../db/repositories/appMetaRepo';
import { useLocale, type AppLocale } from '../i18n/appLocale';
import { db } from '../db';
import { xpForTask } from '../logic/xp';
import { computeTaskDailyStreak } from '../logic/streak';
import { LedgerEvent } from '../entities/ledger/types';
import { StreakState } from '../entities/streak/types';
import { emitPetEvent } from '../features/pet/petEvents';

type TaskFilter = 'all' | Periodicity;
type TaskSort = 'manual' | 'rarity' | 'createdAt';
type TaskStatus = 'pending' | 'overdue' | 'completed' | 'missed';
type TodayQueueTab = TaskBucket;
type SkillsStatsState = {
  characteristics?: Array<{ name?: string | null }>;
  skills?: Array<{ name?: string | null }>;
};

const RARITY_STYLES: Record<Rarity, { border: string; text: string; accent: string }> = {
  common: { border: 'border-l-slate-400', text: 'tm-rarity-text', accent: 'tm-rarity-common' },
  rare: { border: 'border-l-sky-500', text: 'tm-rarity-text', accent: 'tm-rarity-rare' },
  epic: { border: 'border-l-violet-500', text: 'tm-rarity-text', accent: 'tm-rarity-epic' },
  legendary: { border: 'border-l-amber-500', text: 'tm-rarity-text', accent: 'tm-rarity-legendary' }
};

const RARITY_SORT_ORDER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3
};

const TASK_FILTERS: TaskFilter[] = ['all', 'daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const TASK_SORTS: Array<{ value: TaskSort; label: string }> = [
  { value: 'manual', label: 'Ручная' },
  { value: 'rarity', label: 'По редкости' },
  { value: 'createdAt', label: 'По времени создания' }
];
const TODAY_QUEUE_TABS: TodayQueueTab[] = ['today', 'inbox', 'next', 'backlog'];
const COMPLETION_FEEDBACK_TIMEOUT_MS = 1800;
const COMPLETION_CARD_ANIMATION_MS = 320;
const COMPLETION_FLOAT_FX_TIMEOUT_MS = 1500;
const TASK_OVERFLOW_MENU_GUTTER_PX = 16;
const TASK_OVERFLOW_MENU_OFFSET_PX = 6;
const TASK_OVERFLOW_MENU_MAX_WIDTH_PX = 220;
const QUEUE_LABELS: Record<TodayQueueTab, string> = {
  today: 'Today',
  inbox: 'Inbox',
  next: 'Next',
  backlog: 'Backlog'
};
const TODAY_COPY = {
  ru: {
    queueAria: 'Очереди задач',
    queueLabels: {
      today: 'Сегодня',
      inbox: 'Входящие',
      next: 'Далее',
      backlog: 'Запас'
    },
    queueSystemLabels: {
      inbox: 'Входящие',
      next: 'Далее',
      backlog: 'Запас'
    },
    sortLabels: {
      manual: 'Ручная',
      rarity: 'По редкости',
      createdAt: 'По времени создания'
    },
    periodicityLabels: {
      daily: 'Ежедневно',
      weekly: 'Раз в неделю',
      'one-time': 'Разово',
      monthly: 'Раз в месяц',
      yearly: 'Раз в год'
    },
    rarityLabels: {
      common: 'обычная',
      rare: 'редкая',
      epic: 'эпическая',
      legendary: 'легендарная'
    },
    valueLabel: 'Ценность',
    commentBadge: 'комм.',
    overdueBadge: 'просрочена',
    month: 'месяц',
    week: 'неделя',
    hideDetails: 'Скрыть детали',
    showDetails: 'Показать детали',
    hideMove: 'Скрыть перенос',
    move: 'Перенести',
    dragDetailsHint: 'Перетащить для ручной сортировки или нажать для деталей',
    planningBadge: 'Планирование',
    remindPrefix: 'Напомнить',
    quota: 'Квота',
    complete: 'Сделать',
    more: 'Ещё',
    actionsFor: (title: string) => `Действия для ${title}`,
    completeAria: (title: string) => `Сделать: ${title}`,
    moreAria: (title: string) => `Ещё действия: ${title}`,
    logAtDate: 'Записать на дату',
    dateTime: 'Дата и время',
    cancel: 'Отмена',
    logSaving: 'Запись...',
    logAction: 'Записать',
    calendarAction: 'Календарь',
    edit: 'Изменить',
    skip: 'Пропустить',
    delete: 'Удалить',
    deleting: 'Удаление...',
    queue: 'Очередь',
    bucketActionLabels: {
      today: 'В Сегодня',
      inbox: 'Во Входящие',
      next: 'В Далее',
      backlog: 'В Запас'
    },
    comment: 'Комментарий',
    rewardNotSelected: 'Награда не выбрана',
    rewardRemaining: (xp: number) => `Осталось ${xp} XP`,
    rewardUnlocked: 'Награда уже открыта',
    rewardEmptyHint: 'Добавь награду, и здесь сразу появится ближайшая цель с прогрессом.',
    currentXp: (xp: number) => `Сейчас у тебя ${xp} XP`,
    allFilter: 'Все',
    dayTitle: 'Как идёт день',
    done: 'Сделано',
    remaining: 'Осталось',
    overdue: 'Просрочено',
    dueSoon: 'Скоро',
    total: 'Всего',
    dayProgress: {
      start: 'Старт',
      aria: 'Прогресс дня',
      emptyPlan: 'План на день появится после добавления задач',
      progressLabel: (completed: number, total: number) => `${completed} из ${total}`,
      remaining: (remaining: number, overdue: number) =>
        `Осталось ${Math.max(remaining, 0)}${overdue > 0 ? ` · просрочено ${overdue}` : ''}`
    },
    filters: 'Фильтры',
    search: 'Поиск',
    searchPlaceholder: 'Найти задачу',
    sort: 'Сортировка',
    periodicity: 'Периодичность',
    addTask: '+ Задача',
    searchPill: (query: string) => `Поиск: ${query}`,
    filterPill: (label: string) => `Фильтр: ${label}`,
    reset: 'Сбросить',
    loading: 'Загрузка...',
    noCompletedByFilter: 'По текущему поиску или фильтрам в сделанных сегодня ничего не найдено.',
    noCompletedToday: 'Сегодня ещё нет закрытых задач.',
    noResultsTitle: 'Ничего не найдено',
    noResultsText: 'Попробуй изменить поиск или фильтры.',
    activeEmptyTitle: 'Активных задач на сегодня нет',
    activeEmptyText: 'Добавь новую задачу или возьми что-то из следующего слоя.',
    dueSoonTitle: 'Скоро дедлайн',
    todayTitle: 'Сегодня',
    todayDoneTitle: 'На сегодня всё',
    todayDoneText: 'Основной слой дня пуст. Возьми что-то из следующего слоя.',
    nextPreviewTitle: 'Далее',
    nextPreviewSubtitle: 'Ближайший резерв после очереди Далее',
    nextEmptyTitle: 'Следующий слой пуст',
    nextEmptyText: 'Задачи из очереди Далее появятся здесь.',
    openNext: 'Открыть Далее',
    queueDescriptions: {
      today: 'Главный слой дня.',
      inbox: 'Новые задачи и быстрый захват.',
      next: 'Ближайший слой после Сегодня.',
      backlog: 'Отложенные задачи вне главного потока.'
    },
    inboxEmptyTitle: 'Входящие пусты',
    inboxEmptyText: 'Новые задачи появятся здесь, пока ты их не разберёшь.',
    backlogEmptyTitle: 'Запас пуст',
    backlogEmptyText: 'Отложенных задач пока нет.',
    nextQueueEmptyText: 'Когда появятся задачи на потом, они окажутся здесь.'
  },
  en: {
    queueAria: 'Task queues',
    queueLabels: {
      today: 'Today',
      inbox: 'Inbox',
      next: 'Next',
      backlog: 'Backlog'
    },
    queueSystemLabels: {
      inbox: 'Inbox',
      next: 'Next',
      backlog: 'Backlog'
    },
    sortLabels: {
      manual: 'Manual',
      rarity: 'By rarity',
      createdAt: 'By creation time'
    },
    periodicityLabels: {
      daily: 'Daily',
      weekly: 'Weekly',
      'one-time': 'One-time',
      monthly: 'Monthly',
      yearly: 'Yearly'
    },
    rarityLabels: {
      common: 'common',
      rare: 'rare',
      epic: 'epic',
      legendary: 'legendary'
    },
    valueLabel: 'Value',
    commentBadge: 'note',
    overdueBadge: 'overdue',
    month: 'month',
    week: 'week',
    hideDetails: 'Hide details',
    showDetails: 'Show details',
    hideMove: 'Hide move',
    move: 'Move',
    dragDetailsHint: 'Drag to reorder or click for details',
    planningBadge: 'Planning',
    remindPrefix: 'Remind',
    quota: 'Quota',
    complete: 'Done',
    more: 'More',
    actionsFor: (title: string) => `Actions for ${title}`,
    completeAria: (title: string) => `Done: ${title}`,
    moreAria: (title: string) => `More actions: ${title}`,
    logAtDate: 'Log at date',
    dateTime: 'Date and time',
    cancel: 'Cancel',
    logSaving: 'Logging...',
    logAction: 'Log',
    calendarAction: 'Calendar',
    edit: 'Edit',
    skip: 'Skip',
    delete: 'Delete',
    deleting: 'Deleting...',
    queue: 'Queue',
    bucketActionLabels: {
      today: 'To Today',
      inbox: 'To Inbox',
      next: 'To Next',
      backlog: 'To Backlog'
    },
    comment: 'Comment',
    rewardNotSelected: 'No reward selected',
    rewardRemaining: (xp: number) => `${xp} XP left`,
    rewardUnlocked: 'Reward already unlocked',
    rewardEmptyHint: 'Add a reward and the nearest goal will appear here with progress.',
    currentXp: (xp: number) => `You have ${xp} XP now`,
    allFilter: 'All',
    dayTitle: 'How the day is going',
    done: 'Done',
    remaining: 'Remaining',
    overdue: 'Overdue',
    dueSoon: 'Due soon',
    total: 'Total',
    dayProgress: {
      start: 'Start',
      aria: 'Day progress',
      emptyPlan: 'The day plan will appear after tasks are added',
      progressLabel: (completed: number, total: number) => `${completed} / ${total}`,
      remaining: (remaining: number, overdue: number) =>
        `Remaining ${Math.max(remaining, 0)}${overdue > 0 ? ` · overdue ${overdue}` : ''}`
    },
    filters: 'Filters',
    search: 'Search',
    searchPlaceholder: 'Find a task',
    sort: 'Sort',
    periodicity: 'Periodicity',
    addTask: '+ Add task',
    searchPill: (query: string) => `Search: ${query}`,
    filterPill: (label: string) => `Filter: ${label}`,
    reset: 'Reset',
    loading: 'Loading...',
    noCompletedByFilter: 'No completed tasks match the current search or filters.',
    noCompletedToday: 'No completed tasks today yet.',
    noResultsTitle: 'Nothing found',
    noResultsText: 'Try changing the search or filters.',
    activeEmptyTitle: 'No active tasks for today',
    activeEmptyText: 'Add a new task or pull something from the next layer.',
    dueSoonTitle: 'Due soon',
    todayTitle: 'Today',
    todayDoneTitle: 'All done for today',
    todayDoneText: 'The main day layer is empty. Pull something from the next layer.',
    nextPreviewTitle: 'Next',
    nextPreviewSubtitle: 'Nearest reserve after Today',
    nextEmptyTitle: 'Next layer is empty',
    nextEmptyText: 'Tasks from the Next queue will appear here.',
    openNext: 'Open Next',
    queueDescriptions: {
      today: 'The main day layer.',
      inbox: 'New tasks and quick capture.',
      next: 'The nearest layer after Today.',
      backlog: 'Deferred tasks outside the main flow.'
    },
    inboxEmptyTitle: 'Inbox is empty',
    inboxEmptyText: 'New tasks stay here until you sort them.',
    backlogEmptyTitle: 'Backlog is empty',
    backlogEmptyText: 'No deferred tasks yet.',
    nextQueueEmptyText: 'Tasks for later will appear here.'
  }
} satisfies Record<AppLocale, unknown>;
const weekdaySelectionsEqual = (
  left: readonly AllowedWeekday[] | undefined,
  right: readonly AllowedWeekday[]
) =>
  Boolean(
    left &&
      left.length === right.length &&
      right.every((weekday, index) => left[index] === weekday)
  );
const PINNED_REWARDS_META_KEY = 'pinnedRewards';
const SKILLS_STATS_META_KEY = 'skillsStats';
const DEFAULT_CHARACTERISTIC_NAMES = [
  'Выносливость',
  'Сила',
  'Ловкость',
  'Интеллект',
  'Харизма',
  'Воля',
  'Концентрация',
  'Гибкость'
];
const DEFAULT_SKILL_NAMES = [
  'Готовка',
  'Вождение',
  'Excel',
  'Photoshop',
  'Коммуникация',
  'Планирование',
  'Финансовая грамотность',
  'Первая помощь',
  'Публичные выступления',
  'Домашний ремонт'
];
const MAX_TASK_TITLE_LENGTH = 120;
const PROGRESS_STEP = 5;
const DEBUG_COUNTS = false;

const getPortalThemeClassName = () => {
  if (typeof document === 'undefined') return '';
  const appRoot = document.querySelector('.tm-app');
  if (appRoot?.classList.contains('tm-theme-classic')) return 'tm-theme-classic';
  if (appRoot?.classList.contains('tm-theme-hud')) return 'tm-theme-hud';
  return appRoot?.classList.contains('tm-theme-handwritten') ? 'tm-theme-handwritten' : '';
};

const clampProgressValue = (value: number) => Math.min(100, Math.max(0, value));
const normalizeProgressValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const clamped = clampProgressValue(value);
  return Math.round(clamped / PROGRESS_STEP) * PROGRESS_STEP;
};

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));
const getRewardProgressPercent = (balance: number, cost: number) => {
  if (!Number.isFinite(cost) || cost <= 0) return 100;
  const raw = (balance / cost) * 100;
  return Math.round(clampPercent(raw));
};

const formatXpDelta = (value: number) => {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  const sign = normalized > 0 ? '+' : '';
  return `${sign}${normalized} XP`;
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfLocalWeek = (date: Date) => {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const diff = (day + 6) % 7;
  start.setDate(start.getDate() - diff);
  return start;
};

const startOfLocalMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfLocalYear = (date: Date) => new Date(date.getFullYear(), 0, 1);

const parseEventTimestamp = (value: unknown) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value !== 'string') {
    return NaN;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const numericFallback = Number(value);
  return Number.isFinite(numericFallback) ? numericFallback : NaN;
};

const pad2 = (value: number) => value.toString().padStart(2, '0');

const toIcsLocal = (date: Date) =>
  `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}T${pad2(
    date.getHours()
  )}${pad2(date.getMinutes())}00`;

const toLocalInputValue = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`;

const toIcsUtc = (date: Date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

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

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const normalizeTaskDedupeKey = (task: Task) => {
  const createdAtTs = parseEventTimestamp(task.createdAt);
  const createdBucket = Number.isNaN(createdAtTs)
    ? task.createdAt ?? ''
    : new Date(createdAtTs).toISOString().slice(0, 19);
  const title = task.title.trim().toLowerCase();
  const comment = (task.comment ?? '').trim().toLowerCase();
  const xpOverride = typeof task.xpOverride === 'number' ? task.xpOverride : '';
  return [
    createdBucket,
    title,
    task.periodicity,
    task.rarity,
    xpOverride,
    task.deadline ?? '',
    comment
  ].join('|');
};

const getDaysInMonth = (year: number, monthIndex: number) =>
  new Date(year, monthIndex + 1, 0).getDate();

const buildDateWithTime = (year: number, monthIndex: number, day: number, timeSource: Date) => {
  const clampedDay = Math.min(day, getDaysInMonth(year, monthIndex));
  return new Date(
    year,
    monthIndex,
    clampedDay,
    timeSource.getHours(),
    timeSource.getMinutes(),
    timeSource.getSeconds(),
    timeSource.getMilliseconds()
  );
};

const shiftRecurringDeadline = (task: Task, source: Date, step: number) => {
  if (task.periodicity === 'one-time' || step === 0) return new Date(source);

  if (task.periodicity === 'daily') {
    const candidate = new Date(source);
    candidate.setDate(candidate.getDate() + step);
    return candidate;
  }

  if (task.periodicity === 'weekly') {
    const candidate = new Date(source);
    candidate.setDate(candidate.getDate() + step * 7);
    return candidate;
  }

  if (task.periodicity === 'monthly') {
    return buildDateWithTime(
      source.getFullYear(),
      source.getMonth() + step,
      source.getDate(),
      source
    );
  }

  if (task.periodicity === 'yearly') {
    return buildDateWithTime(
      source.getFullYear() + step,
      source.getMonth(),
      source.getDate(),
      source
    );
  }

  return new Date(source);
};

const getCurrentPeriodDeadline = (task: Task, now = new Date()) => {
  const anchor = parseIsoDate(task.deadline);
  if (!anchor) return null;
  if (task.periodicity === 'one-time') return anchor;
  if (now.getTime() < anchor.getTime()) return anchor;

  if (task.periodicity === 'daily') {
    return buildDateWithTime(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      anchor
    );
  }

  if (task.periodicity === 'weekly') {
    const candidate = startOfLocalWeek(now);
    const anchorOffset = (anchor.getDay() + 6) % 7;
    candidate.setDate(candidate.getDate() + anchorOffset);
    candidate.setHours(
      anchor.getHours(),
      anchor.getMinutes(),
      anchor.getSeconds(),
      anchor.getMilliseconds()
    );
    return candidate;
  }

  if (task.periodicity === 'monthly') {
    return buildDateWithTime(
      now.getFullYear(),
      now.getMonth(),
      anchor.getDate(),
      anchor
    );
  }

  if (task.periodicity === 'yearly') {
    return buildDateWithTime(
      now.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      anchor
    );
  }

  return anchor;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DUE_SOON_WINDOW_MS = 24 * HOUR_MS;

const getNextDeadlineDate = (task: Task, now = new Date()) => {
  const current = getCurrentPeriodDeadline(task, now);
  if (!current) return null;
  if (task.periodicity === 'one-time' || current.getTime() >= now.getTime()) {
    return current;
  }
  return shiftRecurringDeadline(task, current, 1);
};

const isTaskAllowedInTodayFlow = (task: Task, date: Date) =>
  task.periodicity === 'one-time' ? true : isTaskAllowedOnDate(task, date);

const shouldSurfaceTaskInToday = (task: Task, now = new Date()) => {
  if (!isTaskAllowedInTodayFlow(task, now)) return false;
  if (task.periodicity === 'daily') return true;
  const currentDeadline = getCurrentPeriodDeadline(task, now);
  return Boolean(currentDeadline && isSameLocalDate(currentDeadline, now));
};

const getDueSoonMeta = (deadline: Date | null, now = new Date()) => {
  if (!deadline) return null;
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0 || diffMs > DUE_SOON_WINDOW_MS) {
    return null;
  }

  if (diffMs <= HOUR_MS) {
    const minutes = Math.max(1, Math.ceil(diffMs / MINUTE_MS));
    return { label: `Через ${minutes} мин`, urgency: 'critical' as const };
  }

  if (diffMs <= 6 * HOUR_MS) {
    const hours = Math.max(1, Math.ceil(diffMs / HOUR_MS));
    return { label: `Через ${hours} ч`, urgency: 'urgent' as const };
  }

  if (isSameLocalDate(deadline, now)) {
    const timeLabel = formatTimeOfDay(deadline);
    return { label: timeLabel ? `Сегодня в ${timeLabel}` : 'Сегодня', urgency: 'soon' as const };
  }

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameLocalDate(deadline, tomorrow)) {
    const timeLabel = formatTimeOfDay(deadline);
    return { label: timeLabel ? `Завтра в ${timeLabel}` : 'Завтра', urgency: 'soon' as const };
  }

  const hours = Math.max(1, Math.ceil(diffMs / HOUR_MS));
  return { label: `Через ${hours} ч`, urgency: 'soon' as const };
};

const shouldSurfaceTaskDueSoon = (task: Task, now = new Date()) => {
  if (!isTaskAllowedInTodayFlow(task, now)) return false;
  if (task.bucket === 'today' || shouldSurfaceTaskInToday(task, now)) return false;
  return Boolean(getDueSoonMeta(getNextDeadlineDate(task, now), now));
};

const getTaskPeriodKey = (task: Task, date: Date) => {
  if (task.periodicity === 'one-time') return 'one-time';
  if (task.periodicity === 'daily') {
    return `day:${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }
  if (task.periodicity === 'weekly') {
    const weekStart = startOfLocalWeek(date);
    return `week:${weekStart.getFullYear()}-${pad2(weekStart.getMonth() + 1)}-${pad2(
      weekStart.getDate()
    )}`;
  }
  if (task.periodicity === 'monthly') {
    return `month:${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
  }
  if (task.periodicity === 'yearly') {
    const yearStart = startOfLocalYear(date);
    return `year:${yearStart.getFullYear()}`;
  }
  return 'unknown';
};

const getLatestEventForTaskPeriod = (task: Task, events: LedgerEvent[], referenceDate: Date) => {
  const targetKey = getTaskPeriodKey(task, referenceDate);
  let latest: LedgerEvent | null = null;
  let latestTime = NaN;
  for (const event of events) {
    const eventTime = parseEventTimestamp(event.createdAt);
    if (Number.isNaN(eventTime)) continue;
    if (getTaskPeriodKey(task, new Date(eventTime)) !== targetKey) continue;
    if (!latest || Number.isNaN(latestTime) || latestTime < eventTime) {
      latest = event;
      latestTime = eventTime;
    }
  }
  return latest;
};

const getReminderDate = (deadline: Date | null, offsetMinutes?: number) => {
  if (!deadline) return null;
  if (typeof offsetMinutes !== 'number' || Number.isNaN(offsetMinutes)) return null;
  const totalMinutes = Math.max(0, Math.trunc(offsetMinutes));
  return new Date(deadline.getTime() - totalMinutes * 60000);
};

const formatDeadline = (value?: string | Date | null) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
};

const formatOverdueLabel = (deadline: Date | null, now = new Date()) => {
  if (!deadline) return null;
  const diffMs = now.getTime() - deadline.getTime();
  if (diffMs <= 0) return null;
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (days >= 1) return `Просрочено на ${days} д.`;
  if (hours >= 1) return `Просрочено на ${hours} ч.`;
  return 'Просрочено меньше чем на час';
};

function TaskProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const normalizedValue = normalizeProgressValue(value);
  return (
    <div
      className={`tm-progress tm-progress-sm w-full ${muted ? 'tm-progress-muted' : ''}`}
      role="progressbar"
      aria-valuenow={normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${normalizedValue}%`}
    >
      <div className="tm-progress-fill" style={{ width: `${normalizedValue}%` }} />
      <span className="tm-progress-value">{normalizedValue}%</span>
    </div>
  );
}

function ChecklistProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const percent = clampPercent(value);
  const roundedPercent = Math.round(percent);
  return (
    <div
      className={`tm-progress tm-progress-sm w-full ${muted ? 'tm-progress-muted' : 'tm-progress-success'}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${roundedPercent}%`}
    >
      <div className="tm-progress-fill" style={{ width: `${percent}%` }} />
      <span className="tm-progress-value">{roundedPercent}%</span>
    </div>
  );
}

function RewardProgressBar({ value }: { value: number }) {
  const normalizedValue = clampPercent(value);
  return (
    <div
      className="tm-progress tm-progress-reward w-full"
      role="progressbar"
      aria-valuenow={normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${Math.round(normalizedValue)}%`}
    >
      <div className="tm-progress-fill" style={{ width: `${normalizedValue}%` }} />
      <span className="tm-progress-value">{Math.round(normalizedValue)}%</span>
    </div>
  );
}

function TodayDayProgressBar({
  completed,
  total,
  remaining,
  overdue,
  labels
}: {
  completed: number;
  total: number;
  remaining: number;
  overdue: number;
  labels: (typeof TODAY_COPY)[AppLocale]['dayProgress'];
}) {
  const progressPercent = total > 0 ? clampPercent((completed / total) * 100) : 0;
  const progressLabel = total > 0 ? labels.progressLabel(completed, total) : labels.start;
  const progressCaption =
    total > 0
      ? labels.remaining(remaining, overdue)
      : labels.emptyPlan;

  return (
    <div
      className={`tm-today-day-progress ${
        total > 0 && completed >= total ? 'tm-today-day-progress-complete' : ''
      } ${overdue > 0 ? 'tm-today-day-progress-has-overdue' : ''}`}
    >
      <div
        className="tm-progress tm-progress-lg tm-progress-day w-full"
        role="progressbar"
        aria-label={labels.aria}
        aria-valuenow={Math.round(progressPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={progressLabel}
      >
        <div className="tm-progress-fill" style={{ width: `${progressPercent}%` }} />
        <span className="tm-progress-value">{progressLabel}</span>
      </div>
      <p className="tm-today-day-progress-caption">{progressCaption}</p>
    </div>
  );
}

function TaskProgressControls({
  value,
  onChange,
  disabled,
  showLabel = true
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  showLabel?: boolean;
}) {
  const handleRangeChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(normalizeProgressValue(Number(event.target.value)));
  };
  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    onChange(normalizeProgressValue(next));
  };

  return (
    <div className="space-y-2">
      {showLabel ? <p className="tm-task-details-title">Прогресс</p> : null}
      <div className="space-y-2">
        <input
          type="range"
          min={0}
          max={100}
          step={PROGRESS_STEP}
          value={value}
          onChange={handleRangeChange}
          className="tm-range"
          disabled={disabled}
        />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={PROGRESS_STEP}
            value={value}
            onChange={handleNumberChange}
            className="tm-input w-24 text-sm"
            disabled={disabled}
          />
          <span className="text-xs">%</span>
        </div>
      </div>
    </div>
  );
}

const getTaskValue = (task: Task) =>
  typeof task.xpOverride === 'number' ? task.xpOverride : xpForTask(task);

const getTaskValueToneClass = (taskValue: number) => {
  const normalized = Math.max(1, Math.min(10, Math.round(taskValue)));
  if (normalized >= 9) return 'tm-task-value-legendary';
  if (normalized >= 7) return 'tm-task-value-epic';
  if (normalized >= 4) return 'tm-task-value-rare';
  return 'tm-task-value-common';
};

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const toSafeFileName = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return 'task';
  const safe = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || 'task';
};

const getChecklistProgressPercent = (checklist?: TaskChecklistItem[]) => {
  if (!Array.isArray(checklist) || checklist.length === 0) return 0;
  const doneCount = checklist.filter((item) => item.done).length;
  return Math.round(clampPercent((doneCount / checklist.length) * 100));
};

const buildSkillOptions = (stats?: SkillsStatsState) => {
  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    names.push(trimmed);
  };
  stats?.characteristics?.forEach((item) => addName(item?.name ?? ''));
  stats?.skills?.forEach((item) => addName(item?.name ?? ''));
  if (names.length === 0) {
    DEFAULT_CHARACTERISTIC_NAMES.forEach(addName);
    DEFAULT_SKILL_NAMES.forEach(addName);
  }
  return names;
};

const splitSkillTagsInput = (value: string) => {
  const parts = value.split(',');
  const currentRaw = parts[parts.length - 1] ?? '';
  const prefixTokens = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  return { current: currentRaw.trim(), prefixTokens };
};

function SkillTagsInput({
  value,
  onChange,
  suggestions,
  disabled,
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const { current, prefixTokens } = useMemo(() => splitSkillTagsInput(value), [value]);
  const existing = useMemo(
    () => new Set(prefixTokens.map((token) => token.toLowerCase())),
    [prefixTokens]
  );
  const filteredSuggestions = useMemo(() => {
    const query = current.toLowerCase();
    if (!query) return [];
    return suggestions
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();
        return !existing.has(key) && key.startsWith(query) && key !== query;
      })
      .slice(0, 6);
  }, [current, existing, suggestions]);

  const applySuggestion = (suggestion: string) => {
    const trimmed = suggestion.trim();
    if (!trimmed) return;
    const nextTokens = [...prefixTokens, trimmed];
    onChange(`${nextTokens.join(', ')}, `);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm tm-label mb-1">Навыки</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === 'Tab' && filteredSuggestions.length > 0) {
            event.preventDefault();
            applySuggestion(filteredSuggestions[0]);
          }
        }}
        className="tm-input"
        placeholder={placeholder}
        disabled={disabled}
      />
      {focused && filteredSuggestions.length > 0 ? (
        <div
          className="tm-panel-soft p-2 space-y-1"
          onMouseDown={(event) => event.preventDefault()}
        >
          {filteredSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => applySuggestion(item)}
              className="tm-button tm-button-ghost tm-button-sm w-full text-left"
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-amber-200/70">Через запятую.</p>
    </div>
  );
}

const isUndoEvent = (event: LedgerEvent) =>
  event.note === 'TASK_UNDO' ||
  event.note === 'undo' ||
  event.meta?.eventType === 'TASK_UNDO';

const isDoneEvent = (event: LedgerEvent) =>
  event.note === 'TASK_DONE' ||
  event.meta?.eventType === 'TASK_DONE';

const isMissedEvent = (event: LedgerEvent) =>
  event.note === 'TASK_MISSED' ||
  event.meta?.eventType === 'TASK_MISSED';

function AddTaskModal({
  open,
  onClose,
  onCreated,
  skillOptions,
  projects
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  skillOptions: string[];
  projects: Project[];
}) {
  return (
    <TaskEditorModal
      open={open}
      mode="create"
      onClose={onClose}
      onSaved={onCreated}
      projects={projects}
      skillOptions={skillOptions}
      modalTitle="Новая задача"
      defaultBucket="inbox"
    />
  );
}

function CalendarModal({
  open,
  task,
  value,
  onChange,
  onCancel,
  onConfirm
}: {
  open: boolean;
  task: Task | null;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onCancel, open]);

  if (!open || !task) return null;

  return (
    <div className="tm-modal-overlay fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div
        className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-xl font-semibold tm-title mb-2">Add to Calendar</h2>
        <p className="text-sm text-amber-200/80 mb-4">{task.title}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm tm-label mb-1">Due datetime</label>
            <input
              type="datetime-local"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="tm-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="tm-button tm-button-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="tm-button tm-button-gold"
            >
              Download .ics
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LogDateModal({
  open,
  task,
  value,
  busy,
  onChange,
  onCancel,
  onConfirm
}: {
  open: boolean;
  task: Task | null;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open || busy || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [busy, onCancel, open]);

  if (!open || !task) return null;

  return (
    <div className="tm-modal-overlay fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div
        className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-xl font-semibold tm-title mb-2">{copy.logAtDate}</h2>
        <p className="text-sm text-amber-200/80 mb-4">{task.title}</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm tm-label mb-1">{copy.dateTime}</label>
            <input
              type="datetime-local"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="tm-input"
              disabled={busy}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="tm-button tm-button-ghost"
              disabled={busy}
            >
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="tm-button tm-button-gold"
              disabled={busy}
            >
              {busy ? copy.logSaving : copy.logAction}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditTaskModal({
  open,
  task,
  onClose,
  onSaved,
  skillOptions,
  projects
}: {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  skillOptions: string[];
  projects: Project[];
}) {
  return (
    <TaskEditorModal
      open={open}
      mode="edit"
      task={task}
      onClose={onClose}
      onSaved={onSaved}
      projects={projects}
      skillOptions={skillOptions}
      modalTitle="Редактировать задачу"
      defaultBucket="today"
    />
  );
}

function TaskCard({
  task,
  onLog,
  onAddToCalendar,
  onEdit,
  onDelete,
  quotaStatus,
  onProgressChange,
  onChecklistItemToggle,
  onToggle,
  expanded,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragEnabled,
  dragging,
  dragOver,
  busy,
  deleting
}: {
  task: Task;
  onLog: (task: Task, missed: boolean) => Promise<void>;
  onAddToCalendar: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  quotaStatus?: {
    done: number;
    count: number;
    percent: number;
    reached: boolean;
    per: 'week' | 'month';
  };
  onProgressChange: (task: Task, value: number) => void;
  onChecklistItemToggle: (task: Task, itemId: string) => void;
  onToggle: (taskId: string) => void;
  expanded: boolean;
  onDragStart: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd: () => void;
  dragEnabled: boolean;
  dragging: boolean;
  dragOver: boolean;
  busy: boolean;
  deleting: boolean;
}) {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
  const taskValue = getTaskValue(task);
  const deadlineDate = getNextDeadlineDate(task);
  const deadlineLabel = formatDeadline(deadlineDate);
  const reminderDate = getReminderDate(deadlineDate, task.reminder?.offsetMinutes);
  const reminderLabel = formatDeadline(reminderDate);
  const commentValue = task.comment?.trim();
  const commentText = commentValue ? commentValue : 'Без комментариев';
  const hasComment = Boolean(commentValue);
  const isArchived = Boolean(task.archived);
  const progressEnabled = Boolean(task.progressEnabled);
  const progressValue = normalizeProgressValue(task.progressValue ?? 0);
  const skillTags = Array.isArray(task.skillTags)
    ? task.skillTags.map((tag) => tag.trim()).filter(Boolean)
    : [];
  const checklistItems = useMemo(() => {
    if (!Array.isArray(task.checklist)) return [];
    return [...task.checklist].sort((a, b) => a.order - b.order);
  }, [task.checklist]);
  const hasChecklist = checklistItems.length > 0;
  const checklistProgress = getChecklistProgressPercent(checklistItems);
  const quotaReached = Boolean(quotaStatus?.reached);
  const quotaPeriodLabel = quotaStatus?.per === 'month' ? 'месяц' : 'неделя';
  const showDetails = !hasChecklist || expanded;
  const taskValueToneClass = getTaskValueToneClass(taskValue);
  const titleClassName = `tm-task-title ${taskValueToneClass} ${
    expanded ? 'whitespace-normal break-words' : 'whitespace-normal break-words sm:truncate'
  }`;
  const handleToggle = () => {
    if (dragging) return;
    onToggle(task.id);
  };

  return (
    <div
      className={`tm-card ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-3 ${
        dragging ? 'tm-dragging' : ''
      } ${dragOver ? 'tm-drag-over' : ''}`}
      onDragOver={(event) => onDragOver(event, task.id)}
      onDrop={(event) => onDrop(event, task.id)}
    >
      <div className="flex items-start gap-3">
        <div
          className={`tm-drag-handle min-w-0 ${dragEnabled && !busy ? '' : 'tm-drag-disabled'}`}
          draggable={dragEnabled && !busy}
          onDragStart={(event) => onDragStart(event, task.id)}
          onDragEnd={onDragEnd}
          onClick={handleToggle}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleToggle();
            }
          }}
          title="Drag to reorder"
        >
        <div className="flex items-center gap-2">
          {hasChecklist ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                handleToggle();
              }}
              className="tm-button tm-button-ghost tm-button-sm px-2"
              aria-label={expanded ? 'Collapse checklist' : 'Expand checklist'}
              disabled={busy}
            >
              {expanded ? 'v' : '>'}
            </button>
          ) : null}
          <p className={`${titleClassName} flex-1`}>{task.title}</p>
        </div>
        {hasChecklist ? (
          <div className="mt-1">
            <ChecklistProgressBar value={checklistProgress} />
          </div>
        ) : progressEnabled ? (
          <div className="mt-1">
            <TaskProgressBar value={progressValue} />
          </div>
        ) : null}
        {showDetails ? (
          <>
          <p className="text-sm text-amber-200/80 flex flex-wrap items-center gap-2">
          <span>
            {copy.periodicityLabels[task.periodicity]} ·{' '}
            <span className={rarityStyle.text}>{copy.rarityLabels[task.rarity]}</span> · {copy.valueLabel} {taskValue}
          </span>
          {hasComment ? (
            <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{copy.commentBadge}</span>
          ) : null}
        </p>
        {skillTags.length ? (
          <div className="tm-task-tags">
            {skillTags.map((tag, index) => (
              <span key={`${task.id}-tag-${index}`} className="tm-task-tag tm-chip tm-chip-muted tm-chip-sm">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {quotaStatus ? (
          <div className="space-y-1">
            <p className="text-xs text-amber-200/70">
              Квота: {quotaStatus.done} / {quotaStatus.count} · {quotaPeriodLabel}
            </p>
            <ChecklistProgressBar value={quotaStatus.percent} />
            {quotaReached ? (
              <p className="text-xs text-amber-200/70">Quota reached</p>
            ) : null}
          </div>
        ) : null}
        {deadlineLabel || reminderLabel ? (
          <p className="text-sm text-amber-200/70 flex flex-wrap gap-3">
            {deadlineLabel ? (
              <span className="inline-flex items-center gap-1">
                <span role="img" aria-label="Дедлайн">⏰</span>
                {deadlineLabel}
              </span>
            ) : null}
            {reminderLabel ? (
              <span className="inline-flex items-center gap-1">
                <span role="img" aria-label="Напоминание">🔔</span>
                {reminderLabel}
              </span>
            ) : null}
          </p>
        ) : null}
          </>
        ) : null}
      </div>
      <div className="flex flex-col items-center gap-2 ml-auto self-center shrink-0">
        <button
          onClick={() => onLog(task, false)}
          disabled={busy || quotaReached}
          className="tm-button tm-button-primary text-emerald-200"
        >
          ✓
        </button>
        <button
          onClick={() => onLog(task, true)}
          disabled={busy}
          className="tm-button tm-button-danger text-rose-200"
        >
          ✕
        </button>
      </div>
      </div>
      {expanded ? (
        <div className="tm-task-details space-y-3">
          {hasChecklist ? (
            <div className="space-y-2">
              <p className="tm-task-details-title">Checklist</p>
              <div className="space-y-2">
                {checklistItems.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => onChecklistItemToggle(task, item.id)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                      disabled={busy}
                    />
                    <span className={item.done ? 'line-through text-amber-200/60' : ''}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {progressEnabled ? (
            <TaskProgressControls
              value={progressValue}
              onChange={(value) => onProgressChange(task, value)}
              disabled={busy}
            />
          ) : null}
          <div className={hasComment ? 'tm-task-comment-panel' : undefined}>
            <p className="tm-task-details-title">Комментарий</p>
            <p className="tm-task-details-text whitespace-pre-wrap">{commentText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onAddToCalendar(task)}
              disabled={busy}
              className="tm-button tm-button-steel tm-button-sm"
            >
              Calendar
            </button>
            <button
              onClick={() => onEdit(task)}
              disabled={busy}
              className="tm-button tm-button-ghost tm-button-sm"
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(task)}
              disabled={busy}
              className="tm-button tm-button-danger tm-button-sm"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OverdueTaskCard({
  task,
  onLog,
  onEdit,
  onDelete,
  onProgressChange,
  onChecklistItemToggle,
  onToggle,
  expanded,
  busy,
  deleting
}: {
  task: Task;
  onLog: (task: Task, missed: boolean) => Promise<void>;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onProgressChange: (task: Task, value: number) => void;
  onChecklistItemToggle: (task: Task, itemId: string) => void;
  onToggle: (taskId: string) => void;
  expanded: boolean;
  busy: boolean;
  deleting: boolean;
}) {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
  const taskValue = getTaskValue(task);
  const deadlineDate = getCurrentPeriodDeadline(task);
  const deadlineLabel = formatDeadline(deadlineDate);
  const reminderDate = getReminderDate(deadlineDate, task.reminder?.offsetMinutes);
  const reminderLabel = formatDeadline(reminderDate);
  const overdueLabel = formatOverdueLabel(deadlineDate);
  const commentValue = task.comment?.trim();
  const commentText = commentValue ? commentValue : 'Без комментариев';
  const hasComment = Boolean(commentValue);
  const progressEnabled = Boolean(task.progressEnabled);
  const progressValue = normalizeProgressValue(task.progressValue ?? 0);
  const skillTags = Array.isArray(task.skillTags)
    ? task.skillTags.map((tag) => tag.trim()).filter(Boolean)
    : [];
  const checklistItems = useMemo(() => {
    if (!Array.isArray(task.checklist)) return [];
    return [...task.checklist].sort((a, b) => a.order - b.order);
  }, [task.checklist]);
  const hasChecklist = checklistItems.length > 0;
  const checklistProgress = getChecklistProgressPercent(checklistItems);
  const showDetails = !hasChecklist || expanded;
  const taskValueToneClass = getTaskValueToneClass(taskValue);
  const handleToggle = () => onToggle(task.id);

  return (
    <div
      className={`tm-card ring-1 ring-rose-500/40 ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-3`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          onClick={handleToggle}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              handleToggle();
            }
          }}
          className="min-w-0 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            {hasChecklist ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  handleToggle();
                }}
                className="tm-button tm-button-ghost tm-button-sm px-2"
                aria-label={expanded ? 'Collapse checklist' : 'Expand checklist'}
                disabled={busy}
              >
                {expanded ? 'v' : '>'}
              </button>
            ) : null}
          <p className={`tm-task-title ${taskValueToneClass} flex-1`}>{task.title}</p>
          </div>
          {hasChecklist ? (
            <div className="mt-1">
              <ChecklistProgressBar value={checklistProgress} />
            </div>
          ) : progressEnabled ? (
            <div className="mt-1">
              <TaskProgressBar value={progressValue} />
            </div>
          ) : null}
          {showDetails ? (
            <>
              <p className="text-sm text-amber-200/80 flex flex-wrap items-center gap-2">
                <span>
                  {copy.periodicityLabels[task.periodicity]} ·{' '}
                  <span className={rarityStyle.text}>{copy.rarityLabels[task.rarity]}</span> · {copy.valueLabel} {taskValue}
                </span>
                {hasComment ? (
                  <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{copy.commentBadge}</span>
                ) : null}
                <span className="tm-badge tm-badge-danger tm-chip tm-chip-danger">{copy.overdueBadge}</span>
              </p>
              {overdueLabel ? <p className="text-xs text-rose-200">{overdueLabel}</p> : null}
              {skillTags.length ? (
                <div className="tm-task-tags">
                  {skillTags.map((tag, index) => (
                    <span key={`${task.id}-tag-${index}`} className="tm-task-tag tm-chip tm-chip-muted tm-chip-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
              {deadlineLabel || reminderLabel ? (
                <p className="text-sm text-amber-200/70 flex flex-wrap gap-3">
                  {deadlineLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <span role="img" aria-label="Дедлайн">⏰</span>
                      {deadlineLabel}
                    </span>
                  ) : null}
                  {reminderLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <span role="img" aria-label="Напоминание">🔔</span>
                      {reminderLabel}
                    </span>
                  ) : null}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button
            onClick={() => onLog(task, false)}
            className="tm-button tm-button-primary tm-button-sm"
            disabled={busy}
          >
            Сделать
          </button>
          <button
            onClick={() => onLog(task, true)}
            className="tm-button tm-button-danger tm-button-sm"
            disabled={busy}
          >
            Пропустить
          </button>
          <button
            onClick={() => onEdit(task)}
            className="tm-button tm-button-ghost tm-button-sm"
            disabled={busy}
          >
            Перенести
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="tm-task-details space-y-3">
          {hasChecklist ? (
            <div className="space-y-2">
              <p className="tm-task-details-title">Checklist</p>
              <div className="space-y-2">
                {checklistItems.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => onChecklistItemToggle(task, item.id)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                      disabled={busy}
                    />
                    <span className={item.done ? 'line-through text-amber-200/60' : ''}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {progressEnabled ? (
            <TaskProgressControls
              value={progressValue}
              onChange={(value) => onProgressChange(task, value)}
              disabled={busy}
            />
          ) : null}
          <div className={hasComment ? 'tm-task-comment-panel' : undefined}>
            <p className="tm-task-details-title">Комментарий</p>
            <p className="tm-task-details-text whitespace-pre-wrap">{commentText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onEdit(task)}
              className="tm-button tm-button-ghost tm-button-sm"
              disabled={busy}
            >
              Edit
            </button>
            <button
              onClick={() => onDelete(task)}
              className="tm-button tm-button-danger tm-button-sm"
              disabled={busy}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TaskEmptyState({
  title,
  text
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="tm-card px-4 py-4 space-y-1">
      <p className="tm-task-title tm-task-value-common text-base">{title}</p>
      <p className="text-sm text-amber-200/70">{text}</p>
    </div>
  );
}

function QueueSection({
  title,
  count,
  children,
  toneClassName = 'tm-title'
}: {
  title: string;
  count: number;
  children: ReactNode;
  toneClassName?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className={`text-lg font-semibold ${toneClassName}`}>{title}</h3>
        <span
          className={
            toneClassName.includes('rose')
              ? 'tm-badge tm-badge-danger tm-chip tm-chip-danger'
              : 'tm-badge tm-badge-note tm-chip tm-chip-muted'
          }
        >
          {count}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

type CompletedTodayEntry = {
  task: Task;
  completedAtLabel: string;
  occurredAt: number;
  xpDelta: number;
};

type CompletedHistoryEntry = {
  task: Task;
  eventId: string;
  periodKey: string;
  completedAtLabel: string;
  occurredAt: number;
  xpDelta: number;
};

type CompletionFeedback = {
  id: string;
  message: string;
  xpDelta: number;
};

type PendingTaskCompletion = {
  taskId: string;
};

type CompletionFloatFx = {
  id: string;
  xpDelta: number;
  originX: number;
  originY: number;
};

const formatTimeOfDay = (value: unknown) => {
  const timestamp = parseEventTimestamp(value);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const shouldShowTaskStreak = (streak?: StreakState | null) =>
  Boolean(streak && (streak.currentCount > 0 || streak.bestCount > 0));

const formatTaskStreakLabel = (streak: StreakState) =>
  streak.bestCount > streak.currentCount
    ? `Стрик ${streak.currentCount} · рекорд ${streak.bestCount}`
    : `Стрик ${streak.currentCount}`;

function TodayRewardStrip({
  xp,
  nextReward,
  highlighted
}: {
  xp: number;
  nextReward: Reward | null;
  highlighted?: boolean;
}) {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const rewardProgressPercent = nextReward ? getRewardProgressPercent(xp, nextReward.cost) : 0;
  const rewardProgressValue = nextReward ? Math.min(xp, nextReward.cost) : 0;
  const remainingXp = nextReward ? Math.max(nextReward.cost - xp, 0) : 0;

  return (
    <section
      className={`tm-panel-soft tm-summary-panel tm-today-reward-strip tm-today-reward-card ${
        highlighted ? 'tm-today-reward-strip-active' : ''
      }`}
    >
      <div className="tm-today-summary-header">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tm-title tm-today-reward-title">
            {nextReward ? nextReward.name : copy.rewardNotSelected}
          </h2>
        </div>
        {nextReward ? (
          <p className="tm-today-reward-remaining tm-today-reward-header-remaining">
            {remainingXp > 0 ? copy.rewardRemaining(remainingXp) : copy.rewardUnlocked}
          </p>
        ) : null}
      </div>
      {nextReward ? (
        <>
          <div className="tm-today-reward-meta">
            <p className="tm-today-reward-progress-value">
              {rewardProgressValue} / {nextReward.cost} XP
            </p>
          </div>
          <RewardProgressBar value={rewardProgressPercent} />
        </>
      ) : (
        <div className="space-y-2">
          <p className="tm-today-reward-remaining">
            {copy.rewardEmptyHint}
          </p>
          <p className="tm-today-reward-subline">{copy.currentXp(xp)}</p>
        </div>
      )}
    </section>
  );
}

function CompletedTodaySection({
  entries,
  historyEntries,
  historyTotalCount,
  totalCount,
  expanded,
  historyExpanded,
  onToggle,
  onToggleHistory,
  onUndo,
  onUndoHistory,
  busyTaskId,
  busyHistoryEventId,
  emptyStateText,
  taskStreakById
}: {
  entries: CompletedTodayEntry[];
  historyEntries: CompletedHistoryEntry[];
  historyTotalCount: number;
  totalCount: number;
  expanded: boolean;
  historyExpanded: boolean;
  onToggle: () => void;
  onToggleHistory: () => void;
  onUndo: (task: Task) => void;
  onUndoHistory: (entry: CompletedHistoryEntry) => void;
  busyTaskId: string | null;
  busyHistoryEventId: string | null;
  emptyStateText: string;
  taskStreakById: Map<string, StreakState>;
}) {
  return (
    <section className="tm-panel-soft p-4 space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="tm-summary-toggle"
        aria-expanded={expanded}
      >
        <div className="min-w-0">
          <span className="text-lg font-semibold tm-title">Сделано сегодня · {totalCount}</span>
          <p className="text-xs text-amber-200/70">
            {totalCount > 0 ? 'Уже заработанный прогресс за день' : 'Закрытые задачи будут появляться здесь'}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`tm-summary-chevron ${expanded ? 'tm-summary-chevron-open' : ''}`}
        >
          v
        </span>
      </button>
      {expanded ? (
        entries.length > 0 ? (
          <div className="space-y-2">
            {entries.map((entry) => (
              (() => {
                const taskStreak = taskStreakById.get(entry.task.id);
                return (
                  <div key={`completed-today-${entry.task.id}-${entry.occurredAt}`} className="tm-card tm-completed-today-item px-3 py-3">
                    <div className="min-w-0 space-y-1">
                      <p className="tm-task-title tm-task-title-muted line-through">
                        {entry.task.title}
                      </p>
                      <p className="text-xs text-amber-200/70 flex flex-wrap items-center gap-2">
                        <span>{formatXpDelta(entry.xpDelta)}</span>
                        {entry.completedAtLabel ? <span>{entry.completedAtLabel}</span> : null}
                        {entry.task.periodicity === 'daily' && shouldShowTaskStreak(taskStreak) ? (
                          <span>{formatTaskStreakLabel(taskStreak)}</span>
                        ) : null}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onUndo(entry.task)}
                      className="tm-button tm-button-ghost tm-button-sm tm-completed-today-undo"
                      disabled={busyTaskId === entry.task.id}
                    >
                      {busyTaskId === entry.task.id ? 'Отмена...' : 'Отменить'}
                    </button>
                  </div>
                );
              })()
            ))}
          </div>
        ) : (
          <p className="text-sm text-amber-200/70">{emptyStateText}</p>
        )
      ) : null}
      {expanded ? (
        <div className="pt-2 tm-divider space-y-3">
          <button
            type="button"
            onClick={onToggleHistory}
            className="tm-button tm-button-ghost tm-button-sm w-full sm:w-auto"
            disabled={historyTotalCount === 0}
            aria-expanded={historyExpanded}
          >
            Сделано ранее{historyTotalCount > 0 ? ` · ${historyTotalCount}` : ''}
          </button>
          {historyExpanded ? (
            historyEntries.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-200/70">
                  Показаны последние {historyEntries.length} записей.
                </p>
                {historyEntries.map((entry) => {
                  const taskStreak = taskStreakById.get(entry.task.id);
                  return (
                    <div
                      key={`completed-history-${entry.eventId}`}
                      className="tm-card tm-completed-today-item px-3 py-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <p className="tm-task-title tm-task-title-muted line-through">
                          {entry.task.title}
                        </p>
                        <p className="text-xs text-amber-200/70 flex flex-wrap items-center gap-2">
                          <span>{formatXpDelta(entry.xpDelta)}</span>
                          {entry.completedAtLabel ? <span>{entry.completedAtLabel}</span> : null}
                          {entry.task.periodicity === 'daily' && shouldShowTaskStreak(taskStreak) ? (
                            <span>{formatTaskStreakLabel(taskStreak)}</span>
                          ) : null}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onUndoHistory(entry)}
                        className="tm-button tm-button-ghost tm-button-sm tm-completed-today-undo"
                        disabled={busyHistoryEventId === entry.eventId}
                      >
                        {busyHistoryEventId === entry.eventId ? 'Отмена...' : 'Отменить'}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-amber-200/70">Ранних выполнений пока нет.</p>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WeekdaySelector({
  value,
  onChange,
  disabled
}: {
  value?: AllowedWeekday[];
  onChange: (value: AllowedWeekday[] | undefined) => void;
  disabled?: boolean;
}) {
  const normalizedValue = normalizeAllowedWeekdays(value);

  const toggleWeekday = (weekday: AllowedWeekday) => {
    const current = normalizedValue ?? [];
    const next = current.includes(weekday)
      ? current.filter((item) => item !== weekday)
      : [...current, weekday];
    onChange(normalizeAllowedWeekdays(next));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm tm-label">Дни выполнения</label>
        <span className="text-xs text-amber-200/70">
          {formatAllowedWeekdaysLabel(normalizedValue)}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`tm-button tm-button-sm ${
            normalizedValue ? 'tm-button-ghost' : 'tm-button-primary'
          }`}
          onClick={() => onChange(undefined)}
          disabled={disabled}
        >
          Любой день
        </button>
        <button
          type="button"
          className={`tm-button tm-button-sm ${
            weekdaySelectionsEqual(normalizedValue, WEEKDAY_WORKDAYS)
              ? 'tm-button-primary'
              : 'tm-button-ghost'
          }`}
          onClick={() => onChange(WEEKDAY_WORKDAYS)}
          disabled={disabled}
        >
          Будни
        </button>
        <button
          type="button"
          className={`tm-button tm-button-sm ${
            weekdaySelectionsEqual(normalizedValue, WEEKDAY_WEEKENDS)
              ? 'tm-button-primary'
              : 'tm-button-ghost'
          }`}
          onClick={() => onChange(WEEKDAY_WEEKENDS)}
          disabled={disabled}
        >
          Выходные
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(Object.entries(WEEKDAY_LABELS_SHORT) as Array<[string, string]>).map(([weekday, label]) => {
          const numericWeekday = Number(weekday) as AllowedWeekday;
          const active = normalizedValue?.includes(numericWeekday) ?? false;
          return (
            <button
              key={weekday}
              type="button"
              className={`tm-button tm-button-sm ${active ? 'tm-button-primary' : 'tm-button-ghost'}`}
              onClick={() => toggleWeekday(numericWeekday)}
              disabled={disabled}
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-amber-200/70">
        Оставь без выбора, если задачу можно делать в любой день.
      </p>
    </div>
  );
}

function CompletionFeedbackToast({ feedback }: { feedback: CompletionFeedback }) {
  return (
    <div className="tm-today-feedback-toast" role="status" aria-live="polite">
      <span className="tm-pill tm-chip tm-chip-xp">{formatXpDelta(feedback.xpDelta)}</span>
      <p className="text-sm font-semibold text-amber-50 truncate max-w-[14rem] sm:max-w-[20rem]">
        {feedback.message}
      </p>
    </div>
  );
}

function TaskCompletionFloatFx({ fx }: { fx: CompletionFloatFx }) {
  return (
    <div
      className="tm-task-complete-fx"
      style={{ left: `${fx.originX}px`, top: `${fx.originY}px` }}
      aria-hidden="true"
    >
      <span className="tm-task-complete-fx-xp">{formatXpDelta(fx.xpDelta)}</span>
    </div>
  );
}

function ExecutionTaskCard({
  task,
  queue,
  projectLabel,
  expanded,
  planning,
  completing,
  overdue,
  streak,
  quotaStatus,
  busy,
  deleting,
  onComplete,
  onPlan,
  onToggleDetails,
  onMoveToBucket,
  onEdit,
  onDelete,
  onSkip,
  onLogAtDate,
  onAddToCalendar,
  onProgressChange,
  onChecklistItemToggle,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragEnabled,
  dragging,
  dragOver
}: {
  task: Task;
  queue: TodayQueueTab;
  projectLabel?: string;
  expanded: boolean;
  planning: boolean;
  completing?: boolean;
  overdue?: boolean;
  streak?: StreakState;
  quotaStatus?: {
    done: number;
    count: number;
    percent: number;
    reached: boolean;
    per: 'week' | 'month';
  };
  busy: boolean;
  deleting: boolean;
  onComplete: (task: Task, origin?: { x: number; y: number }) => void;
  onPlan: (task: Task) => void;
  onToggleDetails: (task: Task) => void;
  onMoveToBucket: (task: Task, bucket: TaskBucket) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onSkip: (task: Task) => void;
  onLogAtDate: (task: Task) => void;
  onAddToCalendar: (task: Task) => void;
  onProgressChange: (task: Task, value: number) => void;
  onChecklistItemToggle: (task: Task, itemId: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, taskId: string) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd: () => void;
  dragEnabled: boolean;
  dragging: boolean;
  dragOver: boolean;
}) {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
  const taskValue = getTaskValue(task);
  const taskValueToneClass = getTaskValueToneClass(taskValue);
  const deadlineDate = overdue ? getCurrentPeriodDeadline(task) : getNextDeadlineDate(task);
  const deadlineLabel = formatDeadline(deadlineDate);
  const reminderDate = getReminderDate(deadlineDate, task.reminder?.offsetMinutes);
  const reminderLabel = formatDeadline(reminderDate);
  const overdueLabel = overdue ? formatOverdueLabel(deadlineDate) : null;
  const dueSoonMeta = overdue ? null : getDueSoonMeta(deadlineDate);
  const commentValue = task.comment?.trim();
  const commentPreview =
    commentValue && commentValue.length > 120 ? `${commentValue.slice(0, 117)}...` : commentValue;
  const progressEnabled = Boolean(task.progressEnabled);
  const progressValue = normalizeProgressValue(task.progressValue ?? 0);
  const streakLabel = shouldShowTaskStreak(streak) ? formatTaskStreakLabel(streak as StreakState) : null;
  const skillTags = Array.isArray(task.skillTags)
    ? task.skillTags.map((tag) => tag.trim()).filter(Boolean)
    : [];
  const checklistItems = useMemo(() => {
    if (!Array.isArray(task.checklist)) return [];
    return [...task.checklist].sort((a, b) => a.order - b.order);
  }, [task.checklist]);
  const hasChecklist = checklistItems.length > 0;
  const checklistProgress = getChecklistProgressPercent(checklistItems);
  const queuePeriodLabel = quotaStatus?.per === 'month' ? copy.month : copy.week;
  const showDetails = expanded || planning;
  const showPenaltyAction = queue === 'today';
  const detailsLabel = showDetails ? copy.hideDetails : copy.showDetails;
  const planLabel = planning ? copy.hideMove : copy.move;
  const detailsId = `task-details-${task.id}`;
  const actionRailClassName = 'tm-task-action-rail';
  const completeActionClassName = 'tm-button tm-button-primary tm-task-action-complete';
  const moreActionClassName = 'tm-button tm-button-ghost tm-task-action-more';
  const [menuOpen, setMenuOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const portalThemeClassName = getPortalThemeClassName();
  const suppressTitleClickRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const anchor = moreButtonRef.current;
      if (!anchor || typeof window === 'undefined') return;
      const rect = anchor.getBoundingClientRect();
      const availableWidth = Math.max(160, window.innerWidth - TASK_OVERFLOW_MENU_GUTTER_PX * 2);
      const width = Math.min(TASK_OVERFLOW_MENU_MAX_WIDTH_PX, availableWidth);
      const menuHeight = menuRef.current?.offsetHeight ?? 280;
      const preferredLeft = rect.right - width;
      const maxLeft = Math.max(
        TASK_OVERFLOW_MENU_GUTTER_PX,
        window.innerWidth - width - TASK_OVERFLOW_MENU_GUTTER_PX
      );
      const left = Math.min(Math.max(TASK_OVERFLOW_MENU_GUTTER_PX, preferredLeft), maxLeft);
      const bottomTop = rect.bottom + TASK_OVERFLOW_MENU_OFFSET_PX;
      const top =
        bottomTop + menuHeight <= window.innerHeight - TASK_OVERFLOW_MENU_GUTTER_PX
          ? bottomTop
          : Math.max(
              TASK_OVERFLOW_MENU_GUTTER_PX,
              rect.top - menuHeight - TASK_OVERFLOW_MENU_OFFSET_PX
            );

      setMenuPosition({ top, left, width });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || moreButtonRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const runMenuAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const handleTitleDragStart = (event: DragEvent<HTMLElement>) => {
    suppressTitleClickRef.current = true;
    onDragStart(event, task.id);
  };

  const handleTitleDragEnd = () => {
    onDragEnd();
    window.setTimeout(() => {
      suppressTitleClickRef.current = false;
    }, 0);
  };

  const handleTitleToggle = () => {
    if (suppressTitleClickRef.current || dragging) return;
    onToggleDetails(task);
  };

  return (
    <div
      ref={cardRef}
      className={`tm-card tm-task-card-shell ${menuOpen ? 'tm-task-card-shell-menu-open' : ''} ${
        completing ? 'tm-task-card-shell-completing' : ''
      } ${dragging ? 'tm-dragging' : ''} ${dragOver ? 'tm-drag-over' : ''} ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2.5 sm:px-3.5 flex flex-col gap-2.5`}
      onDragOver={(event) => onDragOver(event, task.id)}
      onDrop={(event) => onDrop(event, task.id)}
    >
      <div className="tm-task-card-main">
        <div className="tm-task-card-copy">
          <div className="tm-task-card-head">
            <button
              type="button"
              onClick={handleTitleToggle}
              draggable={dragEnabled && !busy}
              onDragStart={handleTitleDragStart}
              onDragEnd={handleTitleDragEnd}
              className={`tm-task-title-trigger basis-full min-w-0 sm:basis-auto sm:flex-1 ${
                dragEnabled && !busy ? 'tm-task-title-drag-enabled' : ''
              }`}
              aria-expanded={showDetails}
              aria-controls={detailsId}
              title={
                dragEnabled && !busy
                  ? copy.dragDetailsHint
                  : detailsLabel
              }
            >
              <span className={`tm-task-title ${taskValueToneClass} whitespace-normal break-words`}>
                {task.title}
              </span>
            </button>
            {overdueLabel || dueSoonMeta || planning ? (
              <div className="tm-task-card-flags flex basis-full flex-wrap items-center gap-2 sm:basis-auto">
                {overdueLabel ? (
                  <span className="tm-badge tm-badge-danger tm-chip tm-chip-danger">{overdueLabel}</span>
                ) : null}
                {dueSoonMeta ? (
                  <span
                    className={`tm-badge tm-chip ${
                      dueSoonMeta.urgency === 'critical'
                        ? 'tm-badge-danger tm-chip-danger'
                        : 'tm-badge-note tm-chip-warning'
                    }`}
                  >
                    {dueSoonMeta.label}
                  </span>
                ) : null}
                {planning ? (
                  <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{copy.planningBadge}</span>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="text-sm text-amber-200/80 flex flex-wrap items-center gap-2">
            <span>
              {copy.periodicityLabels[task.periodicity]} · <span className={rarityStyle.text}>{copy.rarityLabels[task.rarity]}</span> ·
              {copy.valueLabel} {taskValue}
            </span>
          </p>
          {projectLabel ? (
            <div>
              <span className="tm-project-chip tm-chip tm-chip-project">{projectLabel}</span>
            </div>
          ) : null}
          {hasChecklist ? (
            <ChecklistProgressBar value={checklistProgress} />
          ) : progressEnabled ? (
            <TaskProgressBar value={progressValue} />
          ) : null}
          {skillTags.length ? (
            <div className="tm-task-tags">
              {skillTags.map((tag, index) => (
                <span key={`${task.id}-tag-${index}`} className="tm-task-tag tm-chip tm-chip-muted tm-chip-sm">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {deadlineLabel || reminderLabel ? (
            <p className="text-sm text-amber-200/70 flex flex-wrap gap-3">
              {deadlineLabel ? <span>{deadlineLabel}</span> : null}
              {reminderLabel ? <span>{copy.remindPrefix} {reminderLabel}</span> : null}
            </p>
          ) : null}
          {commentPreview && !showDetails ? (
            <p className="text-sm text-amber-100/90 whitespace-pre-wrap">{commentPreview}</p>
          ) : null}
          {quotaStatus ? (
            <p className="text-xs text-amber-200/70">
              {copy.quota}: {quotaStatus.done} / {quotaStatus.count} · {queuePeriodLabel}
            </p>
          ) : null}
          {task.periodicity === 'daily' && streakLabel ? (
            <p className="text-xs text-emerald-200/75">{streakLabel}</p>
          ) : null}
        </div>
        <div className={actionRailClassName}>
          <button
            type="button"
            onClick={() => {
              const rect = cardRef.current?.getBoundingClientRect();
              const origin = rect
                ? {
                    x: rect.left + rect.width / 2,
                    y: rect.top + Math.min(rect.height - 18, rect.height * 0.82)
                  }
                : undefined;
              onComplete(task, origin);
            }}
            className={`${completeActionClassName} ${completing ? 'tm-task-action-complete-active' : ''}`}
            disabled={busy}
            aria-label={copy.completeAria(task.title)}
            title={copy.complete}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className={moreActionClassName}
            ref={moreButtonRef}
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={copy.moreAria(task.title)}
            title={copy.more}
          >
            ...
          </button>
        </div>
      </div>
      {menuOpen && menuPosition
        ? createPortal(
            <div
              ref={menuRef}
              className={`tm-task-overflow-menu ${portalThemeClassName}`}
              role="menu"
              aria-label={copy.actionsFor(task.title)}
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                width: `${menuPosition.width}px`
              }}
            >
              <button
                type="button"
                className="tm-task-overflow-item"
                onClick={() => runMenuAction(() => onToggleDetails(task))}
                disabled={busy}
                role="menuitem"
              >
                {detailsLabel}
              </button>
              <button
                type="button"
                className="tm-task-overflow-item"
                onClick={() => runMenuAction(() => onPlan(task))}
                disabled={busy}
                role="menuitem"
              >
                {planLabel}
              </button>
              <button
                type="button"
                className="tm-task-overflow-item"
                onClick={() => runMenuAction(() => onLogAtDate(task))}
                disabled={busy}
                role="menuitem"
              >
                {copy.logAtDate}
              </button>
              <button
                type="button"
                className="tm-task-overflow-item"
                onClick={() => runMenuAction(() => onAddToCalendar(task))}
                disabled={busy}
                role="menuitem"
              >
                {copy.calendarAction}
              </button>
              <button
                type="button"
                className="tm-task-overflow-item"
                onClick={() => runMenuAction(() => onEdit(task))}
                disabled={busy}
                role="menuitem"
              >
                {copy.edit}
              </button>
              {showPenaltyAction ? (
                <button
                  type="button"
                  className="tm-task-overflow-item tm-task-overflow-item-danger"
                  onClick={() => runMenuAction(() => onSkip(task))}
                  disabled={busy}
                  role="menuitem"
                >
                  {copy.skip}
                </button>
              ) : null}
              <button
                type="button"
                className="tm-task-overflow-item tm-task-overflow-item-danger"
                onClick={() => runMenuAction(() => onDelete(task))}
                disabled={busy}
                role="menuitem"
              >
                {deleting ? copy.deleting : copy.delete}
              </button>
            </div>,
            document.body
          )
        : null}
      {showDetails ? (
        <div id={detailsId} className="tm-task-details space-y-3">
          {planning ? (
            <div className="space-y-2">
              <p className="tm-task-details-title">{copy.queue}</p>
              <div className="flex flex-wrap gap-2">
                {TODAY_QUEUE_TABS.map((bucket) => (
                  <button
                    key={`${task.id}-${bucket}`}
                    type="button"
                    onClick={() => onMoveToBucket(task, bucket)}
                    className={`tm-button tm-button-sm ${task.bucket === bucket ? 'tm-button-gold' : 'tm-button-ghost'}`}
                    disabled={busy}
                  >
                    {copy.bucketActionLabels[bucket]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {hasChecklist ? (
            <div className="space-y-2">
              <p className="tm-task-details-title">Checklist</p>
              <div className="space-y-2">
                {checklistItems.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => onChecklistItemToggle(task, item.id)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                      disabled={busy}
                    />
                    <span className={item.done ? 'line-through text-amber-200/60' : ''}>{item.text}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          {progressEnabled ? (
            <TaskProgressControls
              value={progressValue}
              onChange={(value) => onProgressChange(task, value)}
              disabled={busy}
            />
          ) : null}
          {commentValue ? (
            <div className="tm-task-comment-panel">
              <p className="tm-task-details-title">{copy.comment}</p>
              <p className="tm-task-details-text whitespace-pre-wrap">{commentValue}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function TodayPage() {
  const { locale } = useLocale();
  const copy = TODAY_COPY[locale];
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQueue, setActiveQueue] = useState<TodayQueueTab>('today');
  const [xp, setXp] = useState(0);
  const [dailyXp, setDailyXp] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [pinnedRewardIds, setPinnedRewardIds] = useState<string[]>([]);
  const [skillOptions, setSkillOptions] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingTaskId, setLoggingTaskId] = useState<string | null>(null);
  const [logDateTask, setLogDateTask] = useState<Task | null>(null);
  const [logDateValue, setLogDateValue] = useState(() => toLocalInputValue(new Date()));
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);
  const [calendarValue, setCalendarValue] = useState('');
  const [taskStatusById, setTaskStatusById] = useState<Record<string, TaskStatus>>({});
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSort>('manual');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Record<string, boolean>>({});
  const [planningTaskId, setPlanningTaskId] = useState<string | null>(null);
  const [showCompletedToday, setShowCompletedToday] = useState(true);
  const [showCompletedHistory, setShowCompletedHistory] = useState(false);
  const [completionFeedback, setCompletionFeedback] = useState<CompletionFeedback | null>(null);
  const [pendingTaskCompletion, setPendingTaskCompletion] = useState<PendingTaskCompletion | null>(null);
  const [completionFloatFx, setCompletionFloatFx] = useState<CompletionFloatFx | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [removingHistoryEventId, setRemovingHistoryEventId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const completionTimerRef = useRef<number | null>(null);
  const completionFloatFxTimerRef = useRef<number | null>(null);

  const logStorageCounts = async (tasksData: Task[], eventsData: LedgerEvent[]) => {
    if (!DEBUG_COUNTS) return;
    const [taskRows, ledgerRows, dailyRows, rewardRows] = await Promise.all([
      db.tasks.toArray(),
      db.ledgerEvents.toArray(),
      db.dailyLogs.toArray(),
      db.rewards.toArray()
    ]);
    const taskIds = new Set(taskRows.map((task) => task.id));
    const ledgerIds = new Set(ledgerRows.map((event) => event.id));
    const dailyIds = new Set(dailyRows.map((log) => log.id));
    const rewardIds = new Set(rewardRows.map((reward) => reward.id));
    const checklistItemsCount = taskRows.reduce(
      (total, task) => total + (Array.isArray(task.checklist) ? task.checklist.length : 0),
      0
    );
    const dedupeMap = new Map<string, number>();
    for (const task of taskRows) {
      const key = normalizeTaskDedupeKey(task);
      dedupeMap.set(key, (dedupeMap.get(key) ?? 0) + 1);
    }
    const duplicatedSignatures = Array.from(dedupeMap.entries()).filter(([, count]) => count > 1);
    console.groupCollapsed('[TodayPage] Storage counts');
    console.table({
      tasks_count: taskRows.length,
      tasks_distinct_id: taskIds.size,
      ledgerEvents_count: ledgerRows.length,
      ledgerEvents_distinct_id: ledgerIds.size,
      dailyLogs_count: dailyRows.length,
      dailyLogs_distinct_id: dailyIds.size,
      rewards_count: rewardRows.length,
      rewards_distinct_id: rewardIds.size,
      checklistItems_count: checklistItemsCount
    });
    console.log('Source: Dexie tables', {
      tasks: 'db.tasks',
      ledgerEvents: 'db.ledgerEvents',
      dailyLogs: 'db.dailyLogs',
      rewards: 'db.rewards',
      checklistItems: 'task.checklist[] embedded'
    });
    if (duplicatedSignatures.length > 0) {
      console.warn(
        '[TodayPage] Duplicate task signatures found',
        duplicatedSignatures.slice(0, 10)
      );
    }
    console.log('Loaded lists', {
      listTasks_count: tasksData.length,
      listEvents_count: eventsData.length
    });
    console.groupEnd();
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

  const load = async () => {
    setLoading(true);
    const [t, balance, eventsData, rewardsData, projectsData, pinned, stats] = await Promise.all([
      listTasks(),
      getXpBalance(),
      listEvents(),
      db.rewards.toArray(),
      listProjects(),
      getAppMetaValue<string[]>(PINNED_REWARDS_META_KEY),
      getAppMetaValue<SkillsStatsState>(SKILLS_STATS_META_KEY)
    ]);
    const normalizedPins = Array.isArray(pinned)
      ? pinned.filter((id): id is string => typeof id === 'string')
      : [];
    const today = new Date();
    const tasksById = new Map(t.map((task) => [task.id, task]));
    const eventsByTaskId = new Map<string, LedgerEvent[]>();
    const latestByTaskIdToday = new Map<string, LedgerEvent>();
    for (const event of eventsData) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const task = tasksById.get(event.taskId);
      if (!task) continue;
      const taskEvents = eventsByTaskId.get(event.taskId) ?? [];
      taskEvents.push(event);
      eventsByTaskId.set(event.taskId, taskEvents);
      const eventTime = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      const eventDate = new Date(eventTime);
      if (!isSameLocalDate(eventDate, today)) continue;
      const existingToday = latestByTaskIdToday.get(event.taskId);
      const existingTodayTime = existingToday
        ? parseEventTimestamp(existingToday.createdAt)
        : NaN;
      if (!existingToday || Number.isNaN(existingTodayTime) || existingTodayTime < eventTime) {
        latestByTaskIdToday.set(event.taskId, event);
      }
    }
    let earnedToday = 0;
    const completedToday = new Set<string>();
    for (const [taskId, event] of latestByTaskIdToday.entries()) {
      if (isUndoEvent(event)) continue;
      earnedToday += event.deltaXp;
      if (isMissedEvent(event)) {
        continue;
      }
      if (event.deltaXp > 0) {
        completedToday.add(taskId);
      }
    }
    const nextStatusById: Record<string, TaskStatus> = {};
    for (const task of t) {
      if (task.archived) {
        nextStatusById[task.id] = 'completed';
        continue;
      }
      const latest = getLatestEventForTaskPeriod(task, eventsByTaskId.get(task.id) ?? [], today);
      if (latest && !isUndoEvent(latest)) {
        if (isMissedEvent(latest)) {
          nextStatusById[task.id] = 'missed';
          continue;
        }
        if (latest.deltaXp > 0) {
          nextStatusById[task.id] = 'completed';
          continue;
        }
      }
      if (!isTaskAllowedInTodayFlow(task, today)) {
        nextStatusById[task.id] = 'pending';
        continue;
      }
      const currentDeadline = getCurrentPeriodDeadline(task, today);
      nextStatusById[task.id] =
        currentDeadline && currentDeadline.getTime() < today.getTime() ? 'overdue' : 'pending';
    }
    setTasks(t);
    setLedgerEvents(eventsData);
    setRewards(rewardsData);
    setProjects(projectsData);
    setPinnedRewardIds(normalizedPins);
    setSkillOptions(buildSkillOptions(stats));
    setXp(balance);
    setDailyXp(earnedToday);
    setTaskStatusById(nextStatusById);
    setCompletedTodayCount(completedToday.size);
    setLoading(false);
    void logStorageCounts(t, eventsData);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    setPlanningTaskId(null);
  }, [activeQueue]);

  useEffect(() => {
    if (!sortOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!sortMenuRef.current) return;
      if (!sortMenuRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSortOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [sortOpen]);

  useEffect(() => {
    if (!completionFeedback) return;
    const timeoutId = window.setTimeout(() => {
      setCompletionFeedback(null);
    }, COMPLETION_FEEDBACK_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [completionFeedback]);

  useEffect(() => {
    return () => {
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
      if (completionFloatFxTimerRef.current !== null) {
        window.clearTimeout(completionFloatFxTimerRef.current);
      }
    };
  }, []);

  const uniqueTasks = useMemo(() => {
    const seen = new Set<string>();
    const result: Task[] = [];
    for (const task of tasks) {
      const key = normalizeTaskDedupeKey(task);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(task);
    }
    return result;
  }, [tasks]);

  const sortedTasks = useMemo(() => {
    const getManualSortValue = (task: Task) =>
      typeof task.sortOrder === 'number'
        ? task.sortOrder
        : Date.parse(task.createdAt ?? '') || 0;
  const getRaritySortValue = (task: Task) => RARITY_SORT_ORDER[task.rarity] ?? 0;
    const getCreatedSortValue = (task: Task) => Date.parse(task.createdAt ?? '') || 0;
    return [...uniqueTasks].sort((a, b) => {
      if (sortMode === 'rarity') {
        const rarityDelta = getRaritySortValue(b) - getRaritySortValue(a);
        if (rarityDelta !== 0) return rarityDelta;
      }
      if (sortMode === 'createdAt') {
        const createdDelta = getCreatedSortValue(b) - getCreatedSortValue(a);
        if (createdDelta !== 0) return createdDelta;
      }
      return getManualSortValue(b) - getManualSortValue(a);
    });
  }, [sortMode, uniqueTasks]);

  const rewardsById = useMemo(
    () => new Map(rewards.map((reward) => [reward.id, reward])),
    [rewards]
  );

  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );

  const pinnedRewards = useMemo(
    () =>
      pinnedRewardIds
        .map((rewardId) => rewardsById.get(rewardId))
        .filter((reward): reward is Reward => Boolean(reward)),
    [pinnedRewardIds, rewardsById]
  );

  const pendingTasks = useMemo(() => {
    return sortedTasks.filter((task) => (taskStatusById[task.id] ?? 'pending') === 'pending');
  }, [sortedTasks, taskStatusById]);

  const overdueTasks = useMemo(
    () => sortedTasks.filter((task) => (taskStatusById[task.id] ?? 'pending') === 'overdue'),
    [sortedTasks, taskStatusById]
  );

  const completedTasks = useMemo(() => {
    return sortedTasks.filter((task) => (taskStatusById[task.id] ?? 'pending') === 'completed');
  }, [sortedTasks, taskStatusById]);

  const missedTasks = useMemo(() => {
    return sortedTasks.filter((task) => (taskStatusById[task.id] ?? 'pending') === 'missed');
  }, [sortedTasks, taskStatusById]);

  const actionableTasks = useMemo(
    () =>
      sortedTasks.filter((task) => {
        const status = taskStatusById[task.id] ?? 'pending';
        return status === 'pending' || status === 'overdue';
      }),
    [sortedTasks, taskStatusById]
  );

  const surfacedTodayTaskIds = useMemo(() => {
    const now = new Date();
    return new Set(
      pendingTasks
        .filter((task) => shouldSurfaceTaskInToday(task, now))
        .map((task) => task.id)
    );
  }, [pendingTasks]);

  const surfacedDueSoonTaskIds = useMemo(() => {
    const now = new Date();
    return new Set(
      pendingTasks
        .filter((task) => !surfacedTodayTaskIds.has(task.id) && shouldSurfaceTaskDueSoon(task, now))
        .map((task) => task.id)
    );
  }, [pendingTasks, surfacedTodayTaskIds]);

  const dueSoonTasks = useMemo(() => {
    const now = new Date();
    return pendingTasks
      .filter((task) => surfacedDueSoonTaskIds.has(task.id))
      .sort((left, right) => {
        const leftDeadline = getNextDeadlineDate(left, now)?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightDeadline = getNextDeadlineDate(right, now)?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftDeadline - rightDeadline;
      });
  }, [pendingTasks, surfacedDueSoonTaskIds]);

  const todayTasks = useMemo(() => {
    const now = new Date();
    return pendingTasks.filter(
      (task) =>
        (task.bucket === 'today' || surfacedTodayTaskIds.has(task.id)) &&
        isTaskAllowedInTodayFlow(task, now)
    );
  }, [pendingTasks, surfacedTodayTaskIds]);

  const inboxTasks = useMemo(
    () =>
      pendingTasks.filter(
        (task) =>
          task.bucket === 'inbox' &&
          !surfacedTodayTaskIds.has(task.id) &&
          !surfacedDueSoonTaskIds.has(task.id)
      ),
    [pendingTasks, surfacedTodayTaskIds, surfacedDueSoonTaskIds]
  );

  const nextTasks = useMemo(
    () =>
      pendingTasks.filter(
        (task) =>
          task.bucket === 'next' &&
          !surfacedTodayTaskIds.has(task.id) &&
          !surfacedDueSoonTaskIds.has(task.id)
      ),
    [pendingTasks, surfacedTodayTaskIds, surfacedDueSoonTaskIds]
  );

  const backlogTasks = useMemo(
    () =>
      pendingTasks.filter(
        (task) =>
          task.bucket === 'backlog' &&
          !surfacedTodayTaskIds.has(task.id) &&
          !surfacedDueSoonTaskIds.has(task.id)
      ),
    [pendingTasks, surfacedTodayTaskIds, surfacedDueSoonTaskIds]
  );

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchActive = normalizedSearchQuery.length > 0;
  const filtersActive = filter !== 'all';
  const matchesTaskControls = (task: Task) => {
    if (filter !== 'all' && task.periodicity !== filter) return false;
    if (!searchActive) return true;
    const haystack = [
      task.title,
      task.comment ?? '',
      task.projectId ? projectsById.get(task.projectId)?.title ?? '' : '',
      ...(Array.isArray(task.skillTags) ? task.skillTags : [])
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalizedSearchQuery);
  };

  const visibleOverdueTasks = useMemo(
    () => overdueTasks.filter(matchesTaskControls),
    [overdueTasks, filter, normalizedSearchQuery]
  );

  const visibleTodayTasks = useMemo(
    () => todayTasks.filter(matchesTaskControls),
    [todayTasks, filter, normalizedSearchQuery]
  );

  const visibleDueSoonTasks = useMemo(
    () => dueSoonTasks.filter(matchesTaskControls),
    [dueSoonTasks, filter, normalizedSearchQuery]
  );

  const visibleInboxTasks = useMemo(
    () => inboxTasks.filter(matchesTaskControls),
    [inboxTasks, filter, normalizedSearchQuery]
  );

  const visibleNextTasks = useMemo(
    () => nextTasks.filter(matchesTaskControls),
    [nextTasks, filter, normalizedSearchQuery]
  );

  const visibleBacklogTasks = useMemo(
    () => backlogTasks.filter(matchesTaskControls),
    [backlogTasks, filter, normalizedSearchQuery]
  );

  const filteredMissedTasks = useMemo(
    () => missedTasks.filter(matchesTaskControls),
    [missedTasks, filter, normalizedSearchQuery]
  );

  const completedTodayEntries = useMemo<CompletedTodayEntry[]>(() => {
    const today = new Date();
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const latestTodayEventByTaskId = new Map<string, LedgerEvent>();

    for (const event of ledgerEvents) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const eventTime = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      const eventDate = new Date(eventTime);
      if (!isSameLocalDate(eventDate, today)) continue;

      const existing = latestTodayEventByTaskId.get(event.taskId);
      const existingTime = existing ? parseEventTimestamp(existing.createdAt) : NaN;
      if (!existing || Number.isNaN(existingTime) || existingTime < eventTime) {
        latestTodayEventByTaskId.set(event.taskId, event);
      }
    }

    return Array.from(latestTodayEventByTaskId.entries())
      .filter(([, event]) => !isUndoEvent(event) && isDoneEvent(event))
      .map(([taskId, event]) => {
        const task = taskById.get(taskId);
        if (!task) return null;
        const occurredAt = parseEventTimestamp(event.createdAt);
        return {
          task,
          occurredAt,
          completedAtLabel: formatTimeOfDay(event.createdAt) ?? '',
          xpDelta: Math.max(0, Math.trunc(event.deltaXp))
        };
      })
      .filter((entry): entry is CompletedTodayEntry => Boolean(entry))
      .sort((left, right) => right.occurredAt - left.occurredAt);
  }, [ledgerEvents, tasks]);

  const visibleCompletedTodayEntries = useMemo(
    () => completedTodayEntries.filter((entry) => matchesTaskControls(entry.task)),
    [completedTodayEntries, filter, normalizedSearchQuery]
  );

  const completedHistoryEntries = useMemo<CompletedHistoryEntry[]>(() => {
    const today = new Date();
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const latestByTaskPeriod = new Map<
      string,
      { task: Task; event: LedgerEvent; occurredAt: number; periodKey: string }
    >();

    for (const event of ledgerEvents) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const task = taskById.get(event.taskId);
      if (!task) continue;
      const occurredAt = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(occurredAt)) continue;
      const eventDate = new Date(occurredAt);
      const periodKey = getTaskPeriodKey(task, eventDate);
      const compositeKey = `${task.id}::${periodKey}`;
      const existing = latestByTaskPeriod.get(compositeKey);
      if (!existing || existing.occurredAt < occurredAt) {
        latestByTaskPeriod.set(compositeKey, { task, event, occurredAt, periodKey });
      }
    }

    return Array.from(latestByTaskPeriod.values())
      .filter(({ event, occurredAt }) => {
        if (isUndoEvent(event) || isMissedEvent(event)) return false;
        if (event.deltaXp <= 0) return false;
        return !isSameLocalDate(new Date(occurredAt), today);
      })
      .map(({ task, event, occurredAt, periodKey }) => ({
        task,
        eventId: event.id,
        periodKey,
        occurredAt,
        completedAtLabel: formatDeadline(event.createdAt) ?? '',
        xpDelta: Math.max(0, Math.trunc(event.deltaXp))
      }))
      .sort((left, right) => right.occurredAt - left.occurredAt);
  }, [ledgerEvents, tasks]);

  const filteredCompletedHistoryEntries = useMemo(
    () => completedHistoryEntries.filter((entry) => matchesTaskControls(entry.task)),
    [completedHistoryEntries, filter, normalizedSearchQuery]
  );

  const visibleCompletedHistoryEntries = useMemo(
    () => filteredCompletedHistoryEntries.slice(0, 100),
    [filteredCompletedHistoryEntries]
  );

  const quotaStatusByTaskId = useMemo(() => {
    const result = new Map<
      string,
      { done: number; count: number; percent: number; reached: boolean; per: 'week' | 'month' }
    >();
    const now = new Date();
    const weekStart = startOfLocalWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const monthStart = startOfLocalMonth(now);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
    const weekCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();
    for (const event of ledgerEvents) {
      if (event.kind !== 'task' || !event.taskId) continue;
      if (!isDoneEvent(event)) continue;
      const eventTime = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      if (eventTime >= weekStart.getTime() && eventTime < weekEnd.getTime()) {
        weekCounts.set(event.taskId, (weekCounts.get(event.taskId) ?? 0) + 1);
      }
      if (eventTime >= monthStart.getTime() && eventTime < monthEnd.getTime()) {
        monthCounts.set(event.taskId, (monthCounts.get(event.taskId) ?? 0) + 1);
      }
    }
    for (const task of tasks) {
      if (!task.quota) continue;
      const quotaCount = Math.max(1, Math.trunc(task.quota.count));
      const done =
        task.quota.per === 'week'
          ? weekCounts.get(task.id) ?? 0
          : monthCounts.get(task.id) ?? 0;
      const percent = clampPercent((done / quotaCount) * 100);
      result.set(task.id, {
        done,
        count: quotaCount,
        percent,
        reached: done >= quotaCount,
        per: task.quota.per
      });
    }
    return result;
  }, [ledgerEvents, tasks]);

  const dailyTaskStreakById = useMemo(() => {
    const result = new Map<string, StreakState>();
    const eventsByTaskId = new Map<string, LedgerEvent[]>();
    const referenceDate = new Date();

    for (const event of ledgerEvents) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const bucket = eventsByTaskId.get(event.taskId);
      if (bucket) {
        bucket.push(event);
      } else {
        eventsByTaskId.set(event.taskId, [event]);
      }
    }

    for (const task of tasks) {
      if (task.periodicity !== 'daily') continue;
      result.set(
        task.id,
        computeTaskDailyStreak(eventsByTaskId.get(task.id) ?? [], task.id, referenceDate)
      );
    }

    return result;
  }, [ledgerEvents, tasks]);

  const statsTodayCount = todayTasks.length;
  const statsDueSoonCount = dueSoonTasks.length;
  const statsOverdueCount = overdueTasks.length;
  const statsRemainingCount = statsTodayCount + statsDueSoonCount;
  const statsInboxCount = inboxTasks.length;
  const statsXpBalance = xp;
  const queueCounts: Record<TodayQueueTab, number> = {
    today: statsTodayCount + statsDueSoonCount,
    inbox: statsInboxCount,
    next: nextTasks.length,
    backlog: backlogTasks.length
  };
  const totalCurrentTasksCount = useMemo(
    () => completedTodayCount + actionableTasks.length,
    [actionableTasks.length, completedTodayCount]
  );
  const nextPreviewTasks = useMemo(() => visibleNextTasks.slice(0, 3), [visibleNextTasks]);
  const hasSearchOrFilters = searchActive || filtersActive;
  const isFirstUseEmpty =
    !loading &&
    tasks.length === 0 &&
    completedTasks.length === 0 &&
    missedTasks.length === 0;
  const isTodayDoneForNow =
    !loading &&
    !hasSearchOrFilters &&
    visibleOverdueTasks.length === 0 &&
    visibleDueSoonTasks.length === 0 &&
    visibleTodayTasks.length === 0 &&
    nextTasks.length > 0;
  const nextReward = useMemo(() => {
    const rewardPool = (pinnedRewards.length > 0 ? pinnedRewards : rewards).filter(
      (reward) => reward.cost > 0
    );
    if (rewardPool.length === 0) return null;
    const sortedRewards = [...rewardPool].sort((left, right) => left.cost - right.cost);
    return sortedRewards.find((reward) => reward.cost > xp) ?? sortedRewards[sortedRewards.length - 1];
  }, [pinnedRewards, rewards, xp]);

  useEffect(() => {
    if (!DEBUG_COUNTS) return;
    console.groupCollapsed('[TodayPage] UI counts');
    console.table({
      visibleToday_length: visibleTodayTasks.length,
      visibleDueSoon_length: visibleDueSoonTasks.length,
      doneCount: completedTodayCount,
      totalCount: totalCurrentTasksCount
    });
    console.log('Source', {
      visibleTasks: 'visibleOverdueTasks + visibleTodayTasks',
      doneCount: 'completedTodayCount (ledger events for today)',
      totalCount: 'completedTodayCount + actionableTasks.length'
    });
    console.log('Collections', {
      pendingTasks: pendingTasks.length,
      overdueTasks: overdueTasks.length,
      dueSoonTasks: dueSoonTasks.length,
      todayTasks: todayTasks.length,
      inboxTasks: inboxTasks.length,
      nextTasks: nextTasks.length,
      backlogTasks: backlogTasks.length,
      completedTasks: completedTasks.length,
      missedTasks: missedTasks.length,
      visibleOverdueTasks: visibleOverdueTasks.length,
      visibleDueSoonTasks: visibleDueSoonTasks.length,
      completedTodayEntries: completedTodayEntries.length,
      filteredMissedTasks: filteredMissedTasks.length,
      filter
    });
    console.groupEnd();
  }, [
    completedTodayCount,
    totalCurrentTasksCount,
    visibleTodayTasks.length,
    visibleDueSoonTasks.length,
    pendingTasks.length,
    overdueTasks.length,
    dueSoonTasks.length,
    todayTasks.length,
    inboxTasks.length,
    nextTasks.length,
    backlogTasks.length,
    completedTasks.length,
    missedTasks.length,
    visibleOverdueTasks.length,
    completedTodayEntries.length,
    filteredMissedTasks.length,
    filter
  ]);

  const logTask = async (task: Task, missed: boolean, occurredAt = Date.now()) => {
    setLoggingTaskId(task.id);
    try {
      const result = await logTaskEvent(task, missed ? 'TASK_MISSED' : 'TASK_DONE', occurredAt);
      await load();
      if (!missed) {
        setCompletionFeedback({
          id: result.projectBonus?.eventId ?? result.event.id,
          message: result.projectBonus
            ? 'Проект завершён'
            : `Сделано: ${task.title}`,
          xpDelta: result.projectBonus?.bonusXp ?? Math.max(0, result.event.deltaXp)
        });
        emitPetEvent({
          type: 'task-completed',
          taskTitle: task.title,
          xpDelta: result.projectBonus?.bonusXp ?? Math.max(0, result.event.deltaXp)
        });
      }
    } catch (error) {
      if (!missed) {
        emitPetEvent({ type: 'operation-failed' });
      }
      await showAppAlert(
        missed ? 'Не удалось отметить задачу как пропущенную.' : 'Не удалось завершить задачу.'
      );
      await load();
    } finally {
      setLoggingTaskId(null);
    }
  };

  const triggerTaskCompletion = (task: Task, origin?: { x: number; y: number }) => {
    if (pendingTaskCompletion || loggingTaskId) return;
    setPlanningTaskId(null);
    setPendingTaskCompletion({
      taskId: task.id
    });
    const xpDelta = Math.max(0, xpForTask(task));
    if (xpDelta > 0) {
      const fallbackOrigin = {
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
        y: typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.72) : 0
      };
      const nextFx: CompletionFloatFx = {
        id: `${task.id}-${Date.now()}`,
        xpDelta,
        originX: origin?.x ?? fallbackOrigin.x,
        originY: origin?.y ?? fallbackOrigin.y
      };
      setCompletionFloatFx(nextFx);
      if (completionFloatFxTimerRef.current !== null) {
        window.clearTimeout(completionFloatFxTimerRef.current);
      }
      completionFloatFxTimerRef.current = window.setTimeout(() => {
        setCompletionFloatFx((current) => (current?.id === nextFx.id ? null : current));
        completionFloatFxTimerRef.current = null;
      }, COMPLETION_FLOAT_FX_TIMEOUT_MS);
    }
    if (!prefersReducedMotion() && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(18);
    }
    const delayMs = prefersReducedMotion() ? 0 : COMPLETION_CARD_ANIMATION_MS;
    completionTimerRef.current = window.setTimeout(async () => {
      completionTimerRef.current = null;
      try {
        await logTask(task, false);
      } finally {
        setPendingTaskCompletion((current) => (current?.taskId === task.id ? null : current));
      }
    }, delayMs);
  };

  const openLogDateModal = (task: Task) => {
    setPlanningTaskId(null);
    setLogDateTask(task);
    setLogDateValue(toLocalInputValue(new Date()));
  };

  const confirmLogDate = async () => {
    if (!logDateTask) return;
    const occurredAt = parseLocalDateTime(logDateValue);
    if (!occurredAt) {
      await showAppAlert('Укажите корректную дату и время события.');
      return;
    }
    const task = logDateTask;
    await logTask(task, false, occurredAt.getTime());
    setLogDateTask(null);
  };

  const undoTask = async (task: Task) => {
    setLoggingTaskId(task.id);
    try {
      await logTaskEvent(task, 'TASK_UNDO', Date.now());
      await load();
    } catch (error) {
      await showAppAlert('Не удалось отменить выполнение задачи.');
      await load();
    } finally {
      setLoggingTaskId(null);
    }
  };

  const undoHistoryEntry = async (entry: CompletedHistoryEntry) => {
    const confirmed = await showAppConfirm({
      message: 'Убрать эту запись о выполнении из истории?',
      confirmLabel: 'Убрать',
      tone: 'danger'
    });
    if (!confirmed) return;
    setRemovingHistoryEventId(entry.eventId);
    try {
      await deleteEvent(entry.eventId);
      await load();
    } catch (error) {
      await showAppAlert('Не удалось убрать запись из истории.');
      await load();
    } finally {
      setRemovingHistoryEventId(null);
    }
  };

  const deleteTaskItem = async (task: Task) => {
    const confirmed = await showAppConfirm({
      message: `Удалить задачу "${task.title}"?`,
      confirmLabel: 'Удалить',
      tone: 'danger'
    });
    if (!confirmed) return;
    setDeletingTaskId(task.id);
    try {
      await deleteTask(task.id);
      try {
        await addEvent({
          id: generateId(),
          kind: 'adjustment',
          taskId: task.id,
          deltaXp: 0,
          createdAt: new Date().toISOString(),
          note: 'TASK_DELETE',
          meta: { eventType: 'TASK_DELETE', refId: task.id, title: task.title }
        });
      } catch (error) {
        await showAppAlert('Task deleted, but failed to add a ledger record.');
      }
      await load();
    } catch (error) {
      await showAppAlert('Failed to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const updateTaskProgress = async (task: Task, value: number) => {
    const normalized = normalizeProgressValue(value);
    const current = normalizeProgressValue(task.progressValue ?? 0);
    if (normalized === current) return;
    const nextTask = { ...task, progressEnabled: true, progressValue: normalized };
    setTasks((prev) => prev.map((item) => (item.id === task.id ? nextTask : item)));
    try {
      await updateTask(nextTask);
    } catch (error) {
      await showAppAlert('Failed to update progress.');
      await load();
    }
  };

  const toggleChecklistItem = async (task: Task, itemId: string) => {
    const checklist = Array.isArray(task.checklist) ? task.checklist : [];
    const target = checklist.find((item) => item.id === itemId);
    if (!target) return;
    const nextChecklist = checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    const nextTask = { ...task, checklist: nextChecklist };
    setTasks((prev) => prev.map((item) => (item.id === task.id ? nextTask : item)));
    try {
      await updateTask(nextTask);
    } catch (error) {
      await showAppAlert('Failed to update checklist.');
      await load();
    }
  };

  const downloadCalendar = (task: Task, due: Date) => {
    const uid = generateId();
    const summary = escapeIcsText(task.title);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TaskMan//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${toIcsUtc(new Date())}`,
      `DTSTART:${toIcsLocal(due)}`,
      `SUMMARY:${summary}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT30M',
      'ACTION:DISPLAY',
      `DESCRIPTION:${summary}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    const ics = `${lines.join('\r\n')}\r\n`;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${toSafeFileName(task.title)}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const addToCalendar = (task: Task) => {
    setCalendarTask(task);
    setCalendarValue(toLocalInputValue(new Date()));
  };

  const confirmCalendar = () => {
    if (!calendarTask) return;
    const due = parseLocalDateTime(calendarValue);
    if (!due) {
      void showAppAlert('Invalid date/time.');
      return;
    }
    downloadCalendar(calendarTask, due);
    setCalendarTask(null);
  };

  const canUseManualReorder = sortMode === 'manual' && !hasSearchOrFilters;

  const reorderTasksInScope = async (
    scopeTasks: Task[],
    sourceId: string,
    targetId: string,
    nextSourceBucket?: TaskBucket
  ) => {
    const sourceIndex = scopeTasks.findIndex((task) => task.id === sourceId);
    const targetIndex = scopeTasks.findIndex((task) => task.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    if (sourceIndex === targetIndex) return;

    const reordered = [...scopeTasks];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const maxSortValue = reordered.reduce((maxValue, task) => {
      const taskSortValue =
        typeof task.sortOrder === 'number' ? task.sortOrder : Date.parse(task.createdAt ?? '') || 0;
      return Math.max(maxValue, taskSortValue);
    }, Date.now());
    const base = maxSortValue + reordered.length;
    const reorderedWithSort = reordered.map((task, index) => ({
      ...task,
      bucket:
        task.id === sourceId && nextSourceBucket && task.bucket !== nextSourceBucket
          ? nextSourceBucket
          : task.bucket,
      sortOrder: base - index
    }));
    const updatedMap = new Map(reorderedWithSort.map((task) => [task.id, task]));

    setTasks((prev) => prev.map((task) => updatedMap.get(task.id) ?? task));
    setDraggingTaskId(null);
    setDragOverTaskId(null);

    try {
      await Promise.all(reorderedWithSort.map((task) => updateTask(task)));
      await load();
    } catch (error) {
      await showAppAlert('Failed to reorder tasks.');
      await load();
    }
  };

  const handleDragStart = (event: DragEvent<HTMLElement>, taskId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (
    scopeTasks: Task[],
    event: DragEvent<HTMLDivElement>,
    taskId: string
  ) => {
    if (!draggingTaskId) return;
    if (draggingTaskId === taskId) return;
    if (!scopeTasks.some((task) => task.id === taskId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverTaskId(taskId);
  };

  const handleDrop = async (
    scopeTasks: Task[],
    event: DragEvent<HTMLDivElement>,
    taskId: string,
    nextSourceBucket?: TaskBucket
  ) => {
    event.preventDefault();
    const sourceId = draggingTaskId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === taskId) {
      setDragOverTaskId(null);
      return;
    }
    await reorderTasksInScope(scopeTasks, sourceId, taskId, nextSourceBucket);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };

  const editTask = (task: Task) => {
    setEditingTask(task);
  };

  const isTaskExpanded = (task: Task) => {
    const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
    return hasChecklist ? Boolean(expandedChecklistIds[task.id]) : expandedTaskId === task.id;
  };

  const setTaskExpanded = (task: Task, expanded: boolean) => {
    const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
    if (hasChecklist) {
      setExpandedChecklistIds((prev) => ({
        ...prev,
        [task.id]: expanded
      }));
      return;
    }
    setExpandedTaskId(expanded ? task.id : null);
  };

  const openQueueTab = (queue: TodayQueueTab) => {
    setActiveQueue(queue);
  };

  const openTaskPlanning = (task: Task) => {
    setPlanningTaskId((prev) => (prev === task.id ? null : task.id));
    setTaskExpanded(task, true);
  };

  const toggleTaskDetails = (task: Task) => {
    setPlanningTaskId((prev) => (prev === task.id ? null : prev));
    const nextExpanded = !isTaskExpanded(task);
    setTaskExpanded(task, nextExpanded);
  };

  const moveTaskToBucket = async (task: Task, bucket: TaskBucket) => {
    if (task.bucket === bucket) {
      setPlanningTaskId(null);
      return;
    }
    const nextTask = { ...task, bucket };
    setTasks((prev) => prev.map((item) => (item.id === task.id ? nextTask : item)));
    setPlanningTaskId(null);
    try {
      await updateTask(nextTask);
    } catch (error) {
      await showAppAlert('Не удалось перенести задачу.');
      await load();
    }
  };

  const toggleExpandedTask = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const reorderableTodayTasks = useMemo(() => visibleTodayTasks, [visibleTodayTasks]);

  const reorderableQueueTasks = useMemo(() => {
    if (activeQueue === 'inbox') return visibleInboxTasks;
    if (activeQueue === 'next') return visibleNextTasks;
    if (activeQueue === 'backlog') return visibleBacklogTasks;
    return [];
  }, [activeQueue, visibleInboxTasks, visibleNextTasks, visibleBacklogTasks]);

  const renderExecutionCard = (
    task: Task,
    queue: TodayQueueTab,
    overdue = false
  ) => {
    const reorderScopeTasks =
      queue === 'today' ? reorderableTodayTasks : activeQueue === queue ? reorderableQueueTasks : [];
    const sourceReorderBucket = queue === 'today' ? 'today' : undefined;
    const dragEnabled =
      canUseManualReorder &&
      !overdue &&
      reorderScopeTasks.length > 1 &&
      reorderScopeTasks.some((scopeTask) => scopeTask.id === task.id);

    return (
      <ExecutionTaskCard
        key={`${queue}-${task.id}`}
        task={task}
        queue={queue}
        projectLabel={task.projectId ? projectsById.get(task.projectId)?.title : undefined}
        overdue={overdue}
        streak={dailyTaskStreakById.get(task.id)}
        expanded={isTaskExpanded(task)}
        planning={planningTaskId === task.id}
        completing={pendingTaskCompletion?.taskId === task.id}
        quotaStatus={quotaStatusByTaskId.get(task.id)}
        busy={
          loggingTaskId === task.id ||
          deletingTaskId === task.id ||
          pendingTaskCompletion?.taskId === task.id
        }
        deleting={deletingTaskId === task.id}
        onComplete={(nextTask, origin) => {
          triggerTaskCompletion(nextTask, origin);
        }}
        onPlan={openTaskPlanning}
        onToggleDetails={toggleTaskDetails}
        onMoveToBucket={(nextTask, bucket) => {
          void moveTaskToBucket(nextTask, bucket);
        }}
        onEdit={editTask}
        onDelete={(nextTask) => {
          void deleteTaskItem(nextTask);
        }}
        onSkip={(nextTask) => {
          setPlanningTaskId(null);
          void logTask(nextTask, true);
        }}
        onLogAtDate={openLogDateModal}
        onAddToCalendar={addToCalendar}
        onProgressChange={(nextTask, value) => {
          void updateTaskProgress(nextTask, value);
        }}
        onChecklistItemToggle={(nextTask, itemId) => {
          void toggleChecklistItem(nextTask, itemId);
        }}
        onDragStart={handleDragStart}
        onDragOver={(event, taskId) => {
          handleDragOver(reorderScopeTasks, event, taskId);
        }}
        onDrop={(event, taskId) => {
          void handleDrop(reorderScopeTasks, event, taskId, sourceReorderBucket);
        }}
        onDragEnd={handleDragEnd}
        dragEnabled={dragEnabled}
        dragging={draggingTaskId === task.id}
        dragOver={dragOverTaskId === task.id && draggingTaskId !== task.id}
      />
    );
  };

  const queueTabsSection = (
    <section className="tm-queue-tabs" aria-label={copy.queueAria}>
      {TODAY_QUEUE_TABS.map((queue) => (
        <button
          key={queue}
          type="button"
          onClick={() => openQueueTab(queue)}
          className={`tm-queue-tab ${activeQueue === queue ? 'tm-queue-tab-active' : ''}`}
          aria-pressed={activeQueue === queue}
        >
          <span>{copy.queueLabels[queue]}</span>
          <span className="tm-queue-tab-count">{queueCounts[queue]}</span>
        </button>
      ))}
    </section>
  );

  const todayLoopTotalCount = completedTodayCount + statsRemainingCount + statsOverdueCount;
  const completedTodaySection =
    activeQueue === 'today' ? (
      <CompletedTodaySection
        entries={visibleCompletedTodayEntries}
        historyEntries={visibleCompletedHistoryEntries}
        historyTotalCount={filteredCompletedHistoryEntries.length}
        totalCount={completedTodayCount}
        expanded={showCompletedToday}
        historyExpanded={showCompletedHistory}
        onToggle={() => setShowCompletedToday((prev) => !prev)}
        onToggleHistory={() => setShowCompletedHistory((prev) => !prev)}
        onUndo={(task) => {
          void undoTask(task);
        }}
        onUndoHistory={(entry) => {
          void undoHistoryEntry(entry);
        }}
        busyTaskId={loggingTaskId}
        busyHistoryEventId={removingHistoryEventId}
        taskStreakById={dailyTaskStreakById}
        emptyStateText={
          hasSearchOrFilters
            ? copy.noCompletedByFilter
            : copy.noCompletedToday
        }
      />
    ) : null;

  const currentQueueTasks =
    activeQueue === 'inbox'
      ? visibleInboxTasks
      : activeQueue === 'next'
      ? visibleNextTasks
      : visibleBacklogTasks;

  const systemTaskTotalCount = actionableTasks.length;
  const secondaryQueueSummary = `${copy.dueSoon} ${statsDueSoonCount} · ${copy.total} ${systemTaskTotalCount} · ${copy.queueSystemLabels.inbox} ${statsInboxCount} · ${copy.queueSystemLabels.next} ${nextTasks.length} · ${copy.queueSystemLabels.backlog} ${backlogTasks.length}`;

  const topSummarySection = (
    <section
      key={`summary-${completionFeedback?.id ?? 'idle'}`}
      className="tm-today-summary-layout"
    >
      <section className={`tm-panel-soft tm-summary-panel tm-today-day-card ${completionFeedback ? 'tm-summary-panel-active' : ''}`}>
        <div className="tm-today-summary-header">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tm-title">{copy.dayTitle}</h2>
          </div>
        </div>
        <TodayDayProgressBar
          completed={completedTodayCount}
          total={todayLoopTotalCount}
          remaining={statsRemainingCount}
          overdue={statsOverdueCount}
          labels={copy.dayProgress}
        />
        <div className="tm-today-mini-metrics">
          <div className="tm-today-mini-metric tm-today-mini-metric-done">
            <p className="tm-today-mini-label">{copy.done}</p>
            <p className="tm-today-mini-value">{completedTodayCount}</p>
          </div>
          <div className="tm-today-mini-metric">
            <p className="tm-today-mini-label">{copy.remaining}</p>
            <p className="tm-today-mini-value">{statsRemainingCount}</p>
          </div>
          <div className={`tm-today-mini-metric ${statsOverdueCount > 0 ? 'tm-today-mini-metric-overdue' : ''}`}>
            <p className="tm-today-mini-label">{copy.overdue}</p>
            <p className="tm-today-mini-value">{statsOverdueCount}</p>
          </div>
        </div>
        <p className="tm-today-secondary-line">{secondaryQueueSummary}</p>
      </section>
      <TodayRewardStrip
        xp={statsXpBalance}
        nextReward={nextReward}
        highlighted={Boolean(completionFeedback)}
      />
    </section>
  );

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 pt-1 pb-1">
        <div className="tm-frame tm-reveal space-y-4 px-2 pt-1 pb-2">
          {topSummarySection}

          <section className="tm-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative z-40 self-start" ref={sortMenuRef}>
                <button
                  onClick={() => setSortOpen((prev) => !prev)}
                  className="tm-button tm-button-ghost"
                  aria-haspopup="true"
                  aria-expanded={sortOpen}
                >
                  {copy.filters}
                </button>
                {sortOpen ? (
                  <div className="absolute left-0 top-full mt-2 tm-panel p-3 z-50 w-72 max-w-[calc(100vw-2.5rem)] space-y-3 sm:left-auto sm:right-0">
                    <div className="space-y-2">
                      <label htmlFor="task-search" className="text-xs tm-label">
                        {copy.search}
                      </label>
                      <input
                        id="task-search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="tm-input text-sm"
                        placeholder={copy.searchPlaceholder}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="task-sort" className="text-xs tm-label">
                        {copy.sort}
                      </label>
                      <select
                        id="task-sort"
                        value={sortMode}
                        onChange={(event) => setSortMode(event.target.value as TaskSort)}
                        className="tm-select text-sm"
                      >
                        {TASK_SORTS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {copy.sortLabels[option.value]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="task-filter" className="text-xs tm-label">
                        {copy.periodicity}
                      </label>
                      <select
                        id="task-filter"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as TaskFilter)}
                        className="tm-select text-sm"
                      >
                        {TASK_FILTERS.map((queueFilter) => (
                          <option key={queueFilter} value={queueFilter}>
                            {queueFilter === 'all' ? copy.allFilter : copy.periodicityLabels[queueFilter]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="tm-button tm-button-primary ml-auto"
              >
                {copy.addTask}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {searchActive ? (
                <span className="tm-pill tm-chip tm-chip-muted">{copy.searchPill(searchQuery.trim())}</span>
              ) : null}
              {filtersActive ? (
                <span className="tm-pill tm-chip tm-chip-muted">{copy.filterPill(copy.periodicityLabels[filter])}</span>
              ) : null}
              {hasSearchOrFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilter('all');
                  }}
                  className="tm-button tm-button-ghost tm-button-sm"
                >
                  {copy.reset}
                </button>
              ) : null}
            </div>
          </section>

          {queueTabsSection}

          {loading ? (
            <section className="tm-panel p-4">
              <p className="text-amber-200/80">{copy.loading}</p>
            </section>
          ) : isFirstUseEmpty ? (
            <>
              <section className="tm-panel p-4">
                <TaskEmptyState
                  title={copy.activeEmptyTitle}
                  text={copy.activeEmptyText}
                />
              </section>
            </>
          ) : activeQueue === 'today' ? (
            <>
              <section className="space-y-4">
                {hasSearchOrFilters &&
                visibleOverdueTasks.length === 0 &&
                visibleDueSoonTasks.length === 0 &&
                visibleTodayTasks.length === 0 &&
                nextPreviewTasks.length === 0 &&
                visibleCompletedTodayEntries.length === 0 ? (
                  <TaskEmptyState
                    title={copy.noResultsTitle}
                    text={copy.noResultsText}
                  />
                ) : (
                  <>
                    {visibleOverdueTasks.length > 0 ? (
                      <QueueSection title={copy.overdue} count={visibleOverdueTasks.length} toneClassName="text-rose-200">
                        <div className="tm-task-list-grid">
                          {visibleOverdueTasks.map((task) => renderExecutionCard(task, 'today', true))}
                        </div>
                      </QueueSection>
                    ) : null}

                    {visibleDueSoonTasks.length > 0 ? (
                      <QueueSection title={copy.dueSoonTitle} count={visibleDueSoonTasks.length}>
                        <div className="tm-task-list-grid">
                          {visibleDueSoonTasks.map((task) => renderExecutionCard(task, 'today'))}
                        </div>
                      </QueueSection>
                    ) : null}

                    {visibleTodayTasks.length > 0 ? (
                      <QueueSection title={copy.todayTitle} count={visibleTodayTasks.length}>
                        <div className="tm-task-list-grid">
                          {visibleTodayTasks.map((task) => renderExecutionCard(task, 'today'))}
                        </div>
                      </QueueSection>
                    ) : isTodayDoneForNow ? (
                      <TaskEmptyState
                        title={copy.todayDoneTitle}
                        text={copy.todayDoneText}
                      />
                    ) : !hasSearchOrFilters ? (
                      <TaskEmptyState
                        title={copy.activeEmptyTitle}
                        text={copy.activeEmptyText}
                      />
                    ) : null}

                    <section className="tm-panel p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tm-title">{copy.nextPreviewTitle}</h3>
                          <p className="text-sm text-amber-200/70">{copy.nextPreviewSubtitle}</p>
                        </div>
                        <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{nextTasks.length}</span>
                      </div>
                      {nextPreviewTasks.length > 0 ? (
                        <div className="space-y-2">
                          {nextPreviewTasks.map((task) => (
                            <div key={`next-preview-${task.id}`} className="tm-card px-4 py-3 space-y-1">
                              <p className={`tm-task-title ${getTaskValueToneClass(getTaskValue(task))} text-base`}>
                                {task.title}
                              </p>
                              <p className="text-xs text-amber-200/70">
                                {(() => {
                                  const nextDeadlineLabel = formatDeadline(getNextDeadlineDate(task));
                                  return nextDeadlineLabel
                                    ? `${copy.periodicityLabels[task.periodicity]} · ${nextDeadlineLabel}`
                                    : copy.periodicityLabels[task.periodicity];
                                })()}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <TaskEmptyState
                          title={copy.nextEmptyTitle}
                          text={copy.nextEmptyText}
                        />
                      )}
                      <button type="button" onClick={() => openQueueTab('next')} className="tm-button tm-button-ghost tm-button-sm w-full">
                        {copy.openNext}
                      </button>
                    </section>

                    {completedTodaySection}
                  </>
                )}
              </section>
            </>
          ) : (
            <section className="tm-panel p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tm-title">{copy.queueLabels[activeQueue]}</h2>
                  <p className="text-sm text-amber-200/70">
                    {copy.queueDescriptions[activeQueue]}
                  </p>
                </div>
                <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{queueCounts[activeQueue]}</span>
              </div>

              {currentQueueTasks.length > 0 ? (
                <div className="tm-task-list-grid">
                  {currentQueueTasks.map((task) => renderExecutionCard(task, activeQueue))}
                </div>
              ) : hasSearchOrFilters ? (
                <TaskEmptyState
                  title={copy.noResultsTitle}
                  text={copy.noResultsText}
                />
              ) : activeQueue === 'inbox' ? (
                <TaskEmptyState
                  title={copy.inboxEmptyTitle}
                  text={copy.inboxEmptyText}
                />
              ) : activeQueue === 'backlog' ? (
                <TaskEmptyState
                  title={copy.backlogEmptyTitle}
                  text={copy.backlogEmptyText}
                />
              ) : (
                <TaskEmptyState
                  title={copy.nextEmptyTitle}
                  text={copy.nextQueueEmptyText}
                />
              )}
            </section>
          )}
        </div>
      </div>
      {completionFloatFx ? <TaskCompletionFloatFx key={completionFloatFx.id} fx={completionFloatFx} /> : null}
      {completionFeedback ? <CompletionFeedbackToast key={completionFeedback.id} feedback={completionFeedback} /> : null}

      <AddTaskModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={load}
        skillOptions={skillOptions}
        projects={projects}
      />
      <CalendarModal
        open={calendarTask !== null}
        task={calendarTask}
        value={calendarValue}
        onChange={setCalendarValue}
        onCancel={() => setCalendarTask(null)}
        onConfirm={confirmCalendar}
      />
      <LogDateModal
        open={logDateTask !== null}
        task={logDateTask}
        value={logDateValue}
        busy={logDateTask ? loggingTaskId === logDateTask.id : false}
        onChange={setLogDateValue}
        onCancel={() => setLogDateTask(null)}
        onConfirm={() => {
          void confirmLogDate();
        }}
      />
      <EditTaskModal
        open={editingTask !== null}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={load}
        skillOptions={skillOptions}
        projects={projects}
      />
    </div>
  );
}
