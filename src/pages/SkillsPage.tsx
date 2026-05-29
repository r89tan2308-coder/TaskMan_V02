import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { useLocale, type AppLocale } from '../i18n/appLocale';

type WheelSegment = {
  id: string;
  name: string;
  score: number;
};

type BalanceWheelState = {
  segments: WheelSegment[];
};

type StatItem = {
  id: string;
  name: string;
  value: number;
};

type SkillsStatsState = {
  characteristics: StatItem[];
  skills: StatItem[];
};

type SkillsGoalsState = {
  characteristics: Record<string, number>;
  skills: Record<string, number>;
};

type SkillsNotesState = {
  characteristics: Record<string, string>;
  skills: Record<string, string>;
};

type SkillsSnapshot = {
  id: string;
  createdAt: string;
  segments: WheelSegment[];
  characteristics: StatItem[];
  skills: StatItem[];
};

type SkillsSnapshotsState = {
  snapshots: SkillsSnapshot[];
};

const WHEEL_META_KEY = 'balanceWheel';
const STATS_META_KEY = 'skillsStats';
const GOALS_META_KEY = 'skillsGoals';
const NOTES_META_KEY = 'skillsNotes';
const HISTORY_META_KEY = 'skillsSnapshots';
const MAX_SCORE = 10;
const MAX_CHARACTERISTIC = 10;
const MAX_SKILL = 100;
const MAX_SNAPSHOTS = 30;
const DEFAULT_SCORE = 5;
const DEFAULT_CHARACTERISTIC_VALUE = 6;
const DEFAULT_SKILL_VALUE = 55;
const WHEEL_COLORS = [
  '#6ea35e',
  '#5a84c9',
  '#6fb8e2',
  '#8b6fcb',
  '#c97aa5',
  '#d96d5f',
  '#d48a52',
  '#d6b24b'
];

const SKILLS_COPY = {
  ru: {
    eyebrow: 'TaskQuest',
    title: 'Профиль навыков',
    subtitle: 'Экран навыков и баланса',
    meta: {
      balance: 'Баланс',
      areas: 'Сферы',
      snapshots: 'Снимки'
    },
    wheelTitle: 'Колесо баланса',
    editWheelAria: 'Редактировать колесо баланса',
    characteristicsTitle: 'Характеристики',
    skillsTitle: 'Навыки',
    balanceIndexTitle: 'Индекс баланса',
    historyTitle: 'История',
    loading: 'Загрузка...',
    noNotes: 'Без заметок',
    weakest: (items: string) => `Слабые зоны: ${items}`,
    noWeakest: 'Слабые зоны: нет данных',
    takeSnapshot: 'Сделать снимок',
    historyHint: 'Сохраняйте снимки, чтобы видеть прогресс.',
    noSnapshots: 'Снимков пока нет. Сделай первый снимок, чтобы появился ориентир.',
    index: 'Индекс',
    weak: 'Слабые',
    delete: 'Удалить',
    close: 'Закрыть',
    namePlaceholder: 'Название',
    value: 'Значение',
    goal: 'Цель',
    note: 'Заметка',
    notePlaceholder: 'Добавить заметку',
    cancel: 'Отмена',
    saving: 'Сохранение...',
    save: 'Сохранить',
    editWheelTitle: 'Редактировать колесо баланса',
    segmentNamePlaceholder: 'Название сферы',
    addSegment: '+ Добавить сферу',
    editCharacteristicsTitle: 'Редактировать характеристики',
    addCharacteristic: '+ Добавить характеристику',
    editSkillsTitle: 'Редактировать навыки',
    addSkill: '+ Добавить навык',
    newSegment: 'Новая сфера',
    newCharacteristic: 'Новая характеристика',
    newSkill: 'Новый навык',
    fallbackSegment: 'Сфера',
    fallbackCharacteristic: 'Характеристика',
    fallbackSkill: 'Навык',
    dateLocale: 'ru-RU'
  },
  en: {
    eyebrow: 'TaskQuest',
    title: 'Skills profile',
    subtitle: 'Skills and balance screen',
    meta: {
      balance: 'Balance',
      areas: 'Areas',
      snapshots: 'Snapshots'
    },
    wheelTitle: 'Balance wheel',
    editWheelAria: 'Edit balance wheel',
    characteristicsTitle: 'Characteristics',
    skillsTitle: 'Skills',
    balanceIndexTitle: 'Balance index',
    historyTitle: 'History',
    loading: 'Loading...',
    noNotes: 'No notes',
    weakest: (items: string) => `Weak zones: ${items}`,
    noWeakest: 'Weak zones: no data',
    takeSnapshot: 'Take snapshot',
    historyHint: 'Save snapshots to track progress.',
    noSnapshots: 'No snapshots yet. Take the first snapshot to create a baseline.',
    index: 'Index',
    weak: 'Weak',
    delete: 'Delete',
    close: 'Close',
    namePlaceholder: 'Name',
    value: 'Value',
    goal: 'Goal',
    note: 'Note',
    notePlaceholder: 'Add note',
    cancel: 'Cancel',
    saving: 'Saving...',
    save: 'Save',
    editWheelTitle: 'Edit balance wheel',
    segmentNamePlaceholder: 'Area name',
    addSegment: '+ Add area',
    editCharacteristicsTitle: 'Edit characteristics',
    addCharacteristic: '+ Add characteristic',
    editSkillsTitle: 'Edit skills',
    addSkill: '+ Add skill',
    newSegment: 'New area',
    newCharacteristic: 'New characteristic',
    newSkill: 'New skill',
    fallbackSegment: 'Area',
    fallbackCharacteristic: 'Characteristic',
    fallbackSkill: 'Skill',
    dateLocale: 'en-US'
  }
} satisfies Record<AppLocale, unknown>;

