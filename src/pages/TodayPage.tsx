import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Task, Periodicity, Rarity, TaskChecklistItem } from '../entities/task/types';
import { Reward } from '../entities/reward/types';
import { createTask, deleteTask, listTasks, updateTask } from '../services/tasksService';
import { getXpBalance } from '../services/xpService';
import { addEvent, listEvents } from '../db/repositories/ledgerRepo';
import { getAppMetaValue } from '../db/repositories/appMetaRepo';
import { db } from '../db';
import { xpForTask } from '../logic/xp';
import { LedgerEvent } from '../entities/ledger/types';

type TaskFilter = 'all' | Periodicity;
type TaskSort = 'manual' | 'rarity' | 'createdAt';
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

const PERIODICITY_LABELS: Record<Periodicity, string> = {
  daily: 'Ежедневно',
  weekly: 'Раз в неделю',
  'one-time': 'Разово',
  monthly: 'Раз в месяц',
  yearly: 'Раз в год'
};

const TASK_FILTERS: TaskFilter[] = ['all', 'daily', 'weekly', 'monthly', 'yearly', 'one-time'];
const TASK_SORTS: Array<{ value: TaskSort; label: string }> = [
  { value: 'manual', label: 'Ручная' },
  { value: 'rarity', label: 'По редкости' },
  { value: 'createdAt', label: 'По времени создания' }
];
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
const COMPLETED_TASKS_PAGE_SIZE = 100;
const DEBUG_COUNTS = false;

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

