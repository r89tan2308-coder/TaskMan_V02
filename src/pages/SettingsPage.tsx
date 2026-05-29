import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';
import {
  readAllForExport,
  replaceAllFromImport
} from '../db/repositories/exportImportRepo';
import { addEvent } from '../db/repositories/ledgerRepo';
import type { PlanImportPreview, PlanImportSelection } from '../entities/plan/types';
import {
  applyPlanImportSelection,
  buildDefaultPlanImportSelection,
  buildPlanExportPayload,
  preparePlanImportPreview
} from '../services/planTransferService';
import {
  getImportExportGuide
} from '../content/importExportGuide';
import {
  APP_LOCALE_LABELS,
  useLocale,
  type AppLocale
} from '../i18n/appLocale';
import { reminderTranslations } from '../i18n/reminders';
import { getXpBalance } from '../services/xpService';
import {
  getNotificationPermissionState,
  requestNotificationPermission,
  type NotificationPermissionState
} from '../services/notificationService';
import {
  getReminderSettings,
  normalizeReminderSettings,
  runReminderCheck,
  updateReminderSettings,
  type ReminderSettings
} from '../services/reminderService';
import type { PetMotionMode } from '../features/pet/petPreferences';
import { requestPwaUpdate } from '../pwa';

type InterfaceTheme = 'classic' | 'vault' | 'handwritten' | 'hud';

