import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '../entities/project/types';
import type {
  AllowedWeekday,
  Periodicity,
  Rarity,
  Task,
  TaskBucket,
  TaskChecklistItem
} from '../entities/task/types';
import {
  WEEKDAY_LABELS_SHORT,
  WEEKDAY_WEEKENDS,
  WEEKDAY_WORKDAYS,
  formatAllowedWeekdaysLabel,
  normalizeAllowedWeekdays
} from '../entities/task/weekdays';
import { createProject } from '../services/projectsService';
import { createTask, updateTask } from '../services/tasksService';
import { showAppAlert } from './AppDialog';

const MAX_TASK_TITLE_LENGTH = 120;
const PROGRESS_STEP = 5;
const NEW_PROJECT_OPTION_VALUE = '__new__';

const TODAY_QUEUE_TABS: TaskBucket[] = ['today', 'inbox', 'next', 'backlog'];

const QUEUE_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  inbox: 'Inbox',
  next: 'Next',
  backlog: 'Backlog'
};

const PERIODICITY_LABELS: Record<Periodicity, string> = {
  daily: 'Ежедневно',
  weekly: 'Раз в неделю',
  'one-time': 'Разово',
  monthly: 'Раз в месяц',
  yearly: 'Раз в год'
};

const clampProgressValue = (value: number) => Math.min(100, Math.max(0, value));

const normalizeProgressValue = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  const clamped = clampProgressValue(value);
  return Math.round(clamped / PROGRESS_STEP) * PROGRESS_STEP;
};

const getPortalThemeClassName = () => {
  if (typeof document === 'undefined') return '';
  const appRoot = document.querySelector('.tm-app');
  if (appRoot?.classList.contains('tm-theme-classic')) return 'tm-theme-classic';
  if (appRoot?.classList.contains('tm-theme-hud')) return 'tm-theme-hud';
  return appRoot?.classList.contains('tm-theme-handwritten') ? 'tm-theme-handwritten' : '';
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

const parseIsoDate = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
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
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
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

const splitSkillTagsInput = (value: string) => {
  const parts = value.split(',');
  const currentRaw = parts[parts.length - 1] ?? '';
  const prefixTokens = parts
    .slice(0, -1)
    .map((part) => part.trim())
    .filter(Boolean);
  return { current: currentRaw.trim(), prefixTokens };
};

const weekdaySelectionsEqual = (
  left: readonly AllowedWeekday[] | undefined,
  right: readonly AllowedWeekday[]
) =>
  Boolean(
    left &&
      left.length === right.length &&
      right.every((weekday, index) => left[index] === weekday)
  );

function TaskProgressControls({
  value,
  onChange,
  disabled
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <input
        type="range"
        min={0}
        max={100}
        step={PROGRESS_STEP}
        value={value}
        onChange={(event) => onChange(normalizeProgressValue(Number(event.target.value)))}
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
          onChange={(event) => onChange(normalizeProgressValue(Number(event.target.value)))}
          className="tm-input w-24 text-sm"
          disabled={disabled}
        />
        <span className="text-xs">%</span>
      </div>
    </div>
  );
}

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
    <div className="tm-weekday-selector space-y-2">
      <div className="tm-weekday-selector-head flex items-center justify-between gap-3">
        <label className="block text-sm tm-label">Дни выполнения</label>
        <span className="text-xs text-amber-200/70">
          {formatAllowedWeekdaysLabel(normalizedValue)}
        </span>
      </div>
      <div className="tm-weekday-quick-row flex flex-wrap gap-2">
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
      <div className="tm-weekday-buttons flex flex-wrap gap-2">
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
      <p className="tm-weekday-hint text-xs text-amber-200/70">
        Оставь без выбора, если задачу можно делать в любой день.
      </p>
    </div>
  );
}

type TaskEditorMode = 'create' | 'edit';
type EditorChip = 'project' | 'repeat' | 'checklist' | 'deadline' | 'progress' | 'skills' | 'comment';