const getNextDeadlineDate = (task: Task, now = new Date()) => {
  const anchor = parseIsoDate(task.deadline);
  if (!anchor) return null;
  if (task.periodicity === 'one-time') return anchor;
  if (now.getTime() < anchor.getTime()) return anchor;

  if (task.periodicity === 'daily') {
    const candidate = buildDateWithTime(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      anchor
    );
    if (candidate.getTime() < now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }
    return candidate;
  }

  if (task.periodicity === 'weekly') {
    const candidate = buildDateWithTime(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      anchor
    );
    const dayOffset = (anchor.getDay() - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + dayOffset);
    if (candidate.getTime() < now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  if (task.periodicity === 'monthly') {
    const candidate = buildDateWithTime(
      now.getFullYear(),
      now.getMonth(),
      anchor.getDate(),
      anchor
    );
    if (candidate.getTime() >= now.getTime()) return candidate;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return buildDateWithTime(
      nextMonth.getFullYear(),
      nextMonth.getMonth(),
      anchor.getDate(),
      anchor
    );
  }

  if (task.periodicity === 'yearly') {
    const candidate = buildDateWithTime(
      now.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      anchor
    );
    if (candidate.getTime() >= now.getTime()) return candidate;
    return buildDateWithTime(
      now.getFullYear() + 1,
      anchor.getMonth(),
      anchor.getDate(),
      anchor
    );
  }

  return anchor;
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

function TaskProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const normalizedValue = normalizeProgressValue(value);
  return (
    <div
      className={`tm-progress w-full ${muted ? 'tm-progress-muted' : ''}`}
      role="progressbar"
      aria-valuenow={normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="tm-progress-fill" style={{ width: `${normalizedValue}%` }} />
      <span className="tm-progress-value">{normalizedValue}%</span>
    </div>
  );
}

function ChecklistProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const percent = clampPercent(value);
  return (
    <div
      className={`tm-progress w-full ${muted ? 'tm-progress-muted' : ''}`}
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="tm-progress-fill" style={{ width: `${percent}%` }} />
      <span className="tm-progress-value">{Math.round(percent)}%</span>
    </div>
  );
}

function RewardProgressBar({ value }: { value: number }) {
  const normalizedValue = clampPercent(value);
  return (
    <div
      className="tm-progress w-full"
      role="progressbar"
      aria-valuenow={normalizedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="tm-progress-fill" style={{ width: `${normalizedValue}%` }} />
      <span className="tm-progress-value">{Math.round(normalizedValue)}%</span>
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

const normalizeSkillTags = (value: string) => {
  const tags = value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  const uniqueTags = Array.from(new Set(tags));
  return uniqueTags.slice(0, 8);
};

const generateChecklistItemId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const CHECKLIST_PREFIX_PATTERN = /^\s*(?:-|\d+\.)\s*/;

const parseChecklistInput = (value: string): TaskChecklistItem[] => {
  const lines = value.split(/\r?\n/);
  const items: TaskChecklistItem[] = [];
  for (const line of lines) {
    const text = line.trim().replace(CHECKLIST_PREFIX_PATTERN, '').trim();
    if (!text) continue;
    items.push({
      id: generateChecklistItemId(),
      text,
      done: false,
      order: items.length
    });
  }
  return items;
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
  skillOptions
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
  skillOptions: string[];
}) {
  const [title, setTitle] = useState('');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [periodicity, setPeriodicity] = useState<Periodicity>('one-time');
  const [quotaCount, setQuotaCount] = useState('');
  const [quotaPer, setQuotaPer] = useState<'week' | 'month'>('week');
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');
  const [checklistInput, setChecklistInput] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [reminderInput, setReminderInput] = useState('');
  const [progressEnabled, setProgressEnabled] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [skillTagsInput, setSkillTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setRarity('common');
      setPeriodicity('one-time');
      setQuotaCount('');
      setQuotaPer('week');
      setValue(5);
      setComment('');
      setChecklistInput('');
      setDeadlineInput('');
      setReminderInput('');
      setProgressEnabled(false);
      setProgressValue(0);
      setSkillTagsInput('');
      setSaving(false);
      savingRef.current = false;
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    const trimmedTitle = title.trim().slice(0, MAX_TASK_TITLE_LENGTH);
    if (!trimmedTitle) return;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const xpOverride = Math.min(10, Math.max(1, value));
      const commentValue = comment.trim();
      const checklistItems = parseChecklistInput(checklistInput);
      const skillTags = normalizeSkillTags(skillTagsInput);
      const normalizedProgress = normalizeProgressValue(progressValue);
      const deadlineDate = parseLocalDateTime(deadlineInput.trim());
      const deadline = deadlineDate ? deadlineDate.toISOString() : undefined;
      const reminderRaw = reminderInput.trim();
      const reminderMinutes = reminderRaw === '' ? null : Number(reminderRaw);
      const reminder =
        deadline && reminderMinutes !== null && Number.isFinite(reminderMinutes) && reminderMinutes >= 0
          ? { offsetMinutes: Math.trunc(reminderMinutes) }
          : undefined;
      const quotaCountValue = Number(quotaCount);
      const quota =
        Number.isFinite(quotaCountValue) && quotaCountValue > 0
          ? { count: Math.trunc(quotaCountValue), per: quotaPer }
          : undefined;
      await createTask({
        title: trimmedTitle,
        rarity,
        periodicity,
        quota,
        xpOverride,
        deadline,
        reminder,
        comment: commentValue ? commentValue : undefined,
        checklist: checklistItems.length ? checklistItems : undefined,
        skillTags: skillTags.length ? skillTags : undefined,
        progressEnabled,
        progressValue: progressEnabled ? normalizedProgress : undefined
      } as unknown as Parameters<typeof createTask>[0]);
      await onCreated();
      onClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-xl font-semibold tm-title mb-4">Новая задача</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm tm-label mb-1">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TASK_TITLE_LENGTH))}
              className="tm-input"
              maxLength={MAX_TASK_TITLE_LENGTH}
              placeholder="Например: Сделать тренировку"
            />
          </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm tm-label mb-1">Редкость</label>
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
                className="tm-select"
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
            <div className="flex-1">
            <label className="block text-sm tm-label mb-1">Периодичность</label>
            <select
              value={periodicity}
              onChange={(e) => setPeriodicity(e.target.value as Periodicity)}
              className="tm-select"
            >
              <option value="daily">Ежедневно</option>
              <option value="weekly">Раз в неделю</option>
              <option value="monthly">Раз в месяц</option>
              <option value="yearly">Раз в год</option>
              <option value="one-time">Разово</option>
            </select>
          </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Квота</label>
              <input
                type="number"
                min={1}
                step={1}
                value={quotaCount}
                onChange={(event) => setQuotaCount(event.target.value)}
                className="tm-input"
                placeholder="Например: 3"
              />
              <p className="text-xs text-amber-200/70 mt-1">Оставьте пустым, если не нужна.</p>
            </div>
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Период</label>
              <select
                value={quotaPer}
                onChange={(event) => setQuotaPer(event.target.value as 'week' | 'month')}
                className="tm-select"
              >
                <option value="week">Неделя</option>
                <option value="month">Месяц</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm tm-label">Ценность</label>
              <span className="text-sm text-amber-100">{value}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
              className="tm-range"
            />
            <div className="flex justify-between text-xs text-amber-200/70 mt-1">
              <span>1</span>
              <span>10</span>
            </div>
          </div>
          <div>
            <label className="block text-sm tm-label mb-1">Комментарий</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="tm-input"
              rows={3}
              placeholder="Например: детали, на что обратить внимание"
            />
          </div>
          <div>
            <label className="block text-sm tm-label mb-1">
              Checklist (one item per line; supports '-' or '1.' prefixes)
            </label>
            <textarea
              value={checklistInput}
              onChange={(event) => setChecklistInput(event.target.value)}
              className="tm-input"
              rows={4}
              disabled={saving}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="tm-button tm-button-ghost"
              disabled={saving}
            >
              Отмена
            </button>
            <button
              onClick={submit}
              className="tm-button tm-button-primary"
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Дедлайн</label>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(event) => setDeadlineInput(event.target.value)}
                className="tm-input"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Напоминание (мин. до)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={reminderInput}
                onChange={(event) => setReminderInput(event.target.value)}
                className="tm-input"
                placeholder="Например: 60"
              />
              <p className="text-xs text-amber-200/70">
                Работает при указанном дедлайне.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm tm-label">
              <input
                type="checkbox"
                checked={progressEnabled}
                onChange={(event) => setProgressEnabled(event.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Прогресс
            </label>
            {progressEnabled ? (
              <TaskProgressControls
                value={progressValue}
                onChange={setProgressValue}
                disabled={saving}
                showLabel={false}
              />
            ) : null}
          </div>
          <div>
            <SkillTagsInput
              value={skillTagsInput}
              onChange={setSkillTagsInput}
              suggestions={skillOptions}
              disabled={saving}
              placeholder="Например: Готовка, Excel"
            />
          </div>
        </div>
      </div>
    </div>
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
  if (!open || !task) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-xl font-semibold tm-title mb-2">Add to Calendar</h2>
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
              onClick={onCancel}
              className="tm-button tm-button-ghost"
            >
              Cancel
            </button>
            <button
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

function EditXpModal({
  open,
  value,
  onChange,
  onCancel,
  onSave,
  saving
}: {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-y-auto">
        <h2 className="text-xl font-semibold tm-title mb-4">Edit XP balance</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm tm-label mb-1">XP balance</label>
            <input
              type="number"
              step={1}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="tm-input"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onCancel}
              className="tm-button tm-button-ghost"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="tm-button tm-button-gold"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
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
  skillOptions
}: {
  open: boolean;
  task: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  skillOptions: string[];
}) {
  const [title, setTitle] = useState('');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');
  const [checklistDraft, setChecklistDraft] = useState<TaskChecklistItem[]>([]);
  const [checklistAddInput, setChecklistAddInput] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [reminderInput, setReminderInput] = useState('');
  const [progressEnabled, setProgressEnabled] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [skillTagsInput, setSkillTagsInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && task) {
      setTitle(task.title);
      setRarity(task.rarity);
      setValue(
        Math.min(10, Math.max(1, typeof task.xpOverride === 'number' ? task.xpOverride : 5))
      );
      setComment(task.comment ?? '');
      const sortedChecklist = Array.isArray(task.checklist)
        ? [...task.checklist].sort((a, b) => a.order - b.order)
        : [];
      setChecklistDraft(
        sortedChecklist.map((item, index) => ({
          ...item,
          order: index
        }))
      );
      setChecklistAddInput('');
      const deadlineDate = parseIsoDate(task.deadline);
      setDeadlineInput(deadlineDate ? toLocalInputValue(deadlineDate) : '');
      setReminderInput(
        typeof task.reminder?.offsetMinutes === 'number'
          ? String(task.reminder.offsetMinutes)
          : ''
      );
      setProgressEnabled(Boolean(task.progressEnabled));
      setProgressValue(normalizeProgressValue(task.progressValue ?? 0));
      setSkillTagsInput(task.skillTags?.join(', ') ?? '');
      setSaving(false);
    }
  }, [open, task]);

  if (!open || !task) return null;

  const addChecklistItems = () => {
    const parsed = parseChecklistInput(checklistAddInput);
    if (parsed.length === 0) return;
    setChecklistDraft((prev) => {
      const merged = [...prev, ...parsed];
      return merged.map((item, index) => ({ ...item, order: index }));
    });
    setChecklistAddInput('');
  };

  const updateChecklistItemText = (itemId: string, text: string) => {
    setChecklistDraft((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, text } : item))
    );
  };

  const toggleChecklistItemDone = (itemId: string) => {
    setChecklistDraft((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item))
    );
  };

  const removeChecklistItem = (itemId: string) => {
    setChecklistDraft((prev) =>
      prev
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, order: index }))
    );
  };

  const normalizeChecklistDraft = (items: TaskChecklistItem[]) =>
    items
      .map((item) => ({ ...item, text: item.text.trim() }))
      .filter((item) => item.text.length > 0)
      .map((item, index) => ({ ...item, order: index }));

  const submit = async () => {
    const trimmedTitle = title.trim().slice(0, MAX_TASK_TITLE_LENGTH);
    if (!trimmedTitle) return;
    setSaving(true);
    const xpOverride = Math.min(10, Math.max(1, value));
    const commentValue = comment.trim();
    const pendingChecklist = parseChecklistInput(checklistAddInput);
    const normalizedChecklist = normalizeChecklistDraft([
      ...checklistDraft,
      ...pendingChecklist
    ]);
    const skillTags = normalizeSkillTags(skillTagsInput);
    const normalizedProgress = normalizeProgressValue(progressValue);
    const deadlineDate = parseLocalDateTime(deadlineInput.trim());
    const deadline = deadlineDate ? deadlineDate.toISOString() : undefined;
    const reminderRaw = reminderInput.trim();
    const reminderMinutes = reminderRaw === '' ? null : Number(reminderRaw);
    const reminder =
      deadline && reminderMinutes !== null && Number.isFinite(reminderMinutes) && reminderMinutes >= 0
        ? { offsetMinutes: Math.trunc(reminderMinutes) }
        : undefined;
    await updateTask({
      ...task,
      title: trimmedTitle,
      rarity,
      xpOverride,
      deadline,
      reminder,
      comment: commentValue ? commentValue : undefined,
      checklist: normalizedChecklist.length ? normalizedChecklist : undefined,
      skillTags: skillTags.length ? skillTags : undefined,
      progressEnabled,
      progressValue: progressEnabled ? normalizedProgress : progressValue
    });
    await onSaved();
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-md tm-panel p-6 shadow-xl max-h-[85vh] overflow-hidden flex flex-col">
        <h2 className="text-xl font-semibold tm-title mb-4">Редактировать задачу</h2>
        <div className="space-y-4 overflow-y-auto pr-1 flex-1 min-h-0">
          <div>
            <label className="block text-sm tm-label mb-1">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, MAX_TASK_TITLE_LENGTH))}
              className="tm-input"
              maxLength={MAX_TASK_TITLE_LENGTH}
              placeholder="Например: Сделать тренировку"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Редкость</label>
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
                className="tm-select"
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm tm-label">Ценность</label>
              <span className="text-sm text-amber-100">{value}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={value}
              onChange={(event) => setValue(Number(event.target.value))}
              className="tm-range"
            />
            <div className="flex justify-between text-xs text-amber-200/70 mt-1">
              <span>1</span>
              <span>10</span>
            </div>
          </div>
          <div>
            <label className="block text-sm tm-label mb-1">Комментарий</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="tm-input"
              rows={3}
              placeholder="Например: детали, на что обратить внимание"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm tm-label mb-1">Checklist</label>
            {checklistDraft.length > 0 ? (
              <div className="space-y-2">
                {checklistDraft.map((item) => (
                  <div key={item.id} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleChecklistItemDone(item.id)}
                      className="mt-1 h-4 w-4 accent-amber-500"
                      disabled={saving}
                    />
                    <input
                      value={item.text}
                      onChange={(event) => updateChecklistItemText(item.id, event.target.value)}
                      className="tm-input flex-1 text-sm"
                      disabled={saving}
                    />
                    <button
                      type="button"
                      onClick={() => removeChecklistItem(item.id)}
                      className="tm-button tm-button-ghost tm-button-sm"
                      disabled={saving}
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-amber-200/70">Пунктов пока нет.</p>
            )}
            <div className="space-y-2">
              <label className="block text-xs tm-label">
                Checklist (one item per line; supports '-' or '1.' prefixes)
              </label>
              <textarea
                value={checklistAddInput}
                onChange={(event) => setChecklistAddInput(event.target.value)}
                className="tm-input"
                rows={3}
                disabled={saving}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={addChecklistItems}
                  className="tm-button tm-button-ghost tm-button-sm"
                  disabled={saving || checklistAddInput.trim().length === 0}
                >
                  Добавить
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Дедлайн</label>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(event) => setDeadlineInput(event.target.value)}
                className="tm-input"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm tm-label mb-1">Напоминание (мин. до)</label>
              <input
                type="number"
                min={0}
                step={5}
                value={reminderInput}
                onChange={(event) => setReminderInput(event.target.value)}
                className="tm-input"
                placeholder="Например: 60"
              />
              <p className="text-xs text-amber-200/70">
                Работает при указанном дедлайне.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm tm-label">
              <input
                type="checkbox"
                checked={progressEnabled}
                onChange={(event) => setProgressEnabled(event.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Прогресс
            </label>
            {progressEnabled ? (
              <TaskProgressControls
                value={progressValue}
                onChange={setProgressValue}
                disabled={saving}
                showLabel={false}
              />
            ) : null}
          </div>
          <div>
            <SkillTagsInput
              value={skillTagsInput}
              onChange={setSkillTagsInput}
              suggestions={skillOptions}
              disabled={saving}
              placeholder="Например: Готовка, Excel"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="tm-button tm-button-ghost"
              disabled={saving}
            >
              Отмена
            </button>
            <button
              onClick={submit}
              className="tm-button tm-button-primary"
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
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
  const titleClassName = `tm-task-title ${
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
            {PERIODICITY_LABELS[task.periodicity]} ·{' '}
            <span className={rarityStyle.text}>{task.rarity}</span> · Ценность {taskValue}
          </span>
          {hasComment ? <span className="tm-badge tm-badge-note">комм.</span> : null}
        </p>
        {skillTags.length ? (
          <div className="tm-task-tags">
            {skillTags.map((tag, index) => (
              <span key={`${task.id}-tag-${index}`} className="tm-task-tag">
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
          <div>
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

function CompletedTaskCard({
  task,
  onEdit,
  onDelete,
  onUndo,
  onArchive,
  onProgressChange,
  onChecklistItemToggle,
  onToggle,
  expanded,
  busy,
  deleting,
  archiving
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onUndo: (task: Task) => void;
  onArchive: (task: Task) => void;
  onProgressChange: (task: Task, value: number) => void;
  onChecklistItemToggle: (task: Task, itemId: string) => void;
  onToggle: (taskId: string) => void;
  expanded: boolean;
  busy: boolean;
  deleting: boolean;
  archiving: boolean;
}) {
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
  const showDetails = !hasChecklist || expanded;
  const handleToggle = () => onToggle(task.id);

  return (
    <div
      className={`tm-card tm-card-muted ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-3`}
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
          <p className="tm-task-title tm-task-title-muted line-through flex-1">{task.title}</p>
        </div>
        {hasChecklist ? (
          <div className="mt-1">
            <ChecklistProgressBar value={checklistProgress} muted />
          </div>
        ) : progressEnabled ? (
          <div className="mt-1">
            <TaskProgressBar value={progressValue} muted />
          </div>
        ) : null}
        {showDetails ? (
          <>
        <p className="text-sm text-amber-900 flex flex-wrap items-center gap-2">
          <span>
            {PERIODICITY_LABELS[task.periodicity]} ·{' '}
            <span className={rarityStyle.text}>{task.rarity}</span> · Ценность {taskValue}
          </span>
          {hasComment ? <span className="tm-badge tm-badge-note">комм.</span> : null}
          {isArchived ? <span className="tm-badge">завершена</span> : null}
        </p>
        {skillTags.length ? (
          <div className="tm-task-tags">
            {skillTags.map((tag, index) => (
              <span key={`${task.id}-tag-${index}`} className="tm-task-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {deadlineLabel || reminderLabel ? (
          <p className="text-sm text-amber-900 flex flex-wrap gap-3">
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
        <span className="tm-badge">✓</span>
        <button
          onClick={() => onUndo(task)}
          className="tm-button tm-button-danger tm-button-sm"
          disabled={busy || archiving}
        >
          {busy ? 'Отмена...' : 'Отменить'}
        </button>
        <button
          onClick={() => onArchive(task)}
          className="tm-button tm-button-gold tm-button-sm"
          disabled={busy || archiving || isArchived}
        >
          {archiving ? 'Завершение...' : isArchived ? 'Завершено' : 'Завершить'}
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
          <div>
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

function MissedTaskCard({
  task,
  onEdit,
  onDelete,
  onUndo,
  onProgressChange,
  onChecklistItemToggle,
  onToggle,
  expanded,
  busy,
  deleting
}: {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onUndo: (task: Task) => void;
  onProgressChange: (task: Task, value: number) => void;
  onChecklistItemToggle: (task: Task, itemId: string) => void;
  onToggle: (taskId: string) => void;
  expanded: boolean;
  busy: boolean;
  deleting: boolean;
}) {
  const rarityStyle = RARITY_STYLES[task.rarity] ?? RARITY_STYLES.common;
  const taskValue = getTaskValue(task);
  const deadlineDate = getNextDeadlineDate(task);
  const deadlineLabel = formatDeadline(deadlineDate);
  const reminderDate = getReminderDate(deadlineDate, task.reminder?.offsetMinutes);
  const reminderLabel = formatDeadline(reminderDate);
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
  const handleToggle = () => onToggle(task.id);

  return (
    <div
      className={`tm-card tm-card-muted ${rarityStyle.accent} border-l-4 ${rarityStyle.border} px-3 py-2 sm:px-4 sm:py-3 flex flex-col gap-3`}
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
          <p className="tm-task-title tm-task-title-muted flex-1">{task.title}</p>
        </div>
        {hasChecklist ? (
          <div className="mt-1">
            <ChecklistProgressBar value={checklistProgress} muted />
          </div>
        ) : progressEnabled ? (
          <div className="mt-1">
            <TaskProgressBar value={progressValue} muted />
          </div>
        ) : null}
        {showDetails ? (
          <>
        <p className="text-sm text-amber-900 flex flex-wrap items-center gap-2">
          <span>
            {PERIODICITY_LABELS[task.periodicity]} ·{' '}
            <span className={rarityStyle.text}>{task.rarity}</span> · Ценность {taskValue}
          </span>
          {hasComment ? <span className="tm-badge tm-badge-note">комм.</span> : null}
        </p>
        {skillTags.length ? (
          <div className="tm-task-tags">
            {skillTags.map((tag, index) => (
              <span key={`${task.id}-tag-${index}`} className="tm-task-tag">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {deadlineLabel || reminderLabel ? (
          <p className="text-sm text-amber-900 flex flex-wrap gap-3">
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
        <span className="tm-badge tm-badge-danger">✕</span>
        <button
          onClick={() => onUndo(task)}
          className="tm-button tm-button-danger tm-button-sm"
          disabled={busy}
        >
          {busy ? 'Отмена...' : 'Отменить'}
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
          <div>
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

export function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [xp, setXp] = useState(0);
  const [dailyXp, setDailyXp] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [pinnedRewardIds, setPinnedRewardIds] = useState<string[]>([]);
  const [skillOptions, setSkillOptions] = useState<string[]>([]);
  const [editingXp, setEditingXp] = useState(false);
  const [xpDraft, setXpDraft] = useState('');
  const [savingXp, setSavingXp] = useState(false);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loggingTaskId, setLoggingTaskId] = useState<string | null>(null);
  const [useCustomLogDate, setUseCustomLogDate] = useState(false);
  const [customLogDateInput, setCustomLogDateInput] = useState(() => toLocalInputValue(new Date()));
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [calendarTask, setCalendarTask] = useState<Task | null>(null);
  const [calendarValue, setCalendarValue] = useState('');
  const [completedTaskIds, setCompletedTaskIds] = useState<string[]>([]);
  const [missedTaskIds, setMissedTaskIds] = useState<string[]>([]);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [showCompleted, setShowCompleted] = useState(true);
  const [showMissed, setShowMissed] = useState(true);
  const [completedVisibleCount, setCompletedVisibleCount] = useState(
    COMPLETED_TASKS_PAGE_SIZE
  );
  const [sortOpen, setSortOpen] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSort>('manual');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [expandedChecklistIds, setExpandedChecklistIds] = useState<Record<string, boolean>>({});
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [archivingTaskId, setArchivingTaskId] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);

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
    const [t, balance, eventsData, rewardsData, pinned, stats] = await Promise.all([
      listTasks(),
      getXpBalance(),
      listEvents(),
      db.rewards.toArray(),
      getAppMetaValue<string[]>(PINNED_REWARDS_META_KEY),
      getAppMetaValue<SkillsStatsState>(SKILLS_STATS_META_KEY)
    ]);
    const normalizedPins = Array.isArray(pinned)
      ? pinned.filter((id): id is string => typeof id === 'string')
      : [];
    const today = new Date();
    const latestByTaskId = new Map<string, LedgerEvent>();
    const latestByTaskIdToday = new Map<string, LedgerEvent>();
    const latestByTaskIdWeek = new Map<string, LedgerEvent>();
    const currentWeekStart = startOfLocalWeek(today);
    const currentWeekEnd = new Date(currentWeekStart);
    currentWeekEnd.setDate(currentWeekEnd.getDate() + 7);
    for (const event of eventsData) {
      if (event.kind !== 'task' || !event.taskId) continue;
      const eventTime = parseEventTimestamp(event.createdAt);
      if (Number.isNaN(eventTime)) continue;
      const eventDate = new Date(eventTime);
      const existing = latestByTaskId.get(event.taskId);
      const existingTime = existing ? parseEventTimestamp(existing.createdAt) : NaN;
      if (!existing || Number.isNaN(existingTime) || existingTime < eventTime) {
        latestByTaskId.set(event.taskId, event);
      }
      if (!isSameLocalDate(eventDate, today)) continue;
      const existingToday = latestByTaskIdToday.get(event.taskId);
      const existingTodayTime = existingToday
        ? parseEventTimestamp(existingToday.createdAt)
        : NaN;
      if (!existingToday || Number.isNaN(existingTodayTime) || existingTodayTime < eventTime) {
        latestByTaskIdToday.set(event.taskId, event);
      }
      if (eventDate < currentWeekStart || eventDate >= currentWeekEnd) continue;
      const existingWeek = latestByTaskIdWeek.get(event.taskId);
      const existingWeekTime = existingWeek ? parseEventTimestamp(existingWeek.createdAt) : NaN;
      if (!existingWeek || Number.isNaN(existingWeekTime) || existingWeekTime < eventTime) {
        latestByTaskIdWeek.set(event.taskId, event);
      }
    }
    let earnedToday = 0;
    const completedToday = new Set<string>();
    const missedToday = new Set<string>();
    for (const [taskId, event] of latestByTaskIdToday.entries()) {
      if (isUndoEvent(event)) continue;
      earnedToday += event.deltaXp;
      if (isMissedEvent(event)) {
        missedToday.add(taskId);
      } else if (event.deltaXp > 0) {
        completedToday.add(taskId);
      }
    }
    const completed = new Set<string>();
    const missed = new Set<string>();
    for (const task of t) {
      if (task.periodicity === 'one-time') {
        const latest = latestByTaskId.get(task.id);
        if (!latest || isUndoEvent(latest)) continue;
        if (isMissedEvent(latest)) {
          missed.add(task.id);
        } else if (latest.deltaXp > 0) {
          completed.add(task.id);
        }
      } else if (task.periodicity === 'weekly') {
        const latest = latestByTaskIdWeek.get(task.id);
        if (!latest || isUndoEvent(latest)) continue;
        if (isMissedEvent(latest)) {
          missed.add(task.id);
        } else if (latest.deltaXp > 0) {
          completed.add(task.id);
        }
      } else {
        if (completedToday.has(task.id)) completed.add(task.id);
        if (missedToday.has(task.id)) missed.add(task.id);
      }
    }
    setTasks(t);
    setLedgerEvents(eventsData);
    setRewards(rewardsData);
    setPinnedRewardIds(normalizedPins);
    setSkillOptions(buildSkillOptions(stats));
    setXp(balance);
    setDailyXp(earnedToday);
    setCompletedTaskIds(Array.from(completed));
    setMissedTaskIds(Array.from(missed));
    setCompletedTodayCount(completedToday.size);
    setLoading(false);
    void logStorageCounts(t, eventsData);
  };

  useEffect(() => {
    load();
  }, []);

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

  const pinnedRewards = useMemo(
    () =>
      pinnedRewardIds
        .map((rewardId) => rewardsById.get(rewardId))
        .filter((reward): reward is Reward => Boolean(reward)),
    [pinnedRewardIds, rewardsById]
  );

  const pendingTasks = useMemo(() => {
    const completedSet = new Set(completedTaskIds);
    const missedSet = new Set(missedTaskIds);
    return sortedTasks.filter(
      (task) => !task.archived && !completedSet.has(task.id) && !missedSet.has(task.id)
    );
  }, [completedTaskIds, missedTaskIds, sortedTasks]);

  const completedTasks = useMemo(() => {
    const completedSet = new Set(completedTaskIds);
    return sortedTasks.filter((task) => completedSet.has(task.id) || task.archived);
  }, [completedTaskIds, sortedTasks]);

  const missedTasks = useMemo(() => {
    const missedSet = new Set(missedTaskIds);
    return sortedTasks.filter((task) => missedSet.has(task.id) && !task.archived);
  }, [missedTaskIds, sortedTasks]);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return pendingTasks;
    return pendingTasks.filter((t) => t.periodicity === filter);
  }, [filter, pendingTasks]);

  const filteredCompletedTasks = useMemo(() => {
    if (filter === 'all') return completedTasks;
    return completedTasks.filter((t) => t.periodicity === filter);
  }, [completedTasks, filter]);

  useEffect(() => {
    setCompletedVisibleCount(COMPLETED_TASKS_PAGE_SIZE);
  }, [filter, showCompleted, completedTasks.length]);

  const visibleCompletedTasks = useMemo(
    () => filteredCompletedTasks.slice(0, completedVisibleCount),
    [filteredCompletedTasks, completedVisibleCount]
  );

  const filteredMissedTasks = useMemo(() => {
    if (filter === 'all') return missedTasks;
    return missedTasks.filter((t) => t.periodicity === filter);
  }, [filter, missedTasks]);

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

  const remainingTasksCount = useMemo(() => filteredTasks.length, [filteredTasks]);
  const visibleTasksCount = filteredTasks.length;

  const setLogDateToNow = () => {
    setCustomLogDateInput(toLocalInputValue(new Date()));
  };

  const resolveLogOccurredAt = () => {
    if (!useCustomLogDate) return Date.now();
    const parsed = parseLocalDateTime(customLogDateInput);
    if (!parsed) return null;
    return parsed.getTime();
  };

  useEffect(() => {
    if (!DEBUG_COUNTS) return;
    console.groupCollapsed('[TodayPage] UI counts');
    console.table({
      visibleTasks_length: visibleTasksCount,
      doneCount: completedTodayCount,
      totalCount: remainingTasksCount
    });
    console.log('Source', {
      visibleTasks: 'filteredTasks (pendingTasks filtered by periodicity)',
      doneCount: 'completedTodayCount (ledger events for today)',
      totalCount: 'remainingTasksCount = filteredTasks.length'
    });
    console.log('Collections', {
      pendingTasks: pendingTasks.length,
      completedTasks: completedTasks.length,
      missedTasks: missedTasks.length,
      filteredCompletedTasks: filteredCompletedTasks.length,
      filteredMissedTasks: filteredMissedTasks.length,
      filter
    });
    console.groupEnd();
  }, [
    completedTodayCount,
    remainingTasksCount,
    visibleTasksCount,
    pendingTasks.length,
    completedTasks.length,
    missedTasks.length,
    filteredCompletedTasks.length,
    filteredMissedTasks.length,
    filter
  ]);

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

  const undoTask = async (task: Task) => {
    setLoggingTaskId(task.id);
    const occurredAt = Date.now();
    const eventType = 'TASK_UNDO';
    const event: LedgerEvent = {
      id: generateId(),
      kind: 'task',
      taskId: task.id,
      deltaXp: -xpForTask(task),
      createdAt: new Date(occurredAt).toISOString(),
      note: eventType,
      meta: { eventType, refId: task.id, occurredAt }
    };
    await addEvent(event);
    await load();
    setLoggingTaskId(null);
  };

  const undoMissedTask = async (task: Task) => {
    setLoggingTaskId(task.id);
    const occurredAt = Date.now();
    const eventType = 'TASK_UNDO';
    const event: LedgerEvent = {
      id: generateId(),
      kind: 'task',
      taskId: task.id,
      deltaXp: xpForTask(task),
      createdAt: new Date(occurredAt).toISOString(),
      note: eventType,
      meta: { eventType, refId: task.id, occurredAt, undoOf: 'TASK_MISSED' }
    };
    await addEvent(event);
    await load();
    setLoggingTaskId(null);
  };

  const deleteTaskItem = async (task: Task) => {
    const confirmed = window.confirm(`Удалить задачу "${task.title}"?`);
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
        alert('Task deleted, but failed to add a ledger record.');
      }
      await load();
    } catch (error) {
      alert('Failed to delete task.');
    } finally {
      setDeletingTaskId(null);
    }
  };

  const archiveTaskItem = async (task: Task) => {
    if (task.archived) return;
    const confirmed = window.confirm(
      `Завершить задачу "${task.title}"? Она будет скрыта из списков.`
    );
    if (!confirmed) return;
    setArchivingTaskId(task.id);
    try {
      await updateTask({ ...task, archived: true });
      await load();
    } catch (error) {
      alert('Не удалось завершить задачу.');
    } finally {
      setArchivingTaskId(null);
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
      alert('Failed to update progress.');
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
      alert('Failed to update checklist.');
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
      alert('Invalid date/time.');
      return;
    }
    downloadCalendar(calendarTask, due);
    setCalendarTask(null);
  };

  const openXpEditor = () => {
    setXpDraft(String(xp));
    setEditingXp(true);
  };

  const saveXp = async () => {
    const parsed = Number(xpDraft);
    if (!Number.isFinite(parsed)) {
      alert('Invalid XP value.');
      return;
    }
    const target = Math.trunc(parsed);
    const delta = target - xp;
    if (delta === 0) {
      setEditingXp(false);
      return;
    }
    setSavingXp(true);
    try {
      await addEvent({
        id: generateId(),
        kind: 'adjustment',
        deltaXp: delta,
        createdAt: new Date().toISOString(),
        note: 'xp-adjust'
      });
      await load();
      setEditingXp(false);
    } catch (error) {
      alert('Failed to update XP.');
    } finally {
      setSavingXp(false);
    }
  };

  const canReorder = pendingTasks.length > 1 && sortMode === 'manual';

  const reorderPendingTasks = async (sourceId: string, targetId: string) => {
    const sourceIndex = pendingTasks.findIndex((task) => task.id === sourceId);
    const targetIndex = pendingTasks.findIndex((task) => task.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    if (sourceIndex === targetIndex) return;

    const reordered = [...pendingTasks];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const base = Date.now();
    const reorderedWithSort = reordered.map((task, index) => ({
      ...task,
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
      alert('Failed to reorder tasks.');
      await load();
    }
  };

  const handleDragStart = (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorder) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorder || !draggingTaskId) return;
    if (draggingTaskId === taskId) return;
    event.preventDefault();
    setDragOverTaskId(taskId);
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorder) return;
    event.preventDefault();
    const sourceId = draggingTaskId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === taskId) {
      setDragOverTaskId(null);
      return;
    }
    await reorderPendingTasks(sourceId, taskId);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };

  const editTask = (task: Task) => {
    setEditingTask(task);
  };

  const toggleExpandedTask = (taskId: string) => {
    setExpandedTaskId((prev) => (prev === taskId ? null : taskId));
  };

  const toggleChecklistExpanded = (taskId: string) => {
    setExpandedChecklistIds((prev) => ({
      ...prev,
      [taskId]: !prev[taskId]
    }));
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-1 sm:px-4 py-4 sm:py-6">
        <div className="tm-frame tm-reveal space-y-4 p-2 sm:p-5">
        <section className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="tm-panel-soft tm-reveal tm-reveal-delay-1 min-w-0 p-2 sm:p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="tm-label">XP balance</p>
                <p className="tm-value tm-value-compact">
                  Сделано: {completedTodayCount} из {remainingTasksCount}
                </p>
              </div>
              <button
                onClick={openXpEditor}
                className="tm-button tm-button-ghost tm-button-sm self-end sm:self-auto"
              >
                Edit
              </button>
            </div>
            <p className="tm-value">{xp}</p>
          </div>
          <div className="tm-panel-soft tm-reveal tm-reveal-delay-2 min-w-0 p-2 sm:p-3">
            <p className="tm-label">Сегодня</p>
            <p className="tm-value tm-value-compact">
              Сделано: {completedTodayCount} из {remainingTasksCount}
            </p>
            <div className="mt-2 space-y-1">
              <p className="tm-label">Опыт за сегодня</p>
              <p className="tm-value">{formatXpDelta(dailyXp)}</p>
            </div>
          </div>
        </section>

        {pinnedRewards.length > 0 ? (
          <section className="tm-panel tm-reveal tm-reveal-delay-3 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tm-title">Награды</h2>
            </div>
            <div className="space-y-2">
              {pinnedRewards.map((reward) => {
                const progressValue = getRewardProgressPercent(xp, reward.cost);
                return (
                  <div key={reward.id} className="tm-card px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-amber-50 font-semibold">{reward.name}</p>
                        <p className="text-xs text-amber-200/70">
                          Цена: {reward.cost} XP
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <RewardProgressBar value={progressValue} />
                      <p className="text-xs text-amber-200/70">
                        XP: {xp} / {reward.cost}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="tm-panel tm-reveal tm-reveal-delay-3 p-4 space-y-4">
          <div className="flex items-center gap-3 w-full">
            <h2 className="text-lg font-semibold tm-title">Задачи</h2>
            <div className="relative z-40" ref={sortMenuRef}>
              <button
                onClick={() => setSortOpen((prev) => !prev)}
                className="tm-button tm-button-ghost tm-button-sm"
                aria-haspopup="true"
                aria-expanded={sortOpen}
              >
                Sort
              </button>
              {sortOpen ? (
                <div className="absolute left-0 top-full mt-2 tm-panel p-3 z-50 w-64 space-y-3">
                  <div className="space-y-2">
                    <label htmlFor="task-sort" className="text-xs tm-label">
                      Сортировка
                    </label>
                    <select
                      id="task-sort"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as TaskSort)}
                      className="tm-select text-sm"
                    >
                      {TASK_SORTS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="task-filter" className="text-xs tm-label">
                      Фильтр
                    </label>
                    <select
                      id="task-filter"
                      value={filter}
                      onChange={(event) => setFilter(event.target.value as TaskFilter)}
                      className="tm-select text-sm"
                    >
                      {TASK_FILTERS.map((f) => (
                        <option key={f} value={f}>
                          {f === 'all' ? 'Все' : PERIODICITY_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => setShowCompleted((prev) => !prev)}
                      className="tm-button tm-button-ghost tm-button-sm w-full text-left"
                    >
                      {showCompleted ? 'Скрыть выполненные' : 'Показать выполненные'}
                    </button>
                    <button
                      onClick={() => setShowMissed((prev) => !prev)}
                      className="tm-button tm-button-ghost tm-button-sm w-full text-left"
                    >
                      {showMissed ? 'Скрыть невыполненные' : 'Показать невыполненные'}
                    </button>
                  </div>
                  <div className="pt-2 tm-divider">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={useCustomLogDate}
                        onChange={(event) => {
                          const nextChecked = event.target.checked;
                          setUseCustomLogDate(nextChecked);
                          if (nextChecked) setLogDateToNow();
                        }}
                        className="h-4 w-4 accent-amber-500"
                      />
                      <span className="text-xs text-amber-200/90 whitespace-nowrap">Своя дата</span>
                      <input
                        type="datetime-local"
                        value={customLogDateInput}
                        onChange={(event) => setCustomLogDateInput(event.target.value)}
                        className="tm-input h-8 w-36 text-xs"
                        disabled={!useCustomLogDate}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button
              onClick={() => setAdding(true)}
              className="tm-button tm-button-primary ml-auto"
            >
              + Add task
            </button>
          </div>

          {loading ? (
            <p className="text-amber-200/80">Загрузка...</p>
          ) : (
            <>
              {filteredTasks.length === 0 &&
              filteredCompletedTasks.length === 0 &&
              filteredMissedTasks.length === 0 ? (
                <p className="text-amber-200/80">Нет задач.</p>
              ) : filteredTasks.length > 0 ? (
                <div className="space-y-3">
                  {filteredTasks.map((task) => {
                    const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
                    const expanded = hasChecklist
                      ? Boolean(expandedChecklistIds[task.id])
                      : expandedTaskId === task.id;
                    const onToggle = hasChecklist ? toggleChecklistExpanded : toggleExpandedTask;
                    return (
                        <TaskCard
                          key={task.id}
                          task={task}
                          onLog={logTask}
                          onAddToCalendar={addToCalendar}
                          onEdit={editTask}
                          onDelete={deleteTaskItem}
                          quotaStatus={quotaStatusByTaskId.get(task.id)}
                          onProgressChange={updateTaskProgress}
                          onChecklistItemToggle={toggleChecklistItem}
                          onToggle={onToggle}
                        expanded={expanded}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={handleDragEnd}
                        dragEnabled={canReorder}
                        dragging={draggingTaskId === task.id}
                        dragOver={dragOverTaskId === task.id && draggingTaskId !== task.id}
                        busy={loggingTaskId === task.id || deletingTaskId === task.id}
                        deleting={deletingTaskId === task.id}
                      />
                    );
                  })}
                </div>
              ) : null}
              {showMissed && filteredMissedTasks.length > 0 ? (
                <div className="pt-4 tm-divider space-y-3">
                  <h3 className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
                    Невыполненные
                  </h3>
                  <div className="space-y-2">
                    {filteredMissedTasks.map((task) => {
                      const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
                      const expanded = hasChecklist
                        ? Boolean(expandedChecklistIds[task.id])
                        : expandedTaskId === task.id;
                      const onToggle = hasChecklist ? toggleChecklistExpanded : toggleExpandedTask;
                      return (
                        <MissedTaskCard
                          key={`missed-${task.id}`}
                          task={task}
                          onEdit={editTask}
                          onDelete={deleteTaskItem}
                          onUndo={undoMissedTask}
                          onProgressChange={updateTaskProgress}
                          onChecklistItemToggle={toggleChecklistItem}
                          onToggle={onToggle}
                          expanded={expanded}
                          busy={loggingTaskId === task.id || deletingTaskId === task.id}
                          deleting={deletingTaskId === task.id}
                        />
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {showCompleted && filteredCompletedTasks.length > 0 ? (
                <div className="pt-4 tm-divider space-y-3">
                  <h3 className="text-xs uppercase tracking-[0.2em] text-amber-200/70">
                    Выполненные
                  </h3>
                  <div className="space-y-2">
                    {visibleCompletedTasks.map((task) => {
                      const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
                      const expanded = hasChecklist
                        ? Boolean(expandedChecklistIds[task.id])
                        : expandedTaskId === task.id;
                      const onToggle = hasChecklist ? toggleChecklistExpanded : toggleExpandedTask;
                      return (
                        <CompletedTaskCard
                          key={`done-${task.id}`}
                          task={task}
                          onEdit={editTask}
                          onDelete={deleteTaskItem}
                          onUndo={undoTask}
                          onArchive={archiveTaskItem}
                          onProgressChange={updateTaskProgress}
                          onChecklistItemToggle={toggleChecklistItem}
                          onToggle={onToggle}
                          expanded={expanded}
                          busy={
                            loggingTaskId === task.id ||
                            deletingTaskId === task.id ||
                            archivingTaskId === task.id
                          }
                          deleting={deletingTaskId === task.id}
                          archiving={archivingTaskId === task.id}
                        />
                      );
                    })}
                    {filteredCompletedTasks.length > visibleCompletedTasks.length ? (
                      <button
                        onClick={() =>
                          setCompletedVisibleCount((prev) =>
                            Math.min(
                              prev + COMPLETED_TASKS_PAGE_SIZE,
                              filteredCompletedTasks.length
                            )
                          )
                        }
                        className="tm-button tm-button-ghost tm-button-sm w-full"
                      >
                        Показать ещё
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
        </div>
      </div>

      <AddTaskModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={load}
        skillOptions={skillOptions}
      />
      <CalendarModal
        open={calendarTask !== null}
        task={calendarTask}
        value={calendarValue}
        onChange={setCalendarValue}
        onCancel={() => setCalendarTask(null)}
        onConfirm={confirmCalendar}
      />
      <EditXpModal
        open={editingXp}
        value={xpDraft}
        onChange={setXpDraft}
        onCancel={() => setEditingXp(false)}
        onSave={saveXp}
        saving={savingXp}
      />
      <EditTaskModal
        open={editingTask !== null}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSaved={load}
        skillOptions={skillOptions}
      />
    </div>
  );
}