const SETTINGS_COPY = {
  ru: {
    sections: 'Разделы',
    ledger: 'Журнал XP',
    log: 'Дневник',
    manual: 'Мануал',
    tetris: 'Tetris',
    interface: 'Интерфейс',
    language: 'Язык',
    style: 'Стиль',
    themeLabels: {
      classic: 'Classic',
      vault: 'Retro',
      handwritten: 'Рукописный',
      hud: 'HUD'
    },
    handwrittenHint: 'Фон виден с прозрачностью 20%.',
    removeBackground: 'Удалить фон',
    failedReadBackground: 'Не удалось прочитать изображение фона.',
    vexaCompanion: 'Vexa-компаньон',
    motion: 'Движение',
    motionModes: {
      full: 'Полное',
      reduced: 'Меньше',
      static: 'Статика'
    },
    returnVexa: 'Вернуть Vexa',
    hideVexa: 'Спрятать Vexa',
    xp: 'XP',
    editXpBalance: 'Изменить баланс XP',
    currentBalance: (xp: number) => `Текущий баланс: ${xp} XP`,
    xpBalance: 'Баланс XP',
    invalidXp: 'Некорректное значение XP.',
    failedUpdateXp: 'Не удалось обновить XP.',
    cancel: 'Отмена',
    save: 'Сохранить',
    saving: 'Сохранение...',
    app: 'Приложение',
    updateApp: 'Обновить приложение',
    updatingApp: 'Обновление...',
    updateStatus: {
      checking: 'Проверяем обновления...',
      reloading: 'Обновление найдено. Перезагрузка...',
      noUpdate: 'Обновлений нет.',
      error: 'Не удалось обновить приложение.'
    },
    allowInBrowser: 'Разрешить в браузере',
    checkNow: 'Проверить сейчас',
    data: 'Данные',
    dataNote:
      'Задачи хранятся локально в текущем браузере и адресе приложения. Разные профили, localhost и 127.0.0.1 используют отдельные базы.',
    importExport: 'Импорт / экспорт',
    transferSummary: 'Планирование и резервная копия',
    transferTitle: 'Перенос и планирование',
    transferDescription: 'JSON-план для новых задач, резервная копия JSON для полной копии базы.',
    howToUse: 'Как пользоваться',
    planForAi: 'План для нейронки',
    aiPrompt: 'Промпт для нейронки',
    planning: 'Планирование',
    planningDescription: 'Экспортирует план наружу и импортирует новые задачи и проекты обратно.',
    exportPlan: 'Выгрузить план',
    exportPlanDescription: 'Экспортирует задачи и проекты для внешнего планирования',
    importPlan: 'Загрузить план',
    importPlanDescription: 'Импортирует новые задачи и проекты из плана',
    backup: 'Резервная копия',
    backupTitle: 'Резервная копия',
    backupDescription:
      'Полный экспорт и восстановление приложения. Импорт полностью заменяет локальные данные.',
    downloadBackup: 'Скачать резервную копию',
    downloadBackupDescription: 'Сохраняет полную копию локальных данных в JSON',
    restoreBackup: 'Восстановить резервную копию',
    restoreBackupDescription: 'Полностью заменяет текущую локальную базу выбранной резервной копией',
    exportButton: 'Экспорт',
    exportLoading: 'Экспорт...',
    importButton: 'Импорт',
    importLoading: 'Импорт...',
    backupExportLoading: 'Экспорт...',
    replaceConfirmMessage: 'Это полностью заменит локальные данные. Продолжить?',
    continue: 'Продолжить',
    planExported: (projects: number, tasks: number) =>
      `План выгружен: ${projects} ${pluralizeRu(projects, 'проект', 'проекта', 'проектов')}, ${tasks} ${pluralizeRu(tasks, 'задача', 'задачи', 'задач')}.`,
    planImported: (projects: number, tasks: number) =>
      `Импортировано: ${projects} ${pluralizeRu(projects, 'проект', 'проекта', 'проектов')}, ${tasks} ${pluralizeRu(tasks, 'задача', 'задачи', 'задач')}.`,
    linkedExistingProjects: (count: number) => ` Использовано существующих проектов: ${count}.`,
    reusedProjects: (count: number) => ` Совпавших проектов не дублировали: ${count}.`,
    skippedTasks: (count: number) => ` Пропущено похожих задач: ${count}.`,
    planImportSyntaxError: 'Файл плана повреждён или имеет неверный формат.',
    planImportValidationError:
      'Файл плана не прошёл проверку. Проверь структуру JSON и обязательные поля.',
    planImportFallbackError: 'Не удалось загрузить план.',
    backupImportSyntaxError: 'Файл резервной копии повреждён или имеет неверный JSON-формат.',
    backupImportFallbackError: 'Не удалось импортировать резервную копию.',
    previewTitle: 'Предпросмотр импорта плана',
    metrics: {
      projects: (count: number) => `Проектов ${count}`,
      tasks: (count: number) => `Задач ${count}`,
      selected: (count: number) => `Выбрано ${count}`,
      deselected: (count: number) => `Снято ${count}`
    },
    blockedWarning: 'Есть задачи со снятыми проектами. Верни проект или сними такие задачи.',
    selectAll: 'Выбрать всё',
    clearAll: 'Снять всё',
    projectsTitle: 'Проекты',
    tasksTitle: 'Задачи',
    reuseBadge: 'Уже есть',
    newBadge: 'Новый',
    linkedProject: (title: string) => `Будет привязан к существующему проекту: ${title}`,
    projectHasNoSelectedTasks: 'У этого проекта не осталось выбранных задач.',
    noNewProjects: 'В этом плане нет новых проектов.',
    noNewTasks: 'В этом плане нет новых задач.',
    dueDate: 'Дедлайн',
    noDueDate: 'не задан',
    repeat: 'Повтор',
    chooseProjectFirst: 'Сначала выбери проект, чтобы импортировать эту задачу.',
    duplicateWarning: 'Похоже, такая открытая задача уже есть.',
    importSelectedNote:
      'Импортируются только отмеченные элементы. Дубликаты и задачи со снятыми проектами не будут применены.',
    importSelected: 'Импортировать выбранное',
    planBucketLabels: {
      today: 'Сегодня',
      next: 'Далее',
      backlog: 'Запас',
      inbox: 'Входящие'
    },
    planPeriodicityLabels: {
      daily: 'ежедневно',
      weekly: 'еженедельно',
      'one-time': 'разовая',
      monthly: 'ежемесячно',
      yearly: 'ежегодно'
    }
  },
  en: {
    sections: 'Sections',
    ledger: 'XP Ledger',
    log: 'Daily Log',
    manual: 'Manual',
    tetris: 'Tetris',
    interface: 'Interface',
    language: 'Language',
    style: 'Style',
    themeLabels: {
      classic: 'Classic',
      vault: 'Retro',
      handwritten: 'Handwritten',
      hud: 'HUD'
    },
    handwrittenHint: 'The background is shown at 20% opacity.',
    removeBackground: 'Remove background',
    failedReadBackground: 'Failed to read background image.',
    vexaCompanion: 'Vexa companion',
    motion: 'Motion',
    motionModes: {
      full: 'Full',
      reduced: 'Reduced',
      static: 'Static'
    },
    returnVexa: 'Return Vexa',
    hideVexa: 'Hide Vexa',
    xp: 'XP',
    editXpBalance: 'Edit XP balance',
    currentBalance: (xp: number) => `Current balance: ${xp} XP`,
    xpBalance: 'XP balance',
    invalidXp: 'Invalid XP value.',
    failedUpdateXp: 'Failed to update XP.',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving...',
    app: 'Application',
    updateApp: 'Update app',
    updatingApp: 'Updating...',
    updateStatus: {
      checking: 'Checking for updates...',
      reloading: 'Update found. Reloading...',
      noUpdate: 'No updates available.',
      error: 'Failed to update the app.'
    },
    allowInBrowser: 'Allow in browser',
    checkNow: 'Check now',
    data: 'Data',
    dataNote:
      'Tasks are stored locally in the current browser and app address. Different profiles, localhost, and 127.0.0.1 use separate databases.',
    importExport: 'Import / Export',
    transferSummary: 'Planning and backup',
    transferTitle: 'Transfer and planning',
    transferDescription: 'Planning JSON is for new tasks; backup JSON is for a full database copy.',
    howToUse: 'How to use',
    planForAi: 'Plan for AI',
    aiPrompt: 'AI prompt',
    planning: 'Planning',
    planningDescription: 'Exports the plan out and imports new tasks and projects back in.',
    exportPlan: 'Export plan',
    exportPlanDescription: 'Exports tasks and projects for external planning',
    importPlan: 'Import plan',
    importPlanDescription: 'Imports new tasks and projects from a plan',
    backup: 'Backup',
    backupTitle: 'Backup',
    backupDescription: 'Full app export and restore. Import fully replaces local data.',
    downloadBackup: 'Download backup',
    downloadBackupDescription: 'Saves a full local data copy as JSON',
    restoreBackup: 'Restore backup',
    restoreBackupDescription: 'Fully replaces the current local database with the selected backup',
    exportButton: 'Export',
    exportLoading: 'Export...',
    importButton: 'Import',
    importLoading: 'Import...',
    backupExportLoading: 'Export...',
    replaceConfirmMessage: 'This will fully replace local data. Continue?',
    continue: 'Continue',
    planExported: (projects: number, tasks: number) =>
      `Plan exported: ${projects} project${projects === 1 ? '' : 's'}, ${tasks} task${tasks === 1 ? '' : 's'}.`,
    planImported: (projects: number, tasks: number) =>
      `Imported: ${projects} project${projects === 1 ? '' : 's'}, ${tasks} task${tasks === 1 ? '' : 's'}.`,
    linkedExistingProjects: (count: number) => ` Used existing projects: ${count}.`,
    reusedProjects: (count: number) => ` Matching projects were not duplicated: ${count}.`,
    skippedTasks: (count: number) => ` Similar tasks skipped: ${count}.`,
    planImportSyntaxError: 'The plan file is damaged or has an invalid format.',
    planImportValidationError:
      'The plan file did not pass validation. Check the JSON structure and required fields.',
    planImportFallbackError: 'Could not load the plan.',
    backupImportSyntaxError: 'The backup file is damaged or has invalid JSON.',
    backupImportFallbackError: 'Could not import the backup.',
    previewTitle: 'Plan Import Preview',
    metrics: {
      projects: (count: number) => `Projects ${count}`,
      tasks: (count: number) => `Tasks ${count}`,
      selected: (count: number) => `Selected ${count}`,
      deselected: (count: number) => `Unchecked ${count}`
    },
    blockedWarning: 'Some selected tasks belong to unchecked projects. Select the project or uncheck those tasks.',
    selectAll: 'Select all',
    clearAll: 'Clear all',
    projectsTitle: 'Projects',
    tasksTitle: 'Tasks',
    reuseBadge: 'Existing',
    newBadge: 'New',
    linkedProject: (title: string) => `Will be linked to existing project: ${title}`,
    projectHasNoSelectedTasks: 'This project has no selected tasks left.',
    noNewProjects: 'This plan has no new projects.',
    noNewTasks: 'This plan has no new tasks.',
    dueDate: 'Due date',
    noDueDate: 'not set',
    repeat: 'Repeat',
    chooseProjectFirst: 'Select the project first to import this task.',
    duplicateWarning: 'A similar open task already exists.',
    importSelectedNote:
      'Only checked items will be imported. Duplicates and tasks with unchecked projects will not be applied.',
    importSelected: 'Import selected',
    planBucketLabels: {
      today: 'Today',
      next: 'Next',
      backlog: 'Backlog',
      inbox: 'Inbox'
    },
    planPeriodicityLabels: {
      daily: 'daily',
      weekly: 'weekly',
      'one-time': 'one-time',
      monthly: 'monthly',
      yearly: 'yearly'
    }
  }
} satisfies Record<AppLocale, unknown>;

