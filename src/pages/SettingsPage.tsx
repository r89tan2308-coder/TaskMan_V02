import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';
import {
  readAllForExport,
  replaceAllFromImport
} from '../db/repositories/exportImportRepo';
import { addEvent } from '../db/repositories/ledgerRepo';
import type { PlanImportPreview, PlanImportSelection } from '../entities/plan/types';
import type { Periodicity, TaskBucket } from '../entities/task/types';
import {
  applyPlanImportSelection,
  buildDefaultPlanImportSelection,
  buildPlanExportPayload,
  preparePlanImportPreview
} from '../services/planTransferService';
import {
  BACKUP_GUIDE_ITEMS,
  PLAN_IMPORT_GUIDE_ITEMS,
  TASKMAN_PLAN_PROMPT
} from '../content/importExportGuide';
import { reminderCopy } from '../i18n/reminders';
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

const PLAN_BUCKET_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  next: 'Next',
  backlog: 'Backlog',
  inbox: 'Inbox'
};

const PLAN_PERIODICITY_LABELS: Record<Periodicity, string> = {
  daily: 'ежедневно',
  weekly: 'еженедельно',
  'one-time': 'разовая',
  monthly: 'ежемесячно',
  yearly: 'ежегодно'
};

const pluralizeRu = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const formatPlanImportResult = (projects: number, tasks: number) =>
  `Импортировано: ${projects} ${pluralizeRu(projects, 'проект', 'проекта', 'проектов')}, ${tasks} ${pluralizeRu(tasks, 'задача', 'задачи', 'задач')}.`;

const getPlanImportErrorText = (error: unknown) => {
  if (error instanceof SyntaxError) {
    return 'Файл плана повреждён или имеет неверный формат.';
  }
  return error instanceof Error ? error.message : 'Не удалось загрузить план.';
};