type SkillsCopy = (typeof SKILLS_COPY)[AppLocale];

const DEFAULT_SEGMENT_NAMES = [
  'Здоровье',
  'Работа',
  'Личная жизнь',
  'Финансы',
  'Творчество',
  'Личностный рост',
  'Отдых',
  'Друзья, окружение'
];

const DEFAULT_SEGMENT_NAMES_EN = [
  'Health',
  'Work',
  'Personal life',
  'Finance',
  'Creativity',
  'Personal growth',
  'Rest',
  'Friends, community'
];

const DEFAULT_CHARACTERISTICS = [
  { name: 'Выносливость', value: 7 },
  { name: 'Сила', value: 6 },
  { name: 'Ловкость', value: 5 },
  { name: 'Интеллект', value: 7 },
  { name: 'Харизма', value: 6 },
  { name: 'Воля', value: 6 },
  { name: 'Концентрация', value: 6 },
  { name: 'Гибкость', value: 5 }
];

const DEFAULT_CHARACTERISTICS_EN = [
  { name: 'Endurance', value: 7 },
  { name: 'Strength', value: 6 },
  { name: 'Agility', value: 5 },
  { name: 'Intelligence', value: 7 },
  { name: 'Charisma', value: 6 },
  { name: 'Willpower', value: 6 },
  { name: 'Focus', value: 6 },
  { name: 'Flexibility', value: 5 }
];

const DEFAULT_LIFE_SKILLS = [
  { name: 'Готовка', value: 68 },
  { name: 'Вождение', value: 54 },
  { name: 'Excel', value: 72 },
  { name: 'Photoshop', value: 42 },
  { name: 'Коммуникация', value: 66 },
  { name: 'Планирование', value: 61 },
  { name: 'Финансовая грамотность', value: 58 },
  { name: 'Первая помощь', value: 37 },
  { name: 'Публичные выступления', value: 40 },
  { name: 'Домашний ремонт', value: 45 }
];

const DEFAULT_LIFE_SKILLS_EN = [
  { name: 'Cooking', value: 68 },
  { name: 'Driving', value: 54 },
  { name: 'Excel', value: 72 },
  { name: 'Photoshop', value: 42 },
  { name: 'Communication', value: 66 },
  { name: 'Planning', value: 61 },
  { name: 'Financial literacy', value: 58 },
  { name: 'First aid', value: 37 },
  { name: 'Public speaking', value: 40 },
  { name: 'Home repair', value: 45 }
];

const generateId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const clampScore = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(MAX_SCORE, Math.round(safeValue)));
};

const clampValue = (value: number, maxValue: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(maxValue, Math.round(safeValue)));
};

const buildDefaultSegments = (locale: AppLocale = 'ru') =>
  (locale === 'en' ? DEFAULT_SEGMENT_NAMES_EN : DEFAULT_SEGMENT_NAMES).map((name) => ({
    id: generateId(),
    name,
    score: DEFAULT_SCORE
  }));

const buildDefaultCharacteristics = (locale: AppLocale = 'ru') =>
  (locale === 'en' ? DEFAULT_CHARACTERISTICS_EN : DEFAULT_CHARACTERISTICS).map((stat) => ({
    id: generateId(),
    name: stat.name,
    value: clampValue(stat.value, MAX_CHARACTERISTIC)
  }));

const buildDefaultSkills = (locale: AppLocale = 'ru') =>
  (locale === 'en' ? DEFAULT_LIFE_SKILLS_EN : DEFAULT_LIFE_SKILLS).map((skill) => ({
    id: generateId(),
    name: skill.name,
    value: clampValue(skill.value, MAX_SKILL)
  }));

const normalizeSegments = (
  segments: WheelSegment[],
  fallbackLabel = 'Сфера',
  locale: AppLocale = 'ru'
) => {
  if (!segments.length) return buildDefaultSegments(locale);
  return segments.map((segment, index) => ({
    id: segment.id || generateId(),
    name: segment.name.trim() || `${fallbackLabel} ${index + 1}`,
    score: clampScore(segment.score ?? 0)
  }));
};

const normalizeStats = (
  items: StatItem[],
  fallback: StatItem[],
  maxValue: number,
  label: string
) => {
  if (!items.length) return fallback;
  return items.map((item, index) => ({
    id: item.id || generateId(),
    name: item.name.trim() || `${label} ${index + 1}`,
    value: clampValue(item.value ?? 0, maxValue)
  }));
};

const buildGoalMap = (items: { id: string }[], goals: Record<string, number>, maxValue: number) => {
  const next: Record<string, number> = {};
  for (const item of items) {
    const value = goals[item.id];
    next[item.id] = clampValue(typeof value === 'number' ? value : maxValue, maxValue);
  }
  return next;
};

const buildNotesMap = (items: { id: string }[], notes: Record<string, string>) => {
  const next: Record<string, string> = {};
  for (const item of items) {
    const value = notes[item.id];
    if (typeof value === 'string' && value.trim()) {
      next[item.id] = value.trim();
    }
  }
  return next;
};