const pluralizeRu = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

type SettingsCopy = (typeof SETTINGS_COPY)[AppLocale];

const formatPlanImportResult = (copy: SettingsCopy, projects: number, tasks: number) =>
  copy.planImported(projects, tasks);

const getPlanImportErrorText = (error: unknown, copy: SettingsCopy) => {
  if (error instanceof SyntaxError) {
    return copy.planImportSyntaxError;
  }
  return error instanceof Error ? copy.planImportValidationError : copy.planImportFallbackError;
};

const getBackupImportErrorText = (error: unknown, copy: SettingsCopy) => {
  if (error instanceof SyntaxError) {
    return copy.backupImportSyntaxError;
  }
  return error instanceof Error ? error.message : copy.backupImportFallbackError;
};

const getPlanPreviewNote = (value?: string, maxLength = 120) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
};

const generateId = (): string => {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `settings-${uuid}`;
};

export function SettingsPage({
  onNavigate,
  interfaceTheme,
  onInterfaceChange,
  handwrittenBackground,
  onHandwrittenBackgroundChange,
  petEnabled,
  petMotionMode,
  onPetEnabledChange,
  onPetMotionModeChange,
  onPetPositionReset,
  tetrisAvailable
}: {
  onNavigate: (target: 'ledger' | 'log' | 'manual' | 'tetris') => void;
  interfaceTheme: InterfaceTheme;
  onInterfaceChange: (theme: InterfaceTheme) => Promise<void>;
  handwrittenBackground: string | null;
  onHandwrittenBackgroundChange: (value: string | null) => Promise<void>;
  petEnabled: boolean;
  petMotionMode: PetMotionMode;
  onPetEnabledChange: (enabled: boolean) => Promise<void>;
  onPetMotionModeChange: (mode: PetMotionMode) => Promise<void>;
  onPetPositionReset: () => Promise<void>;
  tetrisAvailable: boolean;
}) {
  const [exporting, setExporting] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<
    'idle' | 'checking' | 'reloading' | 'no-update' | 'error'
  >('idle');
  const [interfaceOpen, setInterfaceOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferGuideOpen, setTransferGuideOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [xp, setXp] = useState(0);
  const [editingXp, setEditingXp] = useState(false);
  const [xpDraft, setXpDraft] = useState('');
  const [savingXp, setSavingXp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const planFileInputRef = useRef<HTMLInputElement | null>(null);
  const planPreviewReturnFocusRef = useRef<HTMLElement | null>(null);
  const [planExporting, setPlanExporting] = useState(false);
  const [planImporting, setPlanImporting] = useState(false);
  const [planImportApplying, setPlanImportApplying] = useState(false);
  const [planStatus, setPlanStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null
  );
  const [planPreview, setPlanPreview] = useState<PlanImportPreview | null>(null);
  const [planSelection, setPlanSelection] = useState<PlanImportSelection>({
    projectClientIds: [],
    taskIds: []
  });
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(
    normalizeReminderSettings(undefined)
  );
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermissionState());
  const [notificationHelpText, setNotificationHelpText] = useState<string | null>(null);
  const { locale, setLocale } = useLocale();
  const copy = SETTINGS_COPY[locale];
  const reminderCopy = reminderTranslations[locale];
  const importExportGuide = getImportExportGuide(locale);
  const planPreviewOpen = Boolean(planPreview);
  const planPreviewTitleId = 'tm-plan-preview-title';

  const interfaceLabel =
    interfaceTheme === 'vault'
      ? copy.themeLabels.vault
      : interfaceTheme === 'handwritten'
      ? copy.themeLabels.handwritten
      : interfaceTheme === 'hud'
      ? copy.themeLabels.hud
      : copy.themeLabels.classic;
  const updateStatusLabel =
    updateStatus === 'checking'
      ? copy.updateStatus.checking
      : updateStatus === 'reloading'
      ? copy.updateStatus.reloading
      : updateStatus === 'no-update'
      ? copy.updateStatus.noUpdate
      : updateStatus === 'error'
      ? copy.updateStatus.error
      : '';
  const updateStatusClass =
    updateStatus === 'error'
      ? 'text-red-300/80'
      : updateStatus === 'reloading'
      ? 'text-emerald-200/80'
      : 'text-amber-200/70';
  const notificationPermissionLabel =
    notificationPermission === 'granted'
      ? reminderCopy.permissionGranted
      : notificationPermission === 'denied'
      ? reminderCopy.permissionDenied
      : notificationPermission === 'default'
      ? reminderCopy.permissionDefault
      : reminderCopy.permissionUnsupported;
  const notificationPermissionClass =
    notificationPermission === 'granted'
      ? 'text-emerald-200/80'
      : notificationPermission === 'denied'
      ? 'text-red-300/80'
      : 'text-amber-200/70';

  useEffect(() => {
    const loadXp = async () => {
      const balance = await getXpBalance();
      setXp(balance);
    };
    void loadXp();
  }, []);

  useEffect(() => {
    const loadReminderSettings = async () => {
      const settings = await getReminderSettings();
      setReminderSettings(settings);
      setNotificationPermission(getNotificationPermissionState());
    };
    void loadReminderSettings();
  }, []);

  useEffect(() => {
    if (!planPreviewOpen || typeof document === 'undefined') return;
    planPreviewReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      planPreviewReturnFocusRef.current?.focus();
      planPreviewReturnFocusRef.current = null;
    };
  }, [planPreviewOpen]);

  useEffect(() => {
    if (!planPreview || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !planImportApplying) {
        setPlanPreview(null);
        setPlanSelection({ projectClientIds: [], taskIds: [] });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [planImportApplying, planPreview]);

  const downloadJsonFile = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const payload = await readAllForExport({
        schemaVersion: 1,
        exportedAt: new Date(Date.now()).toISOString()
      });
      downloadJsonFile('taskman-export.json', payload);
    } finally {
      setExporting(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const confirmed = await showAppConfirm({
          message: copy.replaceConfirmMessage,
          confirmLabel: copy.continue,
          tone: 'danger'
        });
        if (!confirmed) return;
        await replaceAllFromImport(payload);
        window.location.reload();
      } catch (error) {
        await showAppAlert(getBackupImportErrorText(error, copy));
      } finally {
        event.target.value = '';
      }
  };

  const handlePlanExport = async () => {
    if (planExporting) return;
    setPlanExporting(true);
    setPlanStatus(null);
    try {
      const payload = await buildPlanExportPayload();
      downloadJsonFile('plan-export.json', payload);
      setPlanStatus({
        tone: 'success',
        text: copy.planExported(payload.projects.length, payload.tasks.length)
      });
    } catch (error) {
      setPlanStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : copy.planImportFallbackError
      });
    } finally {
      setPlanExporting(false);
    }
  };

  const handlePlanImportClick = () => {
    planFileInputRef.current?.click();
  };

  const handlePlanImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPlanImporting(true);
    setPlanStatus(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const preview = await preparePlanImportPreview(payload);
      setPlanPreview(preview);
      setPlanSelection(buildDefaultPlanImportSelection(preview));
    } catch (error) {
      setPlanStatus({
        tone: 'error',
        text: getPlanImportErrorText(error, copy)
      });
    } finally {
      setPlanImporting(false);
      event.target.value = '';
    }
  };

  const handleUpdateApp = async () => {
    if (updating) return;
    setUpdating(true);
    setUpdateStatus('checking');
    try {
      const result = await requestPwaUpdate();
      if (result === 'updated') {
        setUpdateStatus('reloading');
        window.setTimeout(() => {
          window.location.reload();
        }, 350);
        window.setTimeout(() => {
          setUpdating(false);
        }, 5000);
        return;
      }
      setUpdateStatus('no-update');
      setUpdating(false);
    } catch (error) {
      setUpdateStatus('error');
      setUpdating(false);
    }
  };

  const syncNotificationPermission = () => {
    const permission = getNotificationPermissionState();
    setNotificationPermission(permission);
    return permission;
  };

  const explainNotificationBlock = (permission: NotificationPermissionState) => {
    if (permission === 'denied') {
      setNotificationHelpText(reminderCopy.deniedHint);
      return;
    }
    if (permission === 'unsupported') {
      setNotificationHelpText(reminderCopy.unsupportedHint);
      return;
    }
    setNotificationHelpText(null);
  };

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
    explainNotificationBlock(permission);
    if (permission === 'granted') {
      setNotificationHelpText(null);
      void runReminderCheck();
    }
  };

  const ensureNotificationsForReminder = async () => {
    const current = syncNotificationPermission();
    if (current === 'granted') return true;
    if (current === 'denied' || current === 'unsupported') {
      explainNotificationBlock(current);
      return false;
    }

    const requested = await requestNotificationPermission();
    setNotificationPermission(requested);
    explainNotificationBlock(requested);
    return requested === 'granted';
  };

  const handleReminderToggle = async (
    key:
      | 'eveningReviewEnabled'
      | 'morningCheckInEnabled'
      | 'overdueReminderEnabled',
    enabled: boolean
  ) => {
    if (enabled) {
      const allowed = await ensureNotificationsForReminder();
      if (!allowed) return;
    }
    const next = await updateReminderSettings({ [key]: enabled });
    setReminderSettings(next);
    if (enabled) void runReminderCheck();
  };

  const handleReminderTimeChange = async (
    key: 'eveningReviewTime' | 'morningCheckInTime',
    value: string
  ) => {
    const next = await updateReminderSettings({ [key]: value });
    setReminderSettings(next);
    void runReminderCheck();
  };

  const handleInterfaceToggle = () => {
    setInterfaceOpen((prev) => !prev);
  };

  const handleTransferToggle = () => {
    setTransferOpen((prev) => !prev);
  };

  const handleTransferGuideToggle = () => {
    setTransferGuideOpen((prev) => !prev);
  };

  const handleNotificationsToggle = () => {
    setNotificationsOpen((prev) => !prev);
  };

  const handleThemeChange = async (next: InterfaceTheme) => {
    if (next === interfaceTheme) return;
    await onInterfaceChange(next);
  };

  const handleLocaleChange = async (next: AppLocale) => {
    if (next === locale) return;
    await setLocale(next);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });

  const handleHandwrittenBackgroundFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (dataUrl) {
        await onHandwrittenBackgroundChange(dataUrl);
      }
    } catch (error) {
      await showAppAlert(copy.failedReadBackground);
    } finally {
      event.target.value = '';
    }
  };

  const handleHandwrittenBackgroundClear = async () => {
    await onHandwrittenBackgroundChange(null);
  };

  const openXpEditor = () => {
    setXpDraft(String(xp));
    setEditingXp(true);
  };

  const handleSaveXp = async () => {
    const parsed = Number(xpDraft);
    if (!Number.isFinite(parsed)) {
      await showAppAlert(copy.invalidXp);
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
      const nextXp = await getXpBalance();
      setXp(nextXp);
      setEditingXp(false);
    } catch (error) {
      await showAppAlert(copy.failedUpdateXp);
    } finally {
      setSavingXp(false);
    }
  };

  const closePlanPreview = () => {
    if (planImportApplying) return;
    setPlanPreview(null);
    setPlanSelection({ projectClientIds: [], taskIds: [] });
  };

  const togglePlanProject = (clientId: string) => {
    setPlanSelection((prev) => {
      const removing = prev.projectClientIds.includes(clientId);
      const projectClientIds = removing
        ? prev.projectClientIds.filter((value) => value !== clientId)
        : [...prev.projectClientIds, clientId];
      const taskIds =
        removing && planPreview
          ? prev.taskIds.filter((taskId) => {
              const task = planPreview.tasks.find((item) => item.id === taskId);
              return task?.projectClientId !== clientId;
            })
          : prev.taskIds;
      return { ...prev, projectClientIds, taskIds };
    });
  };

  const togglePlanTask = (taskId: string) => {
    setPlanSelection((prev) => {
      const taskIds = prev.taskIds.includes(taskId)
        ? prev.taskIds.filter((value) => value !== taskId)
        : [...prev.taskIds, taskId];
      return { ...prev, taskIds };
    });
  };

  const handleSelectAllPlanItems = () => {
    if (!planPreview) return;
    setPlanSelection(buildDefaultPlanImportSelection(planPreview));
  };

  const handleClearPlanSelection = () => {
    setPlanSelection({ projectClientIds: [], taskIds: [] });
  };

  const handleApplyPlanImport = async () => {
    if (!planPreview || planImportApplying) return;
    setPlanImportApplying(true);
    setPlanStatus(null);
    try {
      const result = await applyPlanImportSelection(planPreview, planSelection);
      setPlanPreview(null);
      setPlanSelection({ projectClientIds: [], taskIds: [] });
      setPlanStatus({
        tone: 'success',
        text:
          formatPlanImportResult(copy, result.createdProjects, result.createdTasks) +
          (result.linkedExistingProjects > 0
            ? copy.linkedExistingProjects(result.linkedExistingProjects)
            : '') +
          (result.reusedProjects > 0 ? copy.reusedProjects(result.reusedProjects) : '') +
          (result.skippedTasks > 0 ? copy.skippedTasks(result.skippedTasks) : '')
      });
    } catch (error) {
      setPlanStatus({
        tone: 'error',
        text: getPlanImportErrorText(error, copy)
      });
    } finally {
      setPlanImportApplying(false);
    }
  };

  const selectedProjectIds = new Set(planSelection.projectClientIds);
  const selectedTaskIds = new Set(planSelection.taskIds);
  const selectedTaskCountByProjectClientId = new Map<string, number>();
  const blockedSelectedTaskIds = new Set<string>();

  for (const task of planPreview?.tasks ?? []) {
    if (!selectedTaskIds.has(task.id)) continue;
    if (task.projectClientId && !selectedProjectIds.has(task.projectClientId)) {
      blockedSelectedTaskIds.add(task.id);
      continue;
    }
    if (task.projectClientId) {
      selectedTaskCountByProjectClientId.set(
        task.projectClientId,
        (selectedTaskCountByProjectClientId.get(task.projectClientId) ?? 0) + 1
      );
    }
  }

  const previewProjectCount = planPreview?.projects.length ?? 0;
  const previewTaskCount = planPreview?.tasks.length ?? 0;
  const previewTotalCount = previewProjectCount + previewTaskCount;
  const previewSelectedCount = planSelection.projectClientIds.length + planSelection.taskIds.length;
  const previewDeselectedCount = Math.max(0, previewTotalCount - previewSelectedCount);
  const previewHasBlockedSelection = blockedSelectedTaskIds.size > 0;
  const previewImportDisabled =
    planImportApplying || previewSelectedCount === 0 || previewHasBlockedSelection;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-settings-frame tm-reveal space-y-4 p-3 sm:p-6">
          <h1 className="sr-only">{copy.interface}</h1>
          <div className="space-y-2">
            <p className="tm-label">{copy.sections}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate('ledger')}
                className="tm-button tm-button-steel"
              >
                {copy.ledger}
              </button>
              <button
                onClick={() => onNavigate('log')}
                className="tm-button tm-button-steel"
              >
                {copy.log}
              </button>
              <button
                onClick={() => onNavigate('manual')}
                className="tm-button tm-button-steel"
              >
                {copy.manual}
              </button>
              {tetrisAvailable ? (
                <button
                  onClick={() => onNavigate('tetris')}
                  className="tm-button tm-button-gold"
                >
                  {copy.tetris}
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="tm-label">{copy.interface}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleInterfaceToggle}
                className="tm-button tm-button-steel"
                aria-expanded={interfaceOpen}
              >
                {copy.interface}
              </button>
              <span className="text-sm text-amber-200/70">
                {interfaceLabel}
              </span>
            </div>
            {interfaceOpen ? (
              <div className="tm-panel-soft tm-surface-inset p-3 space-y-2">
                <p className="text-xs text-amber-200/70">{copy.language}</p>
                <div className="tm-segmented-control" role="group" aria-label={copy.language}>
                  {(['ru', 'en'] as const).map((nextLocale) => (
                    <button
                      key={nextLocale}
                      type="button"
                      onClick={() => {
                        void handleLocaleChange(nextLocale);
                      }}
                      className={`tm-button tm-segmented-item ${
                        locale === nextLocale ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                      }`}
                      aria-pressed={locale === nextLocale}
                    >
                      {APP_LOCALE_LABELS[nextLocale]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-200/70">{copy.style}</p>
                <div className="tm-segmented-control" role="group" aria-label={copy.style}>
                  <button
                    type="button"
                    onClick={() => handleThemeChange('classic')}
                    className={`tm-button tm-segmented-item ${
                      interfaceTheme === 'classic' ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                    }`}
                    aria-pressed={interfaceTheme === 'classic'}
                  >
                    {copy.themeLabels.classic}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeChange('vault')}
                    className={`tm-button tm-segmented-item ${
                      interfaceTheme === 'vault' ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                    }`}
                    aria-pressed={interfaceTheme === 'vault'}
                  >
                    {copy.themeLabels.vault}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeChange('handwritten')}
                    className={`tm-button tm-segmented-item ${
                      interfaceTheme === 'handwritten' ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                    }`}
                    aria-pressed={interfaceTheme === 'handwritten'}
                  >
                    {copy.themeLabels.handwritten}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeChange('hud')}
                    className={`tm-button tm-segmented-item ${
                      interfaceTheme === 'hud' ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                    }`}
                    aria-pressed={interfaceTheme === 'hud'}
                  >
                    {copy.themeLabels.hud}
                  </button>
                </div>
                {interfaceTheme === 'handwritten' ? (
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-amber-200/70">
                      {copy.handwrittenHint}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleHandwrittenBackgroundFile}
                        className="tm-file text-sm"
                      />
                      {handwrittenBackground ? (
                        <button
                          onClick={handleHandwrittenBackgroundClear}
                          className="tm-button tm-button-ghost tm-button-sm"
                        >
                          {copy.removeBackground}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="border-t border-amber-400/10 pt-3 space-y-2">
                  <label className="flex flex-wrap items-center gap-2 text-sm tm-label">
                    <input
                      type="checkbox"
                      checked={petEnabled}
                      onChange={(event) => void onPetEnabledChange(event.target.checked)}
                      className="h-4 w-4 accent-amber-500"
                    />
                    {copy.vexaCompanion}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-200/70">{copy.motion}</span>
                    <div className="tm-segmented-control" role="group" aria-label={copy.motion}>
                      {(['full', 'reduced', 'static'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => void onPetMotionModeChange(mode)}
                          className={`tm-button tm-button-sm tm-segmented-item ${
                            petMotionMode === mode ? 'tm-button-gold is-selected' : 'tm-button-ghost'
                          }`}
                          disabled={!petEnabled}
                          aria-pressed={petMotionMode === mode}
                        >
                          {copy.motionModes[mode]}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void onPetPositionReset()}
                      className="tm-button tm-button-sm tm-button-ghost"
                    >
                      {copy.returnVexa}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onPetEnabledChange(false)}
                      className="tm-button tm-button-sm tm-button-ghost"
                      disabled={!petEnabled}
                    >
                      {copy.hideVexa}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">{copy.xp}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openXpEditor}
                className="tm-button tm-button-steel"
              >
                {copy.editXpBalance}
              </button>
              <span className="text-sm text-amber-200/80">{copy.currentBalance(xp)}</span>
            </div>
            {editingXp ? (
              <div className="tm-panel-soft tm-surface-inset p-3 space-y-3">
                <div>
                  <label className="block text-sm tm-label mb-1">{copy.xpBalance}</label>
                  <input
                    type="number"
                    step={1}
                    value={xpDraft}
                    onChange={(event) => setXpDraft(event.target.value)}
                    className="tm-input"
                    disabled={savingXp}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingXp(false)}
                    className="tm-button tm-button-ghost"
                    disabled={savingXp}
                  >
                    {copy.cancel}
                  </button>
                  <button
                    onClick={handleSaveXp}
                    className="tm-button tm-button-gold"
                    disabled={savingXp}
                  >
                    {savingXp ? copy.saving : copy.save}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">{copy.app}</p>
            <button
              onClick={handleUpdateApp}
              disabled={updating}
              className="tm-button tm-button-primary"
            >
              {updating ? copy.updatingApp : copy.updateApp}
            </button>
            {updateStatus !== 'idle' ? (
              <p className={`text-xs ${updateStatusClass}`} role="status" aria-live="polite">
                {updateStatusLabel}
              </p>
              ) : null}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleNotificationsToggle}
                className="tm-button tm-button-steel"
                aria-expanded={notificationsOpen}
              >
                {reminderCopy.enableNotifications}
              </button>
              <span className={`text-sm ${notificationPermissionClass}`}>
                {notificationPermissionLabel}
              </span>
            </div>

            {notificationsOpen ? (
              <div className="tm-panel-soft tm-surface-inset p-3 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="tm-label">{reminderCopy.browserNotifications}</p>
                    <p className="max-w-2xl text-xs leading-relaxed text-amber-200/65">
                      {reminderCopy.quietHint}
                    </p>
                  </div>
                  {notificationPermission !== 'granted' ? (
                    <button
                      type="button"
                      onClick={handleEnableNotifications}
                      className="tm-button tm-button-primary"
                      disabled={notificationPermission === 'unsupported'}
                    >
                      {copy.allowInBrowser}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runReminderCheck()}
                      className="tm-button tm-button-ghost"
                    >
                      {copy.checkNow}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-amber-100">{reminderCopy.notificationPermission}:</span>
                  <span className={notificationPermissionClass}>{notificationPermissionLabel}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="rounded border border-amber-400/15 p-3 space-y-2">
                    <span className="flex items-center gap-2 text-sm tm-label">
                      <input
                        type="checkbox"
                        checked={reminderSettings.morningCheckInEnabled}
                        onChange={(event) =>
                          void handleReminderToggle('morningCheckInEnabled', event.target.checked)
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      {reminderCopy.enableMorningCheckIn}
                    </span>
                    <span className="block text-xs text-amber-200/70">
                      {reminderCopy.morningCheckInTime}
                    </span>
                    <input
                      type="time"
                      value={reminderSettings.morningCheckInTime}
                      onChange={(event) =>
                        void handleReminderTimeChange('morningCheckInTime', event.target.value)
                      }
                      className="tm-input h-9 text-sm"
                    />
                  </label>
                  <label className="rounded border border-amber-400/15 p-3 space-y-2">
                    <span className="flex items-center gap-2 text-sm tm-label">
                      <input
                        type="checkbox"
                        checked={reminderSettings.eveningReviewEnabled}
                        onChange={(event) =>
                          void handleReminderToggle('eveningReviewEnabled', event.target.checked)
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      {reminderCopy.enableEveningReview}
                    </span>
                    <span className="block text-xs text-amber-200/70">
                      {reminderCopy.eveningReviewTime}
                    </span>
                    <input
                      type="time"
                      value={reminderSettings.eveningReviewTime}
                      onChange={(event) =>
                        void handleReminderTimeChange('eveningReviewTime', event.target.value)
                      }
                      className="tm-input h-9 text-sm"
                    />
                  </label>
                  <label className="rounded border border-amber-400/15 p-3 space-y-2">
                    <span className="flex items-center gap-2 text-sm tm-label">
                      <input
                        type="checkbox"
                        checked={reminderSettings.overdueReminderEnabled}
                        onChange={(event) =>
                          void handleReminderToggle('overdueReminderEnabled', event.target.checked)
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      {reminderCopy.enableOverdueReminder}
                    </span>
                    <span className="block text-xs text-amber-200/70">
                      {reminderCopy.overdueReminderHint}
                    </span>
                  </label>
                </div>
                {notificationHelpText ? (
                  <p className="text-xs text-amber-200/70" role="status" aria-live="polite">
                    {notificationHelpText}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">{copy.data}</p>
            <p className="tm-settings-data-note max-w-2xl text-xs leading-relaxed text-amber-200/65">
              {copy.dataNote}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleTransferToggle}
                className="tm-button tm-button-steel"
                aria-expanded={transferOpen}
              >
                {copy.importExport}
              </button>
              <span className="text-sm text-amber-200/70">
                {copy.transferSummary}
              </span>
            </div>
            {transferOpen ? (
              <div className="tm-panel-soft tm-surface-inset tm-transfer-panel p-3 space-y-4">
                <div className="tm-transfer-panel-header">
                  <div className="tm-transfer-copy">
                    <p className="text-sm text-amber-100">{copy.transferTitle}</p>
                    <p className="text-xs text-amber-200/70">
                      {copy.transferDescription}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTransferGuideToggle}
                    className="tm-button tm-button-steel"
                    aria-expanded={transferGuideOpen}
                  >
                    {copy.howToUse}
                  </button>
                </div>

                {transferGuideOpen ? (
                  <div className="tm-transfer-guide tm-surface-inset space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold tm-title">{copy.planForAi}</p>
                        <ul className="space-y-1.5 text-xs leading-5 text-amber-100/85 pl-4 list-disc">
                          {importExportGuide.planImportGuideItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold tm-title">{copy.backup}</p>
                        <ul className="space-y-1.5 text-xs leading-5 text-amber-100/85 pl-4 list-disc">
                          {importExportGuide.backupGuideItems.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold tm-title">{copy.aiPrompt}</p>
                      <pre className="tm-transfer-prompt whitespace-pre-wrap text-xs leading-5"><code>{importExportGuide.taskmanPlanPrompt}</code></pre>
                    </div>
                  </div>
                ) : null}

                <div className="tm-transfer-section">
                  <div className="tm-transfer-section-heading">
                    <p className="text-sm text-amber-100">{copy.planning}</p>
                    <p className="text-xs text-amber-200/70">
                      {copy.planningDescription}
                    </p>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="tm-transfer-action-copy">
                      <p className="text-sm text-amber-100">{copy.exportPlan}</p>
                      <p className="text-xs text-amber-200/70">
                        {copy.exportPlanDescription}
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handlePlanExport}
                        disabled={planExporting}
                        className="tm-button tm-button-gold"
                      >
                        {planExporting ? copy.exportLoading : copy.exportButton}
                      </button>
                    </div>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="tm-transfer-action-copy">
                      <p className="text-sm text-amber-100">{copy.importPlan}</p>
                      <p className="text-xs text-amber-200/70">
                        {copy.importPlanDescription}
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handlePlanImportClick}
                        disabled={planImporting}
                        className="tm-button tm-button-primary"
                      >
                        {planImporting ? copy.importLoading : copy.importButton}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="tm-transfer-section tm-transfer-section-separated">
                  <div className="tm-transfer-section-heading">
                    <p className="text-sm text-amber-100">{copy.backupTitle}</p>
                    <p className="text-xs text-amber-200/70">
                      {copy.backupDescription}
                    </p>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="tm-transfer-action-copy">
                      <p className="text-sm text-amber-100">{copy.downloadBackup}</p>
                      <p className="text-xs text-amber-200/70">
                        {copy.downloadBackupDescription}
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="tm-button tm-button-gold"
                      >
                        {exporting ? copy.backupExportLoading : copy.downloadBackup}
                      </button>
                    </div>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="tm-transfer-action-copy">
                      <p className="text-sm text-amber-100">{copy.restoreBackup}</p>
                      <p className="text-xs text-amber-200/70">
                        {copy.restoreBackupDescription}
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handleImportClick}
                        className="tm-button tm-button-primary"
                      >
                        {copy.restoreBackup}
                      </button>
                    </div>
                  </div>
                </div>
                {planStatus ? (
                  <p
                    className={`text-xs ${
                      planStatus.tone === 'error' ? 'text-red-300/80' : 'text-emerald-200/80'
                    }`}
                    role="status"
                    aria-live="polite"
                  >
                    {planStatus.text}
                  </p>
                ) : null}
              </div>
            ) : null}
            <input
              ref={planFileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handlePlanImportFile}
              className="hidden"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>
        </div>
      </div>
      {planPreview ? createPortal(
        <div className="tm-plan-preview-overlay">
          <div
            className="tm-plan-preview-shell tm-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={planPreviewTitleId}
          >
            <div className="tm-plan-preview-header space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 id={planPreviewTitleId} className="text-lg sm:text-xl font-semibold tm-title">{copy.previewTitle}</h2>
                </div>
                <button
                  onClick={closePlanPreview}
                  className="tm-button tm-button-ghost tm-button-sm px-3 py-1.5"
                  disabled={planImportApplying}
                >
                  {copy.cancel}
                </button>
              </div>
              <div className="tm-plan-preview-metrics">
                <span>{copy.metrics.projects(previewProjectCount)}</span>
                <span>{copy.metrics.tasks(previewTaskCount)}</span>
                <span>{copy.metrics.selected(previewSelectedCount)}</span>
                <span>{copy.metrics.deselected(previewDeselectedCount)}</span>
              </div>
              {previewHasBlockedSelection ? (
                <div className="tm-plan-preview-warning tm-surface-warning">
                  {copy.blockedWarning}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSelectAllPlanItems}
                  className="tm-button tm-button-gold tm-button-sm"
                  disabled={planImportApplying}
                >
                  {copy.selectAll}
                </button>
                <button
                  onClick={handleClearPlanSelection}
                  className="tm-button tm-button-ghost tm-button-sm"
                  disabled={planImportApplying}
                >
                  {copy.clearAll}
                </button>
              </div>
            </div>
            <div className="tm-plan-preview-body space-y-3">
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tm-title">{copy.projectsTitle}</h3>
                  <span className="text-xs text-amber-200/65">{previewProjectCount}</span>
                </div>
                {planPreview.projects.length > 0 ? (
                  <div className="space-y-1.5">
                    {planPreview.projects.map((project) => {
                      const isSelected = selectedProjectIds.has(project.clientId);
                      const selectedTaskCount = selectedTaskCountByProjectClientId.get(project.clientId) ?? 0;
                      return (
                        <label key={project.id} className="tm-plan-preview-row tm-surface-preview">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePlanProject(project.clientId)}
                            disabled={planImportApplying}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold tm-title min-w-0 break-words">{project.title}</span>
                              <span
                                className={`tm-badge tm-chip ${
                                  project.mode === 'reuse'
                                    ? 'tm-badge-note tm-chip-muted'
                                    : 'tm-chip-success'
                                }`}
                              >
                                {project.mode === 'reuse' ? copy.reuseBadge : copy.newBadge}
                              </span>
                            </div>
                            {project.description ? (
                              <p className="text-xs text-amber-100/80 break-words">{project.description}</p>
                            ) : null}
                            {project.mode === 'reuse' && project.existingProjectTitle ? (
                              <p className="text-[11px] text-amber-200/65">
                                {copy.linkedProject(project.existingProjectTitle)}
                              </p>
                            ) : null}
                            {isSelected && selectedTaskCount === 0 ? (
                              <p className="text-[11px] text-amber-200/65">
                                {copy.projectHasNoSelectedTasks}
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    {copy.noNewProjects}
                  </div>
                )}
              </section>
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tm-title">{copy.tasksTitle}</h3>
                  <span className="text-xs text-amber-200/65">{previewTaskCount}</span>
                </div>
                {planPreview.tasks.length > 0 ? (
                  <div className="space-y-1.5">
                    {planPreview.tasks.map((task) => {
                      const isSelected = selectedTaskIds.has(task.id);
                      const projectUnavailable =
                        Boolean(task.projectClientId) && !selectedProjectIds.has(task.projectClientId);
                      const hasProjectConflict = isSelected && projectUnavailable;
                      const notePreview = getPlanPreviewNote(task.note);
                      return (
                        <label
                          key={task.id}
                          className={`tm-plan-preview-row tm-surface-preview ${
                            task.exactDuplicate ? 'tm-plan-preview-row-muted tm-surface-muted' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePlanTask(task.id)}
                            disabled={planImportApplying || task.exactDuplicate || projectUnavailable}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold tm-title min-w-0 break-words">{task.title}</span>
                              <span className="tm-badge tm-chip tm-chip-muted">{copy.planBucketLabels[task.bucket]}</span>
                            {task.projectTitle ? (
                                <span className="tm-badge tm-badge-note tm-chip tm-chip-project">{task.projectTitle}</span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-amber-200/68">
                              {copy.dueDate}: {task.dueDate ?? copy.noDueDate} · {copy.repeat}: {copy.planPeriodicityLabels[task.periodicity]} · {task.value} XP
                            </p>
                            {notePreview ? (
                              <p className="text-xs text-amber-100/80 break-words">{notePreview}</p>
                            ) : null}
                            {task.duplicateWarning ? (
                              <p className="text-[11px] text-amber-200/68">{copy.duplicateWarning}</p>
                            ) : null}
                            {projectUnavailable ? (
                              <p className="text-[11px] text-red-300/80">
                                {copy.chooseProjectFirst}
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    {copy.noNewTasks}
                  </div>
                )}
              </section>
            </div>
            <div className="tm-plan-preview-footer">
              <p className="text-xs text-amber-200/70">
                {copy.importSelectedNote}
              </p>
              <div className="tm-plan-preview-footer-actions">
                <button
                  onClick={closePlanPreview}
                  className="tm-button tm-button-ghost tm-button-sm px-3 py-1.5"
                  disabled={planImportApplying}
                >
                  {copy.cancel}
                </button>
                <button
                  onClick={handleApplyPlanImport}
                  className="tm-button tm-button-primary"
                  disabled={previewImportDisabled}
                >
                  {planImportApplying ? copy.importLoading : copy.importSelected}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