const getBackupImportErrorText = (error: unknown) => {
  if (error instanceof SyntaxError) {
    return 'Файл backup повреждён или имеет неверный JSON-формат.';
  }
  return error instanceof Error ? error.message : 'Не удалось импортировать backup.';
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

  const interfaceLabel =
    interfaceTheme === 'vault'
      ? 'Retro'
      : interfaceTheme === 'handwritten'
      ? 'Рукописный'
      : interfaceTheme === 'hud'
      ? 'HUD'
      : 'Classic';
  const updateStatusLabel =
    updateStatus === 'checking'
      ? 'Проверяем обновления...'
      : updateStatus === 'reloading'
      ? 'Обновление найдено. Перезагрузка...'
      : updateStatus === 'no-update'
      ? 'Обновлений нет.'
      : updateStatus === 'error'
      ? 'Не удалось обновить приложение.'
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
          message: 'Это полностью заменит локальные данные. Продолжить?',
          confirmLabel: 'Продолжить',
          tone: 'danger'
        });
        if (!confirmed) return;
        await replaceAllFromImport(payload);
        window.location.reload();
      } catch (error) {
        await showAppAlert(getBackupImportErrorText(error));
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
        text: `План выгружен: ${payload.projects.length} projects, ${payload.tasks.length} tasks.`
      });
    } catch (error) {
      setPlanStatus({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Не удалось выгрузить план.'
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
        text: getPlanImportErrorText(error)
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
      await showAppAlert('Failed to read background image.');
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
      await showAppAlert('Invalid XP value.');
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
      await showAppAlert('Failed to update XP.');
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
          formatPlanImportResult(result.createdProjects, result.createdTasks) +
          (result.linkedExistingProjects > 0
            ? ` Использовано существующих проектов: ${result.linkedExistingProjects}.`
            : '') +
          (result.reusedProjects > 0 ? ` Совпавших проектов не дублировали: ${result.reusedProjects}.` : '') +
          (result.skippedTasks > 0 ? ` Пропущено похожих задач: ${result.skippedTasks}.` : '')
      });
    } catch (error) {
      setPlanStatus({
        tone: 'error',
        text: getPlanImportErrorText(error)
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
          <h1 className="sr-only">Settings</h1>
          <div className="space-y-2">
            <p className="tm-label">Sections</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate('ledger')}
                className="tm-button tm-button-steel"
              >
                Ledger
              </button>
              <button
                onClick={() => onNavigate('log')}
                className="tm-button tm-button-steel"
              >
                Log
              </button>
              <button
                onClick={() => onNavigate('manual')}
                className="tm-button tm-button-steel"
              >
                Manual
              </button>
              {tetrisAvailable ? (
                <button
                  onClick={() => onNavigate('tetris')}
                  className="tm-button tm-button-gold"
                >
                  Tetris
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <p className="tm-label">Interface</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleInterfaceToggle}
                className="tm-button tm-button-steel"
                aria-expanded={interfaceOpen}
              >
                Interface
              </button>
              <span className="text-sm text-amber-200/70">
                {interfaceLabel}
              </span>
            </div>
            {interfaceOpen ? (
              <div className="tm-panel-soft p-3 space-y-2">
                <p className="text-xs text-amber-200/70">Style</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleThemeChange('classic')}
                    className={`tm-button ${
                      interfaceTheme === 'classic' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Classic
                  </button>
                  <button
                    onClick={() => handleThemeChange('vault')}
                    className={`tm-button ${
                      interfaceTheme === 'vault' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Retro
                  </button>
                  <button
                    onClick={() => handleThemeChange('handwritten')}
                    className={`tm-button ${
                      interfaceTheme === 'handwritten' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    Рукописный
                  </button>
                  <button
                    onClick={() => handleThemeChange('hud')}
                    className={`tm-button ${
                      interfaceTheme === 'hud' ? 'tm-button-gold' : 'tm-button-ghost'
                    }`}
                  >
                    HUD
                  </button>
                </div>
                {interfaceTheme === 'handwritten' ? (
                  <div className="pt-2 space-y-2">
                    <p className="text-xs text-amber-200/70">
                      Фон виден с прозрачностью 20%.
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
                          Удалить фон
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
                    Vexa companion
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-amber-200/70">Motion</span>
                    {(['full', 'reduced', 'static'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => void onPetMotionModeChange(mode)}
                        className={`tm-button tm-button-sm ${
                          petMotionMode === mode ? 'tm-button-gold' : 'tm-button-ghost'
                        }`}
                        disabled={!petEnabled}
                        aria-pressed={petMotionMode === mode}
                      >
                        {mode === 'full' ? 'Full' : mode === 'reduced' ? 'Reduced' : 'Static'}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void onPetPositionReset()}
                      className="tm-button tm-button-sm tm-button-ghost"
                    >
                      Return Vexa
                    </button>
                    <button
                      type="button"
                      onClick={() => void onPetEnabledChange(false)}
                      className="tm-button tm-button-sm tm-button-ghost"
                      disabled={!petEnabled}
                    >
                      Hide Vexa
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">XP</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openXpEditor}
                className="tm-button tm-button-steel"
              >
                Edit XP balance
              </button>
              <span className="text-sm text-amber-200/80">Текущий баланс: {xp} XP</span>
            </div>
            {editingXp ? (
              <div className="tm-panel-soft p-3 space-y-3">
                <div>
                  <label className="block text-sm tm-label mb-1">XP balance</label>
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
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveXp}
                    className="tm-button tm-button-gold"
                    disabled={savingXp}
                  >
                    {savingXp ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            <p className="tm-label">Приложение</p>
            <button
              onClick={handleUpdateApp}
              disabled={updating}
              className="tm-button tm-button-primary"
            >
              {updating ? 'Обновление...' : 'Обновить приложение'}
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
              <div className="tm-panel-soft p-3 space-y-3">
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
                      Разрешить в браузере
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runReminderCheck()}
                      className="tm-button tm-button-ghost"
                    >
                      Проверить сейчас
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
            <p className="tm-label">Данные</p>
            <p className="tm-settings-data-note max-w-2xl text-xs leading-relaxed text-amber-200/65">
              Задачи хранятся локально в текущем браузере и адресе приложения. Разные
              профили, localhost и 127.0.0.1 используют отдельные базы.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleTransferToggle}
                className="tm-button tm-button-steel"
                aria-expanded={transferOpen}
              >
                Импорт / экспорт
              </button>
              <span className="text-sm text-amber-200/70">
                Планирование и backup
              </span>
            </div>
            {transferOpen ? (
              <div className="tm-panel-soft p-3 space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm text-amber-100">Перенос и планирование</p>
                    <p className="text-xs text-amber-200/70">
                      Planning JSON для новых задач, backup JSON для полной копии базы.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleTransferGuideToggle}
                    className="tm-button tm-button-steel"
                    aria-expanded={transferGuideOpen}
                  >
                    Как пользоваться
                  </button>
                </div>

                {transferGuideOpen ? (
                  <div className="tm-transfer-guide space-y-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-semibold tm-title">План для нейронки</p>
                        <ul className="space-y-1.5 text-xs leading-5 text-amber-100/85 pl-4 list-disc">
                          {PLAN_IMPORT_GUIDE_ITEMS.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-semibold tm-title">Backup</p>
                        <ul className="space-y-1.5 text-xs leading-5 text-amber-100/85 pl-4 list-disc">
                          {BACKUP_GUIDE_ITEMS.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold tm-title">Промпт для нейронки</p>
                      <pre className="tm-transfer-prompt whitespace-pre-wrap text-xs leading-5"><code>{TASKMAN_PLAN_PROMPT}</code></pre>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="min-w-0">
                    <p className="text-sm text-amber-100">Планирование</p>
                    <p className="text-xs text-amber-200/70">
                      Экспортирует план наружу и импортирует новые задачи и проекты обратно.
                    </p>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-100">Выгрузить план</p>
                      <p className="text-xs text-amber-200/70">
                        Экспортирует задачи и проекты для внешнего планирования
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handlePlanExport}
                        disabled={planExporting}
                        className="tm-button tm-button-gold"
                      >
                        {planExporting ? 'Export...' : 'Export'}
                      </button>
                    </div>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-100">Загрузить план</p>
                      <p className="text-xs text-amber-200/70">
                        Импортирует новые задачи и проекты из плана
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handlePlanImportClick}
                        disabled={planImporting}
                        className="tm-button tm-button-primary"
                      >
                        {planImporting ? 'Import...' : 'Import'}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="border-t border-amber-400/15 pt-4 space-y-3">
                  <div className="min-w-0">
                    <p className="text-sm text-amber-100">Резервная копия</p>
                    <p className="text-xs text-amber-200/70">
                      Полный экспорт и восстановление приложения. Импорт полностью заменяет локальные данные.
                    </p>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-100">Скачать backup</p>
                      <p className="text-xs text-amber-200/70">
                        Сохраняет полную копию локальных данных в JSON
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="tm-button tm-button-gold"
                      >
                        {exporting ? 'Экспорт...' : 'Скачать backup'}
                      </button>
                    </div>
                  </div>
                  <div className="tm-transfer-action-row">
                    <div className="min-w-0">
                      <p className="text-sm text-amber-100">Восстановить backup</p>
                      <p className="text-xs text-amber-200/70">
                        Полностью заменяет текущую локальную базу выбранным backup
                      </p>
                    </div>
                    <div className="tm-transfer-actions">
                      <button
                        onClick={handleImportClick}
                        className="tm-button tm-button-primary"
                      >
                        Восстановить backup
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
      {planPreview ? (
        <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center px-3 py-4 sm:px-4 sm:py-6 overflow-y-auto z-[220]">
          <div className="w-full max-w-4xl tm-panel p-3 sm:p-4 shadow-xl max-h-[90vh] overflow-hidden flex flex-col gap-3">
            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold tm-title">Предпросмотр импорта плана</h2>
                </div>
                <button
                  onClick={closePlanPreview}
                  className="tm-button tm-button-ghost tm-button-sm px-3 py-1.5"
                  disabled={planImportApplying}
                >
                  Отмена
                </button>
              </div>
              <div className="tm-plan-preview-metrics">
                <span>Проектов {previewProjectCount}</span>
                <span>Задач {previewTaskCount}</span>
                <span>Выбрано {previewSelectedCount}</span>
                <span>Снято {previewDeselectedCount}</span>
              </div>
              {previewHasBlockedSelection ? (
                <div className="tm-plan-preview-warning">
                  Есть задачи со снятыми проектами. Верни проект или сними такие задачи.
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSelectAllPlanItems}
                  className="tm-button tm-button-gold tm-button-sm"
                  disabled={planImportApplying}
                >
                  Выбрать всё
                </button>
                <button
                  onClick={handleClearPlanSelection}
                  className="tm-button tm-button-ghost tm-button-sm"
                  disabled={planImportApplying}
                >
                  Снять всё
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto pr-1 space-y-3">
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tm-title">Проекты</h3>
                  <span className="text-xs text-amber-200/65">{previewProjectCount}</span>
                </div>
                {planPreview.projects.length > 0 ? (
                  <div className="space-y-1.5">
                    {planPreview.projects.map((project) => {
                      const isSelected = selectedProjectIds.has(project.clientId);
                      const selectedTaskCount = selectedTaskCountByProjectClientId.get(project.clientId) ?? 0;
                      return (
                        <label key={project.id} className="tm-plan-preview-row">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePlanProject(project.clientId)}
                            disabled={planImportApplying}
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold tm-title">{project.title}</span>
                              <span className={`tm-badge ${project.mode === 'reuse' ? 'tm-badge-note' : ''}`}>
                                {project.mode === 'reuse' ? 'Уже есть' : 'Новый'}
                              </span>
                            </div>
                            {project.description ? (
                              <p className="text-xs text-amber-100/80 break-words">{project.description}</p>
                            ) : null}
                            {project.mode === 'reuse' && project.existingProjectTitle ? (
                              <p className="text-[11px] text-amber-200/65">
                                Будет привязан к существующему проекту: {project.existingProjectTitle}
                              </p>
                            ) : null}
                            {isSelected && selectedTaskCount === 0 ? (
                              <p className="text-[11px] text-amber-200/65">
                                У этого проекта не осталось выбранных задач.
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    В этом плане нет новых проектов.
                  </div>
                )}
              </section>
              <section className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold tm-title">Задачи</h3>
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
                          className={`tm-plan-preview-row ${
                            task.exactDuplicate ? 'tm-plan-preview-row-muted' : ''
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
                              <span className="font-semibold tm-title">{task.title}</span>
                              <span className="tm-badge">{PLAN_BUCKET_LABELS[task.bucket]}</span>
                            {task.projectTitle ? (
                                <span className="tm-badge tm-badge-note">{task.projectTitle}</span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-amber-200/68">
                              Дедлайн: {task.dueDate ?? 'не задан'} · Повтор: {PLAN_PERIODICITY_LABELS[task.periodicity]} · {task.value} XP
                            </p>
                            {notePreview ? (
                              <p className="text-xs text-amber-100/80 break-words">{notePreview}</p>
                            ) : null}
                            {task.duplicateWarning ? (
                              <p className="text-[11px] text-amber-200/68">{task.duplicateWarning}</p>
                            ) : null}
                            {projectUnavailable ? (
                              <p className="text-[11px] text-red-300/80">
                                Сначала выбери проект, чтобы импортировать эту задачу.
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    В этом плане нет новых задач.
                  </div>
                )}
              </section>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-amber-400/15 pt-2.5">
              <p className="text-xs text-amber-200/70">
                Импортируются только отмеченные элементы. Дубликаты и задачи со снятыми проектами не будут применены.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={closePlanPreview}
                  className="tm-button tm-button-ghost tm-button-sm px-3 py-1.5"
                  disabled={planImportApplying}
                >
                  Отмена
                </button>
                <button
                  onClick={handleApplyPlanImport}
                  className="tm-button tm-button-primary"
                  disabled={previewImportDisabled}
                >
                  {planImportApplying ? 'Импорт...' : 'Импортировать выбранное'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