const EDITOR_CHIP_LABELS: Record<EditorChip, string> = {
  project: 'Проект',
  repeat: 'Повтор',
  checklist: 'Чеклист',
  deadline: 'Срок',
  progress: 'Прогресс',
  skills: 'Навыки',
  comment: 'Коммент'
};

export function TaskEditorModal({
  open,
  mode,
  task,
  onClose,
  onSaved,
  projects,
  skillOptions = [],
  modalTitle,
  defaultBucket = 'inbox',
  contextProject
}: {
  open: boolean;
  mode: TaskEditorMode;
  task?: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  projects: Project[];
  skillOptions?: string[];
  modalTitle?: string;
  defaultBucket?: TaskBucket;
  contextProject?: Project | null;
}) {
  const isEditMode = mode === 'edit';
  const activeTask = task ?? null;
  const [title, setTitle] = useState('');
  const [bucket, setBucket] = useState<TaskBucket>(defaultBucket);
  const [rarity, setRarity] = useState<Rarity>('common');
  const [periodicity, setPeriodicity] = useState<Periodicity>('one-time');
  const [quotaCount, setQuotaCount] = useState('');
  const [quotaPer, setQuotaPer] = useState<'week' | 'month'>('week');
  const [value, setValue] = useState(5);
  const [comment, setComment] = useState('');
  const [checklistDraft, setChecklistDraft] = useState<TaskChecklistItem[]>([]);
  const [checklistAddInput, setChecklistAddInput] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [reminderInput, setReminderInput] = useState('');
  const [progressEnabled, setProgressEnabled] = useState(false);
  const [progressValue, setProgressValue] = useState(0);
  const [allowedWeekdays, setAllowedWeekdays] = useState<AllowedWeekday[] | undefined>(undefined);
  const [skillTagsInput, setSkillTagsInput] = useState('');
  const [projectSelection, setProjectSelection] = useState('');
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeChip, setActiveChip] = useState<EditorChip | null>(null);
  const savingRef = useRef(false);
  const portalThemeClassName = getPortalThemeClassName();

  useEffect(() => {
    if (!open) return;
    if (isEditMode && activeTask) {
      setTitle(activeTask.title);
      setBucket(activeTask.bucket);
      setRarity(activeTask.rarity);
      setPeriodicity(activeTask.periodicity);
      setQuotaCount(
        typeof activeTask.quota?.count === 'number' && activeTask.quota.count > 0
          ? String(activeTask.quota.count)
          : ''
      );
      setQuotaPer(activeTask.quota?.per === 'month' ? 'month' : 'week');
      setValue(
        Math.min(10, Math.max(1, typeof activeTask.xpOverride === 'number' ? activeTask.xpOverride : 5))
      );
      setComment(activeTask.comment ?? '');
      const sortedChecklist = Array.isArray(activeTask.checklist)
        ? [...activeTask.checklist].sort((left, right) => left.order - right.order)
        : [];
      setChecklistDraft(
        sortedChecklist.map((item, index) => ({
          ...item,
          order: index
        }))
      );
      setChecklistAddInput('');
      const deadlineDate = parseIsoDate(activeTask.deadline);
      setDeadlineInput(deadlineDate ? toLocalInputValue(deadlineDate) : '');
      setReminderInput(
        typeof activeTask.reminder?.offsetMinutes === 'number'
          ? String(activeTask.reminder.offsetMinutes)
          : ''
      );
      setProgressEnabled(Boolean(activeTask.progressEnabled));
      setProgressValue(normalizeProgressValue(activeTask.progressValue ?? 0));
      setAllowedWeekdays(normalizeAllowedWeekdays(activeTask.allowedWeekdays));
      setSkillTagsInput(activeTask.skillTags?.join(', ') ?? '');
      setProjectSelection(contextProject?.id ?? activeTask.projectId ?? '');
      setNewProjectTitle('');
      setNewProjectDescription('');
      setSaving(false);
      setActiveChip(() => {
        if (Array.isArray(activeTask.checklist) && activeTask.checklist.length > 0) return 'checklist';
        if (activeTask.deadline || activeTask.reminder) return 'deadline';
        if (activeTask.progressEnabled) return 'progress';
        if (activeTask.skillTags?.length) return 'skills';
        if (activeTask.comment?.trim()) return 'comment';
        if (!contextProject && activeTask.projectId) return 'project';
        if (
          activeTask.periodicity !== 'one-time' ||
          activeTask.quota ||
          normalizeAllowedWeekdays(activeTask.allowedWeekdays)
        ) {
          return 'repeat';
        }
        return null;
      });
      savingRef.current = false;
      return;
    }

    setTitle('');
    setBucket(defaultBucket);
    setRarity('common');
    setPeriodicity('one-time');
    setQuotaCount('');
    setQuotaPer('week');
    setValue(5);
    setComment('');
    setChecklistDraft([]);
    setChecklistAddInput('');
    setDeadlineInput('');
    setReminderInput('');
    setProgressEnabled(false);
    setProgressValue(0);
    setAllowedWeekdays(undefined);
    setSkillTagsInput('');
    setProjectSelection(contextProject?.id ?? '');
    setNewProjectTitle('');
    setNewProjectDescription('');
    setSaving(false);
    setActiveChip(null);
    savingRef.current = false;
  }, [activeTask, contextProject?.id, defaultBucket, isEditMode, open]);

  if (!open) return null;
  if (isEditMode && !activeTask) return null;

  const projectOptions = projects.filter((project) => project.status !== 'archived');
  const resolvedTitle =
    modalTitle ?? (isEditMode ? 'Редактировать задачу' : 'Новая задача');

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

  const resolveProjectId = async () => {
    if (contextProject) return contextProject.id;
    if (projectSelection !== NEW_PROJECT_OPTION_VALUE) {
      return projectSelection || undefined;
    }
    const trimmedProjectTitle = newProjectTitle.trim();
    if (!trimmedProjectTitle) {
      throw new Error('Введите название проекта.');
    }
    return createProject({
      title: trimmedProjectTitle,
      description: newProjectDescription.trim() ? newProjectDescription.trim() : undefined
    });
  };

  const submit = async () => {
    const trimmedTitle = title.trim().slice(0, MAX_TASK_TITLE_LENGTH);
    if (!trimmedTitle || savingRef.current) return;

    savingRef.current = true;
    setSaving(true);
    try {
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
        deadline &&
        reminderMinutes !== null &&
        Number.isFinite(reminderMinutes) &&
        reminderMinutes >= 0
          ? { offsetMinutes: Math.trunc(reminderMinutes) }
          : undefined;
      const projectId = await resolveProjectId();
      const quotaCountValue = Number(quotaCount);
      const quota =
        Number.isFinite(quotaCountValue) && quotaCountValue > 0
          ? { count: Math.trunc(quotaCountValue), per: quotaPer }
          : undefined;
      const normalizedAllowedWeekdays = normalizeAllowedWeekdays(allowedWeekdays);
      const resolvedPeriodicity =
        periodicity === 'one-time' && normalizedAllowedWeekdays ? 'daily' : periodicity;

      if (isEditMode && activeTask) {
        await updateTask({
          ...activeTask,
          title: trimmedTitle,
          bucket,
          rarity,
          periodicity: resolvedPeriodicity,
          quota,
          xpOverride,
          deadline,
          reminder,
          projectId,
          comment: commentValue ? commentValue : undefined,
          checklist: normalizedChecklist.length ? normalizedChecklist : undefined,
          skillTags: skillTags.length ? skillTags : undefined,
          allowedWeekdays: normalizedAllowedWeekdays,
          progressEnabled,
          progressValue: progressEnabled ? normalizedProgress : activeTask.progressValue
        });
      } else {
        await createTask({
          title: trimmedTitle,
          bucket,
          rarity,
          periodicity: resolvedPeriodicity,
          quota,
          xpOverride,
          deadline,
          reminder,
          projectId,
          comment: commentValue ? commentValue : undefined,
          checklist: normalizedChecklist.length ? normalizedChecklist : undefined,
          skillTags: skillTags.length ? skillTags : undefined,
          allowedWeekdays: normalizedAllowedWeekdays,
          progressEnabled,
          progressValue: progressEnabled ? normalizedProgress : undefined
        });
      }

      await onSaved();
      onClose();
    } catch (error) {
      await showAppAlert(error instanceof Error ? error.message : 'Не удалось сохранить задачу.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleAllowedWeekdaysChange = (value: AllowedWeekday[] | undefined) => {
    const normalized = normalizeAllowedWeekdays(value);
    setAllowedWeekdays(normalized);
    if (normalized && periodicity === 'one-time') {
      setPeriodicity('daily');
    }
  };

  const selectedProject = projectOptions.find((project) => project.id === projectSelection);
  const normalizedAllowedWeekdaySelection = normalizeAllowedWeekdays(allowedWeekdays);
  const effectivePeriodicity =
    periodicity === 'one-time' && normalizedAllowedWeekdaySelection ? 'daily' : periodicity;
  const skillTagCount = normalizeSkillTags(skillTagsInput).length;
  const repeatFilled =
    effectivePeriodicity !== 'one-time' ||
    quotaCount.trim().length > 0 ||
    Boolean(normalizedAllowedWeekdaySelection);
  const projectFilled =
    projectSelection === NEW_PROJECT_OPTION_VALUE
      ? newProjectTitle.trim().length > 0
      : projectSelection.length > 0;
  const checklistFilled =
    checklistDraft.length > 0 || checklistAddInput.trim().length > 0;
  const deadlineFilled =
    deadlineInput.trim().length > 0 || reminderInput.trim().length > 0;
  const progressFilled = progressEnabled;
  const skillsFilled = skillTagCount > 0;
  const commentFilled = comment.trim().length > 0;

  const editorChips: Array<{
    id: EditorChip;
    label: string;
    summary: string;
    filled: boolean;
  }> = [
    ...(!contextProject
      ? [
          {
            id: 'project' as const,
            label: EDITOR_CHIP_LABELS.project,
            summary:
              projectSelection === NEW_PROJECT_OPTION_VALUE
                ? newProjectTitle.trim() || 'Новый'
                : selectedProject?.title ?? 'Без проекта',
            filled: projectFilled
          }
        ]
      : []),
    {
      id: 'comment',
      label: EDITOR_CHIP_LABELS.comment,
      summary: commentFilled ? 'есть' : 'нет',
      filled: commentFilled
    },
    {
      id: 'repeat',
      label: EDITOR_CHIP_LABELS.repeat,
      summary: repeatFilled ? PERIODICITY_LABELS[effectivePeriodicity] : 'Разово',
      filled: repeatFilled
    },
    {
      id: 'checklist',
      label: EDITOR_CHIP_LABELS.checklist,
      summary: checklistDraft.length > 0 ? `${checklistDraft.length}` : checklistAddInput.trim() ? 'черновик' : 'нет',
      filled: checklistFilled
    },
    {
      id: 'deadline',
      label: EDITOR_CHIP_LABELS.deadline,
      summary: deadlineInput ? 'есть' : reminderInput.trim() ? 'напомнить' : 'нет',
      filled: deadlineFilled
    },
    {
      id: 'progress',
      label: EDITOR_CHIP_LABELS.progress,
      summary: progressEnabled ? `${progressValue}%` : 'нет',
      filled: progressFilled
    },
    {
      id: 'skills',
      label: EDITOR_CHIP_LABELS.skills,
      summary: skillTagCount > 0 ? `${skillTagCount}` : 'нет',
      filled: skillsFilled
    }
  ];

  const renderActiveChipPanel = () => {
    switch (activeChip) {
      case 'project':
        return contextProject ? null : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm tm-label mb-1">Проект</label>
              <select
                value={projectSelection}
                onChange={(event) => setProjectSelection(event.target.value)}
                className="tm-select"
                disabled={saving}
              >
                <option value="">Без проекта</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
                <option value={NEW_PROJECT_OPTION_VALUE}>+ Новый проект</option>
              </select>
            </div>
            {projectSelection === NEW_PROJECT_OPTION_VALUE ? (
              <div className="tm-editor-subpanel space-y-3">
                <div>
                  <label className="block text-xs tm-label mb-1">Название проекта</label>
                  <input
                    value={newProjectTitle}
                    onChange={(event) => setNewProjectTitle(event.target.value)}
                    className="tm-input"
                    placeholder="Например: Подготовка к отпуску"
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className="block text-xs tm-label mb-1">Описание проекта</label>
                  <textarea
                    value={newProjectDescription}
                    onChange={(event) => setNewProjectDescription(event.target.value)}
                    className="tm-input"
                    rows={2}
                    placeholder="Коротко: что сюда входит"
                    disabled={saving}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      case 'repeat':
        return (
          <div className="space-y-3">
            <div className="tm-editor-repeat-grid">
              <div className="sm:col-span-1">
                <label className="block text-sm tm-label mb-1">Периодичность</label>
                <select
                  value={periodicity}
                  onChange={(event) => setPeriodicity(event.target.value as Periodicity)}
                  className="tm-select"
                  disabled={saving}
                >
                  {(Object.keys(PERIODICITY_LABELS) as Periodicity[]).map((item) => (
                    <option key={item} value={item}>
                      {PERIODICITY_LABELS[item]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm tm-label mb-1">Квота</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quotaCount}
                  onChange={(event) => setQuotaCount(event.target.value)}
                  className="tm-input"
                  placeholder="Например: 3"
                  disabled={saving}
                />
              </div>
              <div>
                <label className="block text-sm tm-label mb-1">Период квоты</label>
                <select
                  value={quotaPer}
                  onChange={(event) => setQuotaPer(event.target.value as 'week' | 'month')}
                  className="tm-select"
                  disabled={saving}
                >
                  <option value="week">Неделя</option>
                  <option value="month">Месяц</option>
                </select>
              </div>
            </div>
            <WeekdaySelector
              value={allowedWeekdays}
              onChange={handleAllowedWeekdaysChange}
              disabled={saving}
            />
          </div>
        );
      case 'checklist':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="tm-label text-sm">Чеклист</p>
              <span className="text-xs text-amber-200/70">{checklistDraft.length} пунктов</span>
            </div>
            {checklistDraft.length > 0 ? (
              <div className="space-y-2">
                {checklistDraft.map((item) => (
                  <div key={item.id} className="tm-editor-checklist-row">
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
                Новые пункты, по одному на строку
              </label>
              <textarea
                value={checklistAddInput}
                onChange={(event) => setChecklistAddInput(event.target.value)}
                className="tm-input"
                rows={3}
                placeholder="- купить продукты&#10;- приготовить ужин"
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
        );
      case 'deadline':
        return (
          <div className="tm-editor-deadline-grid">
            <div>
              <label className="block text-sm tm-label mb-1">Срок</label>
              <input
                type="datetime-local"
                value={deadlineInput}
                onChange={(event) => setDeadlineInput(event.target.value)}
                className="tm-input"
                disabled={saving}
              />
            </div>
            <div>
              <label className="block text-sm tm-label mb-1">Напомнить за, мин.</label>
              <input
                type="number"
                min={0}
                step={5}
                value={reminderInput}
                onChange={(event) => setReminderInput(event.target.value)}
                className="tm-input"
                placeholder="Например: 60"
                disabled={saving}
              />
            </div>
            <p className="tm-editor-hint text-xs text-amber-200/70">
              Напоминание работает только со сроком.
            </p>
          </div>
        );
      case 'progress':
        return (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm tm-label">
              <input
                type="checkbox"
                checked={progressEnabled}
                onChange={(event) => setProgressEnabled(event.target.checked)}
                className="h-4 w-4 accent-amber-500"
                disabled={saving}
              />
              Отслеживать прогресс
            </label>
            {progressEnabled ? (
              <TaskProgressControls
                value={progressValue}
                onChange={setProgressValue}
                disabled={saving}
              />
            ) : (
              <p className="text-xs text-amber-200/70">Включи, если задаче нужен процент выполнения.</p>
            )}
          </div>
        );
      case 'skills':
        return (
          <SkillTagsInput
            value={skillTagsInput}
            onChange={setSkillTagsInput}
            suggestions={skillOptions}
            disabled={saving}
            placeholder="Например: Готовка, Excel"
          />
        );
      case 'comment':
        return (
          <div>
            <label className="block text-sm tm-label mb-1">Комментарий</label>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              className="tm-input"
              rows={4}
              placeholder="Например: детали, на что обратить внимание"
              disabled={saving}
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="tm-modal-overlay tm-task-editor-overlay fixed inset-0 bg-black/70 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div
        className={`w-full max-w-lg tm-panel tm-task-editor-modal ${portalThemeClassName} p-4 sm:p-5 shadow-xl max-h-[85vh] overflow-hidden flex flex-col`}
      >
        <div className="tm-editor-header">
          <h2 className="text-xl font-semibold tm-title">{resolvedTitle}</h2>
          {contextProject ? (
            <p className="text-xs text-amber-200/70">Проект: {contextProject.title}</p>
          ) : null}
        </div>
        <div className="tm-editor-body overflow-y-auto pr-1 flex-1 min-h-0">
          <div className="tm-editor-core">
            <label className="block text-sm tm-label mb-1">Название</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value.slice(0, MAX_TASK_TITLE_LENGTH))}
              className="tm-input"
              maxLength={MAX_TASK_TITLE_LENGTH}
              placeholder="Например: Сделать тренировку"
              disabled={saving}
            />
          </div>

          <div className="tm-editor-core-grid">
            <div>
              <label className="block text-sm tm-label mb-1">Очередь</label>
              <select
                value={bucket}
                onChange={(event) => setBucket(event.target.value as TaskBucket)}
                className="tm-select"
                disabled={saving}
              >
                {TODAY_QUEUE_TABS.map((queue) => (
                  <option key={queue} value={queue}>
                    {QUEUE_LABELS[queue]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm tm-label mb-1">Редкость</label>
              <select
                value={rarity}
                onChange={(event) => setRarity(event.target.value as Rarity)}
                className="tm-select"
                disabled={saving}
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
            <div className="tm-editor-value-control">
              <label className="block text-sm tm-label">Ценность</label>
              <span className="text-sm text-amber-100">{value}</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={value}
                onChange={(event) => setValue(Number(event.target.value))}
                className="tm-range"
                disabled={saving}
              />
              <div className="flex justify-between text-xs text-amber-200/70">
                <span>1</span>
                <span>10</span>
              </div>
            </div>
          </div>

          <div className="tm-editor-chip-row" aria-label="Дополнительные параметры задачи">
            {editorChips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setActiveChip((current) => (current === chip.id ? null : chip.id))}
                className={`tm-editor-chip ${
                  activeChip === chip.id ? 'tm-editor-chip-active' : ''
                } ${chip.filled ? 'tm-editor-chip-filled' : ''}`}
                aria-pressed={activeChip === chip.id}
                disabled={saving}
              >
                <span>{chip.label}</span>
                <span className="tm-editor-chip-summary">{chip.summary}</span>
              </button>
            ))}
          </div>

          {activeChip ? (
            <section className="tm-panel-soft tm-editor-chip-panel p-3">
              {renderActiveChipPanel()}
            </section>
          ) : null}
        </div>

        <div className="tm-editor-footer">
          <button
            type="button"
            onClick={onClose}
            className="tm-button tm-button-ghost"
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            className="tm-button tm-button-primary"
            disabled={saving}
          >
            {saving ? 'Сохранение...' : isEditMode ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}