const formatSnapshotDate = (value: string, dateLocale: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(dateLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getAverageScore = (segments: WheelSegment[]) => {
  if (!segments.length) return 0;
  const total = segments.reduce((sum, segment) => sum + clampScore(segment.score), 0);
  return total / segments.length;
};

const getLowestSegments = (segments: WheelSegment[], count: number) =>
  [...segments]
    .sort((left, right) => clampScore(left.score) - clampScore(right.score))
    .slice(0, count);

const splitWheelLabel = (value: string) => {
  const normalized = value.replace(/\s*,\s*/g, ', ').trim();
  if (normalized.length <= 10) return [normalized];

  const lines: string[] = [];
  let current = '';
  for (const word of normalized.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= 11 || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  return [lines[0], lines.slice(1).join(' ')];
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const polarToCartesian = (cx: number, cy: number, radius: number, angleDeg: number) => {
  const angleRad = toRadians(angleDeg);
  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy + radius * Math.sin(angleRad)
  };
};

const describeWedge = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number
) => {
  const start = polarToCartesian(cx, cy, radius, startAngle);
  const end = polarToCartesian(cx, cy, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z'
  ].join(' ');
};

function StatsEditorModal({
  open,
  title,
  copy,
  items,
  maxValue,
  goals,
  maxGoal,
  notes,
  addLabel,
  onAdd,
  onRemove,
  onUpdate,
  onGoalChange,
  onNoteChange,
  onClose,
  onSave,
  saving
}: {
  open: boolean;
  title: string;
  copy: SkillsCopy;
  items: StatItem[];
  maxValue: number;
  goals?: Record<string, number>;
  maxGoal?: number;
  notes?: Record<string, string>;
  addLabel: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<StatItem>) => void;
  onGoalChange?: (id: string, value: number) => void;
  onNoteChange?: (id: string, value: string) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
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
    if (!open || saving || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, saving]);

  if (!open) return null;
  const showGoals = Boolean(goals && onGoalChange && typeof maxGoal === 'number');
  const showNotes = Boolean(notes && onNoteChange);
  const goalMax = typeof maxGoal === 'number' ? maxGoal : maxValue;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4">
      <div
        className="w-full max-w-3xl tm-panel p-6 shadow-xl space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold tm-title">{title}</h2>
          <button onClick={onClose} className="tm-button tm-button-ghost">
            {copy.close}
          </button>
        </div>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {items.map((item) => {
            const goalValue = showGoals
              ? clampValue(goals?.[item.id] ?? goalMax, goalMax)
              : 0;
            const noteValue = showNotes ? notes?.[item.id] ?? '' : '';
            return (
              <div key={item.id} className="tm-panel-soft p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={item.name}
                    onChange={(event) => onUpdate(item.id, { name: event.target.value })}
                    className="tm-input flex-1 min-w-[180px]"
                    placeholder={copy.namePlaceholder}
                  />
                  <button
                    onClick={() => onRemove(item.id)}
                    className="tm-button tm-button-danger tm-button-sm"
                    disabled={items.length <= 1}
                  >
                    {copy.delete}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs tm-screen-muted w-16">{copy.value}</span>
                  <input
                    type="range"
                    min={0}
                    max={maxValue}
                    step={1}
                    value={item.value}
                    onChange={(event) => onUpdate(item.id, { value: Number(event.target.value) })}
                    className="tm-range flex-1"
                  />
                  <input
                    type="number"
                    min={0}
                    max={maxValue}
                    value={item.value}
                    onChange={(event) => onUpdate(item.id, { value: Number(event.target.value) })}
                    className="tm-input w-20"
                  />
                </div>
                {showGoals ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs tm-screen-muted w-16">{copy.goal}</span>
                    <input
                      type="range"
                      min={0}
                      max={goalMax}
                      step={1}
                      value={goalValue}
                      onChange={(event) => onGoalChange?.(item.id, Number(event.target.value))}
                      className="tm-range flex-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={goalMax}
                      value={goalValue}
                      onChange={(event) => onGoalChange?.(item.id, Number(event.target.value))}
                      className="tm-input w-20"
                    />
                  </div>
                ) : null}
                {showNotes ? (
                  <div className="space-y-2">
                    <span className="text-xs tm-screen-muted">{copy.note}</span>
                    <textarea
                      value={noteValue}
                      onChange={(event) => onNoteChange?.(item.id, event.target.value)}
                      className="tm-input"
                      rows={2}
                      placeholder={copy.notePlaceholder}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button onClick={onAdd} className="tm-button tm-button-steel">
            {addLabel}
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="tm-button tm-button-ghost"
              disabled={saving}
            >
              {copy.cancel}
            </button>
            <button
              onClick={onSave}
              className="tm-button tm-button-primary"
              disabled={saving}
            >
              {saving ? copy.saving : copy.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkillsPage() {
  const { locale } = useLocale();
  const copy = SKILLS_COPY[locale];
  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [characteristics, setCharacteristics] = useState<StatItem[]>([]);
  const [skills, setSkills] = useState<StatItem[]>([]);
  const [goals, setGoals] = useState<SkillsGoalsState>({
    characteristics: {},
    skills: {}
  });
  const [notes, setNotes] = useState<SkillsNotesState>({
    characteristics: {},
    skills: {}
  });
  const [snapshots, setSnapshots] = useState<SkillsSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftSegments, setDraftSegments] = useState<WheelSegment[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingCharacteristics, setEditingCharacteristics] = useState(false);
  const [editingSkills, setEditingSkills] = useState(false);
  const [draftCharacteristics, setDraftCharacteristics] = useState<StatItem[]>([]);
  const [draftSkills, setDraftSkills] = useState<StatItem[]>([]);
  const [draftGoalCharacteristics, setDraftGoalCharacteristics] = useState<Record<string, number>>({});
  const [draftGoalSkills, setDraftGoalSkills] = useState<Record<string, number>>({});
  const [draftNotesCharacteristics, setDraftNotesCharacteristics] = useState<Record<string, string>>({});
  const [draftNotesSkills, setDraftNotesSkills] = useState<Record<string, string>>({});
  const [expandedCharacteristicId, setExpandedCharacteristicId] = useState<string | null>(null);
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const wheelEditorReturnFocusRef = useRef<HTMLElement | null>(null);
  const wheelEditorTitleId = 'tm-skills-wheel-editor-title';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [
        storedWheel,
        storedStats,
        storedGoals,
        storedNotes,
        storedHistory
      ] = await Promise.all([
        getAppMetaValue<BalanceWheelState>(WHEEL_META_KEY),
        getAppMetaValue<SkillsStatsState>(STATS_META_KEY),
        getAppMetaValue<SkillsGoalsState>(GOALS_META_KEY),
        getAppMetaValue<SkillsNotesState>(NOTES_META_KEY),
        getAppMetaValue<SkillsSnapshotsState>(HISTORY_META_KEY)
      ]);
      const nextSegments = storedWheel?.segments?.length
        ? normalizeSegments(storedWheel.segments, copy.fallbackSegment, locale)
        : buildDefaultSegments(locale);
      const defaultCharacteristics = buildDefaultCharacteristics(locale);
      const defaultSkills = buildDefaultSkills(locale);
      const nextCharacteristics = storedStats?.characteristics
        ? normalizeStats(
            storedStats.characteristics,
            defaultCharacteristics,
            MAX_CHARACTERISTIC,
            copy.fallbackCharacteristic
          )
        : defaultCharacteristics;
      const nextSkills = storedStats?.skills
        ? normalizeStats(storedStats.skills, defaultSkills, MAX_SKILL, copy.fallbackSkill)
        : defaultSkills;
      setSegments(nextSegments);
      setCharacteristics(nextCharacteristics);
      setSkills(nextSkills);
      const nextGoals = {
        characteristics: storedGoals?.characteristics ?? {},
        skills: storedGoals?.skills ?? {}
      };
      setGoals(nextGoals);
      const nextNotes = {
        characteristics: storedNotes?.characteristics ?? {},
        skills: storedNotes?.skills ?? {}
      };
      setNotes(nextNotes);
      setSnapshots(
        Array.isArray(storedHistory?.snapshots)
          ? storedHistory.snapshots.slice(0, MAX_SNAPSHOTS)
          : []
      );
      setLoading(false);
    };
    load();
  }, [copy.fallbackCharacteristic, copy.fallbackSegment, copy.fallbackSkill, locale]);

  useEffect(() => {
    if (!editing || typeof document === 'undefined') return;
    wheelEditorReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      wheelEditorReturnFocusRef.current?.focus();
      wheelEditorReturnFocusRef.current = null;
    };
  }, [editing]);

  useEffect(() => {
    if (!editing || saving || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEditor();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editing, saving]);

  const coloredSegments = useMemo(() => {
    return segments.map((segment, index) => {
      const loweredName = segment.name.toLowerCase();
      const overrideColor =
        loweredName.includes('программ') || loweredName.includes('program')
          ? '#3f6b4b'
          : undefined;
      return {
        ...segment,
        color: overrideColor ?? WHEEL_COLORS[index % WHEEL_COLORS.length]
      };
    });
  }, [segments]);

  const wheelGeometry = useMemo(() => {
    const size = 560;
    const center = size / 2;
    const radius = 270;
    const labelRadius = 168;
    const valueRadius = 240;
    return { size, center, radius, labelRadius, valueRadius };
  }, []);

  const openEditor = () => {
    if (loading) return;
      const baseSegments = segments.length ? segments : buildDefaultSegments(locale);
    setDraftSegments(baseSegments.map((segment) => ({ ...segment })));
    setEditing(true);
  };

  const openCharacteristicsEditor = () => {
    if (loading) return;
    const baseItems = characteristics.length ? characteristics : buildDefaultCharacteristics(locale);
    setDraftCharacteristics(baseItems.map((item) => ({ ...item })));
    setDraftGoalCharacteristics(buildGoalMap(baseItems, goals.characteristics, MAX_CHARACTERISTIC));
    setDraftNotesCharacteristics(buildNotesMap(baseItems, notes.characteristics));
    setEditingCharacteristics(true);
  };

  const openSkillsEditor = () => {
    if (loading) return;
    const baseItems = skills.length ? skills : buildDefaultSkills(locale);
    setDraftSkills(baseItems.map((item) => ({ ...item })));
    setDraftGoalSkills(buildGoalMap(baseItems, goals.skills, MAX_SKILL));
    setDraftNotesSkills(buildNotesMap(baseItems, notes.skills));
    setEditingSkills(true);
  };

  const toggleCharacteristicNote = (id: string) => {
    setExpandedCharacteristicId((prev) => (prev === id ? null : id));
  };

  const toggleSkillNote = (id: string) => {
    setExpandedSkillId((prev) => (prev === id ? null : id));
  };

  const closeEditor = () => {
    setEditing(false);
    setDraftSegments([]);
  };

  const closeCharacteristicsEditor = () => {
    setEditingCharacteristics(false);
    setDraftCharacteristics([]);
    setDraftGoalCharacteristics({});
    setDraftNotesCharacteristics({});
  };

  const closeSkillsEditor = () => {
    setEditingSkills(false);
    setDraftSkills([]);
    setDraftGoalSkills({});
    setDraftNotesSkills({});
  };

  const updateDraft = (id: string, patch: Partial<WheelSegment>) => {
    setDraftSegments((prev) =>
      prev.map((segment) => (segment.id === id ? { ...segment, ...patch } : segment))
    );
  };

  const updateDraftCharacteristics = (id: string, patch: Partial<StatItem>) => {
    setDraftCharacteristics((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateDraftSkills = (id: string, patch: Partial<StatItem>) => {
    setDraftSkills((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const updateDraftGoalCharacteristic = (id: string, value: number) => {
    setDraftGoalCharacteristics((prev) => ({ ...prev, [id]: value }));
  };

  const updateDraftGoalSkill = (id: string, value: number) => {
    setDraftGoalSkills((prev) => ({ ...prev, [id]: value }));
  };

  const updateDraftNoteCharacteristic = (id: string, value: string) => {
    setDraftNotesCharacteristics((prev) => ({ ...prev, [id]: value }));
  };

  const updateDraftNoteSkill = (id: string, value: string) => {
    setDraftNotesSkills((prev) => ({ ...prev, [id]: value }));
  };

  const removeDraft = (id: string) => {
    setDraftSegments((prev) => (prev.length > 1 ? prev.filter((seg) => seg.id !== id) : prev));
  };

  const removeDraftCharacteristic = (id: string) => {
    setDraftCharacteristics((prev) => (prev.length > 1 ? prev.filter((seg) => seg.id !== id) : prev));
    setDraftGoalCharacteristics((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    setDraftNotesCharacteristics((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const removeDraftSkill = (id: string) => {
    setDraftSkills((prev) => (prev.length > 1 ? prev.filter((seg) => seg.id !== id) : prev));
    setDraftGoalSkills((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
    setDraftNotesSkills((prev) => {
      const { [id]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const addDraft = () => {
    setDraftSegments((prev) => [
      ...prev,
      { id: generateId(), name: copy.newSegment, score: DEFAULT_SCORE }
    ]);
  };

  const addCharacteristic = () => {
    const id = generateId();
    setDraftCharacteristics((prev) => [
      ...prev,
      { id, name: copy.newCharacteristic, value: DEFAULT_CHARACTERISTIC_VALUE }
    ]);
    setDraftGoalCharacteristics((prev) => ({
      ...prev,
      [id]: MAX_CHARACTERISTIC
    }));
  };

  const addSkill = () => {
    const id = generateId();
    setDraftSkills((prev) => [
      ...prev,
      { id, name: copy.newSkill, value: DEFAULT_SKILL_VALUE }
    ]);
    setDraftGoalSkills((prev) => ({
      ...prev,
      [id]: MAX_SKILL
    }));
  };

  const saveDraft = async () => {
    setSaving(true);
    const normalized = normalizeSegments(draftSegments, copy.fallbackSegment, locale);
    await setAppMetaValue(WHEEL_META_KEY, { segments: normalized });
    setSegments(normalized);
    setSaving(false);
    closeEditor();
  };

  const saveCharacteristics = async () => {
    setSaving(true);
    const normalizedCharacteristics = normalizeStats(
      draftCharacteristics,
      buildDefaultCharacteristics(locale),
      MAX_CHARACTERISTIC,
      copy.fallbackCharacteristic
    );
    const normalizedSkills = normalizeStats(
      skills,
      buildDefaultSkills(locale),
      MAX_SKILL,
      copy.fallbackSkill
    );
    const nextGoals = {
      characteristics: buildGoalMap(
        normalizedCharacteristics,
        draftGoalCharacteristics,
        MAX_CHARACTERISTIC
      ),
      skills: buildGoalMap(skills, goals.skills, MAX_SKILL)
    };
    const nextNotes = {
      characteristics: buildNotesMap(normalizedCharacteristics, draftNotesCharacteristics),
      skills: buildNotesMap(skills, notes.skills)
    };
    await setAppMetaValue(STATS_META_KEY, {
      characteristics: normalizedCharacteristics,
      skills: normalizedSkills
    });
    await setAppMetaValue(GOALS_META_KEY, nextGoals);
    await setAppMetaValue(NOTES_META_KEY, nextNotes);
    setCharacteristics(normalizedCharacteristics);
    setSkills(normalizedSkills);
    setGoals(nextGoals);
    setNotes(nextNotes);
    setSaving(false);
    closeCharacteristicsEditor();
  };

  const saveSkills = async () => {
    setSaving(true);
    const normalizedCharacteristics = normalizeStats(
      characteristics,
      buildDefaultCharacteristics(locale),
      MAX_CHARACTERISTIC,
      copy.fallbackCharacteristic
    );
    const normalizedSkills = normalizeStats(
      draftSkills,
      buildDefaultSkills(locale),
      MAX_SKILL,
      copy.fallbackSkill
    );
    const nextGoals = {
      characteristics: buildGoalMap(characteristics, goals.characteristics, MAX_CHARACTERISTIC),
      skills: buildGoalMap(normalizedSkills, draftGoalSkills, MAX_SKILL)
    };
    const nextNotes = {
      characteristics: buildNotesMap(characteristics, notes.characteristics),
      skills: buildNotesMap(normalizedSkills, draftNotesSkills)
    };
    await setAppMetaValue(STATS_META_KEY, {
      characteristics: normalizedCharacteristics,
      skills: normalizedSkills
    });
    await setAppMetaValue(GOALS_META_KEY, nextGoals);
    await setAppMetaValue(NOTES_META_KEY, nextNotes);
    setCharacteristics(normalizedCharacteristics);
    setSkills(normalizedSkills);
    setGoals(nextGoals);
    setNotes(nextNotes);
    setSaving(false);
    closeSkillsEditor();
  };

  const takeSnapshot = async () => {
    if (loading) return;
    const snapshot: SkillsSnapshot = {
      id: generateId(),
      createdAt: new Date().toISOString(),
      segments: segments.map((segment) => ({ ...segment })),
      characteristics: characteristics.map((stat) => ({ ...stat })),
      skills: skills.map((skill) => ({ ...skill }))
    };
    const nextSnapshots = [snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS);
    setSnapshots(nextSnapshots);
    await setAppMetaValue(HISTORY_META_KEY, { snapshots: nextSnapshots });
  };

  const deleteSnapshot = async (id: string) => {
    const nextSnapshots = snapshots.filter((snapshot) => snapshot.id !== id);
    setSnapshots(nextSnapshots);
    await setAppMetaValue(HISTORY_META_KEY, { snapshots: nextSnapshots });
  };

  const segmentAngle = coloredSegments.length ? 360 / coloredSegments.length : 0;
  const balanceAverage = useMemo(() => getAverageScore(segments), [segments]);
  const weakestSegments = useMemo(() => getLowestSegments(segments, 2), [segments]);
  const balancePercent = Math.min(100, Math.max(0, (balanceAverage / MAX_SCORE) * 100));
  const weakestLabels = weakestSegments.map((segment) => segment.name);
  const balanceDisplay = loading ? '--' : `${balanceAverage.toFixed(1)}/${MAX_SCORE}`;
  const segmentsDisplay = loading ? '--' : `${segments.length}`;
  const snapshotsDisplay = loading ? '--' : `${snapshots.length}`;

  return (
    <div className="min-h-screen">
      <div className="tm-skills-shell">
        <div className="tm-frame tm-reveal tm-skills-frame space-y-4 p-1 sm:p-2">
          <header className="tm-skills-header">
            <div className="tm-skills-header-title">
              <p className="tm-eyebrow">{copy.eyebrow}</p>
              <h1 className="text-3xl font-semibold tm-title">{copy.title}</h1>
              <p className="tm-label tm-skills-subtitle">{copy.subtitle}</p>
            </div>
            <div className="tm-skills-header-controls">
              <div className="tm-screen tm-skills-meta">
                <div className="tm-skills-meta-item">
                  <span className="tm-skills-meta-label">{copy.meta.balance}</span>
                  <span className="tm-skills-meta-value">{balanceDisplay}</span>
                </div>
                <div className="tm-skills-meta-item">
                  <span className="tm-skills-meta-label">{copy.meta.areas}</span>
                  <span className="tm-skills-meta-value">{segmentsDisplay}</span>
                </div>
                <div className="tm-skills-meta-item">
                  <span className="tm-skills-meta-label">{copy.meta.snapshots}</span>
                  <span className="tm-skills-meta-value">{snapshotsDisplay}</span>
                </div>
              </div>
            </div>
          </header>

          <div className="tm-skills-grid">
            <div className="tm-panel tm-surface-elevated tm-reveal tm-reveal-delay-1 tm-skills-panel tm-skills-panel-center p-1 sm:p-2">
              <div className="tm-skills-panel-header">
                <h2 className="text-lg font-semibold tm-title">{copy.wheelTitle}</h2>
              </div>
              <div className="tm-screen tm-wheel-screen">
                <div
                  className="tm-wheel"
                  onClick={openEditor}
                  role="button"
                  tabIndex={0}
                  aria-label={copy.editWheelAria}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openEditor();
                    }
                  }}
                >
                  {loading ? (
                    <p className="tm-screen-muted">{copy.loading}</p>
                  ) : (
                    <svg
                      viewBox={`0 0 ${wheelGeometry.size} ${wheelGeometry.size}`}
                      className="tm-wheel-svg"
                      aria-hidden="true"
                    >
                      {[2, 4, 6, 8, 10].map((value) => (
                        <circle
                          key={`ring-${value}`}
                          className="tm-wheel-ring"
                          cx={wheelGeometry.center}
                          cy={wheelGeometry.center}
                          r={(wheelGeometry.radius * value) / MAX_SCORE}
                        />
                      ))}
                      {coloredSegments.map((segment, index) => {
                        const startAngle = -90 + index * segmentAngle;
                        const endAngle = startAngle + segmentAngle;
                        const basePath = describeWedge(
                          wheelGeometry.center,
                          wheelGeometry.center,
                          wheelGeometry.radius,
                          startAngle,
                          endAngle
                        );
                        const filledRadius =
                          wheelGeometry.radius * (clampScore(segment.score) / MAX_SCORE);
                        const filledPath =
                          filledRadius > 0
                            ? describeWedge(
                                wheelGeometry.center,
                                wheelGeometry.center,
                                filledRadius,
                                startAngle,
                                endAngle
                              )
                            : null;
                        const midAngle = startAngle + segmentAngle / 2;
                        const labelPos = polarToCartesian(
                          wheelGeometry.center,
                          wheelGeometry.center,
                          wheelGeometry.labelRadius,
                          midAngle
                        );
                        const valuePos = polarToCartesian(
                          wheelGeometry.center,
                          wheelGeometry.center,
                          wheelGeometry.valueRadius,
                          midAngle
                        );
                        const labelLines = splitWheelLabel(segment.name);
                        const firstLineOffset = -((labelLines.length - 1) * 10);
                        return (
                          <g key={segment.id}>
                            <path
                              d={basePath}
                              className="tm-wheel-segment"
                              style={{ fill: segment.color }}
                            />
                            {filledPath ? (
                              <path
                                d={filledPath}
                                className="tm-wheel-fill"
                                style={{ fill: segment.color }}
                              />
                            ) : null}
                            <line
                              className="tm-wheel-divider"
                              x1={wheelGeometry.center}
                              y1={wheelGeometry.center}
                              x2={polarToCartesian(
                                wheelGeometry.center,
                                wheelGeometry.center,
                                wheelGeometry.radius,
                                startAngle
                              ).x}
                              y2={polarToCartesian(
                                wheelGeometry.center,
                                wheelGeometry.center,
                                wheelGeometry.radius,
                                startAngle
                              ).y}
                            />
                            {segment.score > 0 ? (
                              <text
                                className="tm-wheel-value"
                                x={valuePos.x}
                                y={valuePos.y}
                                textAnchor="middle"
                                dominantBaseline="middle"
                              >
                                {clampScore(segment.score)}
                              </text>
                            ) : null}
                            <text
                              className="tm-wheel-label"
                              x={labelPos.x}
                              y={labelPos.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                            >
                              {labelLines.map((line, lineIndex) => (
                                <tspan
                                  key={`${segment.id}-label-${lineIndex}`}
                                  x={labelPos.x}
                                  dy={lineIndex === 0 ? firstLineOffset : 22}
                                >
                                  {line}
                                </tspan>
                              ))}
                            </text>
                          </g>
                        );
                      })}
                      <circle
                        className="tm-wheel-center"
                        cx={wheelGeometry.center}
                        cy={wheelGeometry.center}
                        r={6}
                      />
                    </svg>
                  )}
                </div>
                {!loading ? (
                  <div className="tm-wheel-legend">
                    {coloredSegments.map((segment) => {
                      const legendStyle: CSSProperties = {
                        '--tm-legend-color': segment.color,
                        '--tm-legend-fill': `${(clampScore(segment.score) / MAX_SCORE) * 100}%`
                      } as CSSProperties;
                      return (
                        <div
                          key={`${segment.id}-legend`}
                          className="tm-wheel-legend-item"
                          style={legendStyle}
                        >
                          <span
                            className="tm-wheel-legend-dot"
                            style={{ backgroundColor: segment.color }}
                          />
                          <span className="tm-wheel-legend-name">{segment.name}</span>
                          <span className="tm-wheel-legend-score">
                            {clampScore(segment.score)}/{MAX_SCORE}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>

          <div
            className="tm-panel tm-panel-clickable tm-surface-interactive tm-reveal tm-reveal-delay-2 tm-skills-panel tm-skills-panel-left p-4"
            onClick={openCharacteristicsEditor}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openCharacteristicsEditor();
              }
            }}
          >
            <div className="tm-skills-panel-header">
              <h2 className="text-lg font-semibold tm-title">{copy.characteristicsTitle}</h2>
            </div>
            <div className="tm-screen tm-skills-screen">
              {loading ? (
                <p className="tm-screen-muted">{copy.loading}</p>
              ) : (
                <div className="tm-stat-list">
                  {characteristics.map((stat) => {
                    const clamped = clampValue(stat.value, MAX_CHARACTERISTIC);
                    const goal = clampValue(
                      goals.characteristics[stat.id] ?? MAX_CHARACTERISTIC,
                      MAX_CHARACTERISTIC
                    );
                    const percent = `${(clamped / MAX_CHARACTERISTIC) * 100}%`;
                    const goalPercent = `${(goal / MAX_CHARACTERISTIC) * 100}%`;
                    const style = {
                      '--tm-meter-percent': percent,
                      '--tm-goal-percent': goalPercent
                    } as CSSProperties;
                    const note = notes.characteristics[stat.id]?.trim();
                    return (
                      <div key={stat.id} className="tm-stat-row-group">
                        <div className="tm-stat-row">
                          <button
                            type="button"
                            className="tm-stat-label tm-stat-label-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleCharacteristicNote(stat.id);
                            }}
                            aria-expanded={expandedCharacteristicId === stat.id}
                          >
                            {stat.name}
                          </button>
                          <div className="tm-stat-meter" style={style}>
                            <div className="tm-stat-meter-fill" />
                          </div>
                          <span className="tm-stat-value">{clamped}</span>
                        </div>
                        {expandedCharacteristicId === stat.id ? (
                          <div
                            className="tm-stat-note"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {note || copy.noNotes}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div
            className="tm-panel tm-panel-clickable tm-surface-interactive tm-reveal tm-reveal-delay-3 tm-skills-panel tm-skills-panel-right p-4"
            onClick={openSkillsEditor}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openSkillsEditor();
              }
            }}
          >
            <div className="tm-skills-panel-header">
              <h2 className="text-lg font-semibold tm-title">{copy.skillsTitle}</h2>
            </div>
            <div className="tm-screen tm-skills-screen">
              {loading ? (
                <p className="tm-screen-muted">{copy.loading}</p>
              ) : (
                <div className="tm-stat-list">
                  {skills.map((skill) => {
                    const clamped = clampValue(skill.value, MAX_SKILL);
                    const goal = clampValue(goals.skills[skill.id] ?? MAX_SKILL, MAX_SKILL);
                    const style = {
                      '--tm-meter-percent': `${clamped}%`,
                      '--tm-goal-percent': `${goal}%`
                    } as CSSProperties;
                    const note = notes.skills[skill.id]?.trim();
                    return (
                      <div key={skill.id} className="tm-stat-row-group">
                        <div className="tm-stat-row">
                          <button
                            type="button"
                            className="tm-stat-label tm-stat-label-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleSkillNote(skill.id);
                            }}
                            aria-expanded={expandedSkillId === skill.id}
                          >
                            {skill.name}
                          </button>
                          <div className="tm-stat-meter tm-stat-meter-skills tm-progress-skill" style={style}>
                            <div className="tm-stat-meter-fill" />
                          </div>
                          <span className="tm-stat-value">{clamped}%</span>
                        </div>
                        {expandedSkillId === skill.id ? (
                          <div
                            className="tm-stat-note"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {note || copy.noNotes}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </div>
          <div className="tm-skills-secondary">
              <div className="tm-panel tm-surface-elevated tm-reveal tm-skills-panel p-4">
                <div className="tm-skills-panel-header">
                  <h2 className="text-lg font-semibold tm-title">{copy.balanceIndexTitle}</h2>
                </div>
                <div className="tm-screen tm-skills-screen">
                  {loading ? (
                    <p className="tm-screen-muted">{copy.loading}</p>
                  ) : (
                    <div className="tm-balance-index">
                      <div className="tm-balance-score">
                        {balanceAverage.toFixed(1)}/{MAX_SCORE}
                      </div>
                      <div
                        className="tm-stat-meter"
                        style={{ '--tm-meter-percent': `${balancePercent}%` } as CSSProperties}
                      >
                        <div className="tm-stat-meter-fill" />
                      </div>
                      <p className="tm-balance-meta">
                        {weakestLabels.length
                          ? copy.weakest(weakestLabels.join(', '))
                          : copy.noWeakest}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="tm-panel tm-surface-elevated tm-reveal tm-skills-panel p-4">
                <div className="tm-skills-panel-header tm-history-header">
                  <h2 className="text-lg font-semibold tm-title">{copy.historyTitle}</h2>
                  <button
                    onClick={takeSnapshot}
                    className="tm-button tm-button-gold tm-button-sm"
                  >
                    {copy.takeSnapshot}
                  </button>
                </div>
                <div className="tm-screen tm-skills-screen">
                  <p className="text-sm tm-screen-muted">
                    {copy.historyHint}
                  </p>
                  {loading ? (
                    <p className="tm-screen-muted">{copy.loading}</p>
                  ) : snapshots.length === 0 ? (
                    <p className="tm-screen-muted">{copy.noSnapshots}</p>
                  ) : (
                    <div className="tm-history-list">
                      {snapshots.map((snapshot) => {
                        const average = getAverageScore(snapshot.segments);
                        const weakest = getLowestSegments(snapshot.segments, 2)
                          .map((segment) => segment.name)
                          .join(', ');
                        return (
                          <div key={snapshot.id} className="tm-history-row">
                            <div>
                              <p className="tm-history-date">
                                {formatSnapshotDate(snapshot.createdAt, copy.dateLocale)}
                              </p>
                              <p className="tm-history-meta">
                                {copy.index}: {average.toFixed(1)}/{MAX_SCORE}
                                {weakest ? ` · ${copy.weak}: ${weakest}` : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteSnapshot(snapshot.id)}
                              className="tm-button tm-button-danger tm-button-sm"
                            >
                              {copy.delete}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center px-4">
          <div
            className="w-full max-w-3xl tm-panel p-6 shadow-xl space-y-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby={wheelEditorTitleId}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={wheelEditorTitleId} className="text-xl font-semibold tm-title">{copy.editWheelTitle}</h2>
              <button onClick={closeEditor} className="tm-button tm-button-ghost">
                {copy.close}
              </button>
            </div>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {draftSegments.map((segment) => (
                <div key={segment.id} className="tm-panel-soft p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={segment.name}
                      onChange={(event) =>
                        updateDraft(segment.id, { name: event.target.value })
                      }
                      className="tm-input flex-1 min-w-[180px]"
                      placeholder={copy.segmentNamePlaceholder}
                    />
                    <button
                      onClick={() => removeDraft(segment.id)}
                      className="tm-button tm-button-danger tm-button-sm"
                      disabled={draftSegments.length <= 1}
                    >
                      {copy.delete}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={MAX_SCORE}
                      step={1}
                      value={segment.score}
                      onChange={(event) =>
                        updateDraft(segment.id, { score: Number(event.target.value) })
                      }
                      className="tm-range flex-1"
                    />
                    <input
                      type="number"
                      min={0}
                      max={MAX_SCORE}
                      value={segment.score}
                      onChange={(event) =>
                        updateDraft(segment.id, { score: Number(event.target.value) })
                      }
                      className="tm-input w-20"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button onClick={addDraft} className="tm-button tm-button-steel">
                {copy.addSegment}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeEditor}
                  className="tm-button tm-button-ghost"
                  disabled={saving}
                >
                  {copy.cancel}
                </button>
                <button
                  onClick={saveDraft}
                  className="tm-button tm-button-primary"
                  disabled={saving}
                >
                  {saving ? copy.saving : copy.save}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <StatsEditorModal
        open={editingCharacteristics}
        title={copy.editCharacteristicsTitle}
        copy={copy}
        items={draftCharacteristics}
        maxValue={MAX_CHARACTERISTIC}
        goals={draftGoalCharacteristics}
        maxGoal={MAX_CHARACTERISTIC}
        notes={draftNotesCharacteristics}
        addLabel={copy.addCharacteristic}
        onAdd={addCharacteristic}
        onRemove={removeDraftCharacteristic}
        onUpdate={updateDraftCharacteristics}
        onGoalChange={updateDraftGoalCharacteristic}
        onNoteChange={updateDraftNoteCharacteristic}
        onClose={closeCharacteristicsEditor}
        onSave={saveCharacteristics}
        saving={saving}
      />

      <StatsEditorModal
        open={editingSkills}
        title={copy.editSkillsTitle}
        copy={copy}
        items={draftSkills}
        maxValue={MAX_SKILL}
        goals={draftGoalSkills}
        maxGoal={MAX_SKILL}
        notes={draftNotesSkills}
        addLabel={copy.addSkill}
        onAdd={addSkill}
        onRemove={removeDraftSkill}
        onUpdate={updateDraftSkills}
        onGoalChange={updateDraftGoalSkill}
        onNoteChange={updateDraftNoteSkill}
        onClose={closeSkillsEditor}
        onSave={saveSkills}
        saving={saving}
      />
    </div>
  );
}
