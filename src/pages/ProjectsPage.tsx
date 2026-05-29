import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { TaskEditorModal } from '../components/TaskEditorModal';
import { showAppAlert } from '../components/AppDialog';
import { listEvents } from '../db/repositories/ledgerRepo';
import { Project, ProjectStatus } from '../entities/project/types';
import { Periodicity, Rarity, Task, TaskBucket } from '../entities/task/types';
import {
  getProjectActiveTasks,
  getProjectCompletedCount,
  getProjectCompletedTasks,
  getProjectProgress,
  getProjectTasks,
  isProjectCompleted
} from '../logic/projects';
import { buildTaskStatusById, TaskStatus } from '../logic/taskStatus';
import { xpForTask } from '../logic/xp';
import { createProject, listProjects, updateProject } from '../services/projectsService';
import { ProjectCompletionBonusAward } from '../services/taskEventService';
import {
  completeTask,
  listTasks,
  undoComplete,
  updateTask
} from '../services/tasksService';
import { useLocale, type AppLocale } from '../i18n/appLocale';

const PROJECTS_COPY = {
  ru: {
    statusLabels: {
      active: 'Активный',
      paused: 'На паузе',
      completed: 'Завершён',
      archived: 'Архив'
    } satisfies Record<ProjectStatus, string>,
    periodicityLabels: {
      daily: 'Ежедневно',
      weekly: 'Раз в неделю',
      'one-time': 'Разово',
      monthly: 'Раз в месяц',
      yearly: 'Раз в год'
    } satisfies Record<Periodicity, string>,
    queueLabels: {
      today: 'Сегодня',
      inbox: 'Входящие',
      next: 'Далее',
      backlog: 'Запас'
    } satisfies Record<TaskBucket, string>,
    editProject: 'Редактировать проект',
    newProject: 'Новый проект',
    title: 'Название',
    titlePlaceholder: 'Например: Ремонт кухни',
    description: 'Описание',
    descriptionPlaceholder: 'Коротко: что входит в проект',
    status: 'Статус',
    cancel: 'Отмена',
    saving: 'Сохранение...',
    save: 'Сохранить',
    editProjectTask: 'Редактировать задачу проекта',
    newProjectTask: 'Новая задача проекта',
    dragHint: 'Перетащить, чтобы изменить порядок',
    overdue: 'Просрочено',
    missed: 'Пропущено',
    value: 'Ценность',
    deadline: 'Дедлайн',
    edit: 'Изменить',
    complete: 'Завершить',
    undo: 'Отменить',
    projectCompleted: 'Проект завершён',
    allTasksClosed: 'Все задачи проекта закрыты.',
    completionBonus: (xp: number) => `Бонус за завершение: +${xp} XP`,
    continue: 'Продолжить',
    back: '← Проекты',
    addTask: '+ Задача',
    editProjectAction: 'Изменить проект',
    completedCount: (completed: number, total: number) => `${completed} / ${total} задач завершено`,
    activeDone: (active: number, done: number) => `Активных ${active} · Сделано ${done}`,
    progress: 'Прогресс',
    bonusAwarded: (xp: number) => `Начислен бонус: +${xp} XP`,
    activeTasks: 'Активные задачи',
    emptyActive:
      'В проекте пока нет активных задач. Добавь первую и прогресс появится автоматически.',
    completedTasks: 'Завершённые задачи',
    emptyCompleted:
      'Пока ничего не закрыто. Когда завершишь первую задачу проекта, она появится здесь.',
    intro: 'Контейнеры для больших целей. Прогресс считается по обычным задачам.',
    addProject: '+ Проект',
    loadingProjects: 'Загрузка проектов...',
    emptyTitle: 'Пока нет проектов',
    emptyText:
      'Создай проект, а потом привязывай к нему обычные задачи. Прогресс будет считаться автоматически.',
    createProject: 'Создать проект',
    open: 'Открыть',
    reorderFailed: 'Не удалось изменить порядок задач проекта.',
    updatingTask: 'Обновляем задачу...'
  },
  en: {
    statusLabels: {
      active: 'Active',
      paused: 'Paused',
      completed: 'Completed',
      archived: 'Archive'
    } satisfies Record<ProjectStatus, string>,
    periodicityLabels: {
      daily: 'Daily',
      weekly: 'Weekly',
      'one-time': 'One-time',
      monthly: 'Monthly',
      yearly: 'Yearly'
    } satisfies Record<Periodicity, string>,
    queueLabels: {
      today: 'Today',
      inbox: 'Inbox',
      next: 'Next',
      backlog: 'Backlog'
    } satisfies Record<TaskBucket, string>,
    editProject: 'Edit Project',
    newProject: 'New Project',
    title: 'Title',
    titlePlaceholder: 'Example: Kitchen renovation',
    description: 'Description',
    descriptionPlaceholder: 'Briefly describe what belongs here',
    status: 'Status',
    cancel: 'Cancel',
    saving: 'Saving...',
    save: 'Save',
    editProjectTask: 'Edit Project Task',
    newProjectTask: 'New Project Task',
    dragHint: 'Drag to reorder',
    overdue: 'Overdue',
    missed: 'Missed',
    value: 'Value',
    deadline: 'Due',
    edit: 'Edit',
    complete: 'Complete',
    undo: 'Undo',
    projectCompleted: 'Project Completed',
    allTasksClosed: 'All project tasks are closed.',
    completionBonus: (xp: number) => `Completion bonus: +${xp} XP`,
    continue: 'Continue',
    back: '← Projects',
    addTask: '+ Task',
    editProjectAction: 'Edit Project',
    completedCount: (completed: number, total: number) => `${completed} / ${total} tasks completed`,
    activeDone: (active: number, done: number) => `Active ${active} · Done ${done}`,
    progress: 'Progress',
    bonusAwarded: (xp: number) => `Bonus awarded: +${xp} XP`,
    activeTasks: 'Active Tasks',
    emptyActive: 'This project has no active tasks yet. Add the first one to start tracking progress.',
    completedTasks: 'Completed Tasks',
    emptyCompleted: 'Nothing is closed yet. Completed project tasks will appear here.',
    intro: 'Containers for larger goals. Progress is calculated from regular tasks.',
    addProject: '+ Project',
    loadingProjects: 'Loading projects...',
    emptyTitle: 'No Projects Yet',
    emptyText: 'Create a project, then attach regular tasks to it. Progress will update automatically.',
    createProject: 'Create Project',
    open: 'Open',
    reorderFailed: 'Could not reorder project tasks.',
    updatingTask: 'Updating task...'
  }
} satisfies Record<AppLocale, unknown>;

const pad2 = (value: number) => value.toString().padStart(2, '0');

const formatDeadline = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${pad2(date.getHours())}:${pad2(
    date.getMinutes()
  )}`;
};

const getTaskValue = (task: Task) =>
  typeof task.xpOverride === 'number' ? task.xpOverride : xpForTask(task);

const getTaskSortValue = (task: Task) =>
  typeof task.sortOrder === 'number' ? task.sortOrder : Date.parse(task.createdAt ?? '') || 0;

const getDisplayProjectStatus = (
  project: Project,
  tasks: Task[],
  taskStatusById: Record<string, TaskStatus>
): ProjectStatus => {
  if (project.status === 'paused' || project.status === 'archived') return project.status;
  return isProjectCompleted(tasks, taskStatusById, project.id) ? 'completed' : project.status;
};

const getProjectStatusToneClass = (status: ProjectStatus) => {
  if (status === 'completed') return 'tm-project-status-completed';
  if (status === 'paused') return 'tm-project-status-paused';
  if (status === 'archived') return 'tm-project-status-archived';
  return 'tm-project-status-active';
};

const getProjectStatusChipClass = (status: ProjectStatus) => {
  if (status === 'completed' || status === 'active') return 'tm-chip-success';
  if (status === 'paused') return 'tm-chip-warning';
  return 'tm-chip-muted';
};

function ProjectProgressBar({ value }: { value: number }) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="tm-progress tm-progress-project w-full"
      role="progressbar"
      aria-label={copy.progress}
      aria-valuenow={normalized}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${normalized}%`}
    >
      <div className="tm-progress-fill" style={{ width: `${normalized}%` }} />
      <span className="tm-progress-value">{normalized}%</span>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  return (
    <span className={`tm-project-status tm-chip ${getProjectStatusToneClass(status)} ${getProjectStatusChipClass(status)}`}>
      {copy.statusLabels[status]}
    </span>
  );
}

function ProjectModal({
  open,
  project,
  onClose,
  onSaved
}: {
  open: boolean;
  project: Project | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? '');
    setDescription(project?.description ?? '');
    setStatus(project?.status ?? 'active');
    setSaving(false);
  }, [open, project]);

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

  const handleSave = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setSaving(true);
    try {
      if (project) {
        await updateProject({
          ...project,
          title: trimmedTitle,
          description: description.trim() ? description.trim() : undefined,
          status
        });
      } else {
        await createProject({
          title: trimmedTitle,
          description: description.trim() ? description.trim() : undefined,
          status
        });
      }
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto">
      <div
        className="w-full max-w-md tm-panel p-6 shadow-xl space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-xl font-semibold tm-title">
          {project ? copy.editProject : copy.newProject}
        </h2>
        <div>
          <label className="block text-sm tm-label mb-1">{copy.title}</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="tm-input"
            placeholder={copy.titlePlaceholder}
            maxLength={120}
          />
        </div>
        <div>
          <label className="block text-sm tm-label mb-1">{copy.description}</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="tm-input"
            rows={3}
            placeholder={copy.descriptionPlaceholder}
          />
        </div>
        <div>
          <label className="block text-sm tm-label mb-1">{copy.status}</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            className="tm-select"
          >
            <option value="active">{copy.statusLabels.active}</option>
            <option value="paused">{copy.statusLabels.paused}</option>
            <option value="completed">{copy.statusLabels.completed}</option>
            <option value="archived">{copy.statusLabels.archived}</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tm-button tm-button-ghost"
            disabled={saving}
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="tm-button tm-button-primary"
            disabled={saving}
          >
            {saving ? copy.saving : copy.save}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectTaskModal({
  open,
  project,
  task,
  onClose,
  onSaved
}: {
  open: boolean;
  project: Project | null;
  task: Task | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  return (
    <TaskEditorModal
      open={open && Boolean(project)}
      mode={task ? 'edit' : 'create'}
      task={task}
      onClose={onClose}
      onSaved={onSaved}
      projects={project ? [project] : []}
      modalTitle={task ? copy.editProjectTask : copy.newProjectTask}
      defaultBucket="next"
      contextProject={project}
    />
  );
}

function ProjectTaskRow({
  task,
  status,
  onComplete,
  onUndo,
  onEdit,
  dragEnabled = false,
  showDragGrip = false,
  dragging = false,
  dragOver = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd
}: {
  task: Task;
  status: TaskStatus;
  onComplete: (task: Task) => void;
  onUndo: (task: Task) => void;
  onEdit: (task: Task) => void;
  dragEnabled?: boolean;
  showDragGrip?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDrop?: (event: DragEvent<HTMLDivElement>, taskId: string) => void;
  onDragEnd?: () => void;
}) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  const deadlineLabel = formatDeadline(task.deadline);
  const taskValue = getTaskValue(task);
  const showUndo = status === 'completed';

  return (
    <div
      className={`tm-card tm-project-task-row px-3 py-3 space-y-3 ${
        dragging ? 'tm-dragging' : ''
      } ${dragOver ? 'tm-drag-over' : ''}`}
      onDragOver={(event) => onDragOver?.(event, task.id)}
      onDrop={(event) => onDrop?.(event, task.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`tm-project-task-main ${dragEnabled ? 'tm-project-task-main-draggable' : ''}`}
          draggable={dragEnabled}
          onDragStart={(event) => onDragStart?.(event, task.id)}
          onDragEnd={onDragEnd}
          title={dragEnabled ? copy.dragHint : undefined}
        >
          {showDragGrip ? <span className="tm-project-task-grip" aria-hidden="true">↕</span> : null}
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="tm-task-title whitespace-normal break-words">{task.title}</h3>
              {status === 'overdue' ? (
                <span className="tm-badge tm-badge-danger tm-chip tm-chip-danger">{copy.overdue}</span>
              ) : null}
              {status === 'missed' ? (
                <span className="tm-badge tm-badge-danger tm-chip tm-chip-danger">{copy.missed}</span>
              ) : null}
            </div>
            <p className="text-sm text-amber-200/80">
              {copy.queueLabels[task.bucket]} · {copy.periodicityLabels[task.periodicity]} · {copy.value} {taskValue}
            </p>
            {deadlineLabel ? <p className="text-xs text-amber-200/70">{copy.deadline} {deadlineLabel}</p> : null}
            {task.comment ? (
              <p className="text-sm text-amber-100/90 whitespace-pre-wrap">{task.comment}</p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0">
          {showUndo ? (
            <button
              type="button"
              onClick={() => onUndo(task)}
              className="tm-button tm-button-steel tm-button-sm"
            >
              {copy.undo}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onComplete(task)}
              className="tm-button tm-button-primary tm-button-sm"
              aria-label={`${copy.complete}: ${task.title}`}
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="tm-button tm-button-ghost tm-button-sm"
          >
            {copy.edit}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCompletionModal({
  award,
  onClose
}: {
  award: ProjectCompletionBonusAward | null;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  const titleId = useId();
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!award || typeof document === 'undefined') return;
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    };
  }, [award]);

  useEffect(() => {
    if (!award || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [award, onClose]);

  if (!award) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto z-[190]">
      <div
        className="w-full max-w-md tm-panel p-6 shadow-xl space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="space-y-2">
          <h2 id={titleId} className="text-2xl font-semibold tm-title">{copy.projectCompleted}</h2>
          <p className="text-sm text-amber-200/80">{copy.allTasksClosed}</p>
          <p className="text-base font-semibold text-emerald-300">
            {copy.completionBonus(award.bonusXp)}
          </p>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="tm-button tm-button-primary">
            {copy.continue}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const { locale } = useLocale();
  const copy = PROJECTS_COPY[locale];
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskStatusById, setTaskStatusById] = useState<Record<string, TaskStatus>>({});
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [projectCompletionAward, setProjectCompletionAward] = useState<ProjectCompletionBonusAward | null>(null);
  const [draggingProjectTaskId, setDraggingProjectTaskId] = useState<string | null>(null);
  const [dragOverProjectTaskId, setDragOverProjectTaskId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [projectsData, tasksData, eventsData] = await Promise.all([
      listProjects(),
      listTasks(),
      listEvents()
    ]);
    setProjects(projectsData);
    setTasks(tasksData);
    setTaskStatusById(buildTaskStatusById(tasksData, eventsData));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const selectedProjectDisplayStatus = useMemo(
    () =>
      selectedProject ? getDisplayProjectStatus(selectedProject, tasks, taskStatusById) : null,
    [selectedProject, tasks, taskStatusById]
  );

  const selectedProjectTasks = useMemo(
    () => (selectedProject ? getProjectTasks(tasks, selectedProject.id) : []),
    [selectedProject, tasks]
  );

  const selectedProjectActiveTasks = useMemo(
    () =>
      selectedProject
        ? getProjectActiveTasks(tasks, taskStatusById, selectedProject.id)
        : [],
    [selectedProject, tasks, taskStatusById]
  );

  const selectedProjectCompletedTasks = useMemo(
    () =>
      selectedProject
        ? getProjectCompletedTasks(tasks, taskStatusById, selectedProject.id)
        : [],
    [selectedProject, tasks, taskStatusById]
  );

  const openCreateProject = () => {
    setEditingProject(null);
    setProjectModalOpen(true);
  };

  const openEditProject = (project: Project) => {
    setEditingProject(project);
    setProjectModalOpen(true);
  };

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskModalOpen(true);
  };

  const openEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskModalOpen(true);
  };

  const handleComplete = async (task: Task) => {
    setBusyTaskId(task.id);
    try {
      const result = await completeTask(task.id);
      await load();
      if (result.projectBonus) {
        setProjectCompletionAward(result.projectBonus);
      }
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleUndo = async (task: Task) => {
    setBusyTaskId(task.id);
    try {
      await undoComplete(task.id);
      await load();
    } finally {
      setBusyTaskId(null);
    }
  };

  const sortedSelectedActiveTasks = useMemo(
    () =>
      [...selectedProjectActiveTasks].sort((left, right) => {
        const sortDelta = getTaskSortValue(right) - getTaskSortValue(left);
        if (sortDelta !== 0) {
          return sortDelta;
        }
        return left.title.localeCompare(right.title, 'ru-RU');
      }),
    [selectedProjectActiveTasks]
  );

  const sortedSelectedCompletedTasks = useMemo(
    () =>
      [...selectedProjectCompletedTasks].sort((left, right) =>
        left.title.localeCompare(right.title, 'ru-RU')
      ),
    [selectedProjectCompletedTasks]
  );

  const canReorderProjectTasks = sortedSelectedActiveTasks.length > 1 && !busyTaskId;

  const reorderProjectTasks = async (sourceId: string, targetId: string) => {
    const sourceIndex = sortedSelectedActiveTasks.findIndex((task) => task.id === sourceId);
    const targetIndex = sortedSelectedActiveTasks.findIndex((task) => task.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

    const reordered = [...sortedSelectedActiveTasks];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const maxSortValue = reordered.reduce(
      (maxValue, task) => Math.max(maxValue, getTaskSortValue(task)),
      Date.now()
    );
    const base = maxSortValue + reordered.length;
    const reorderedWithSort = reordered.map((task, index) => ({
      ...task,
      sortOrder: base - index
    }));
    const updatedMap = new Map(reorderedWithSort.map((task) => [task.id, task]));

    setTasks((prev) => prev.map((task) => updatedMap.get(task.id) ?? task));
    setDraggingProjectTaskId(null);
    setDragOverProjectTaskId(null);

    try {
      await Promise.all(reorderedWithSort.map((task) => updateTask(task)));
      await load();
    } catch (error) {
      await showAppAlert(copy.reorderFailed);
      await load();
    }
  };

  const handleProjectTaskDragStart = (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorderProjectTasks) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    setDraggingProjectTaskId(taskId);
  };

  const handleProjectTaskDragOver = (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorderProjectTasks || !draggingProjectTaskId) return;
    if (draggingProjectTaskId === taskId) return;
    if (!sortedSelectedActiveTasks.some((task) => task.id === taskId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverProjectTaskId(taskId);
  };

  const handleProjectTaskDrop = async (event: DragEvent<HTMLDivElement>, taskId: string) => {
    if (!canReorderProjectTasks) return;
    event.preventDefault();
    const sourceId = draggingProjectTaskId ?? event.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === taskId) {
      setDragOverProjectTaskId(null);
      return;
    }
    await reorderProjectTasks(sourceId, taskId);
  };

  const handleProjectTaskDragEnd = () => {
    setDraggingProjectTaskId(null);
    setDragOverProjectTaskId(null);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          {selectedProject ? (
            <>
              <section className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(null)}
                    className="tm-button tm-button-ghost tm-button-sm"
                  >
                    {copy.back}
                  </button>
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-3xl font-semibold tm-title break-words">
                        {selectedProject.title}
                      </h1>
                      <ProjectStatusBadge status={selectedProjectDisplayStatus ?? selectedProject.status} />
                    </div>
                    {selectedProject.description ? (
                      <p className="text-sm text-amber-200/80 whitespace-pre-wrap">
                        {selectedProject.description}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={openCreateTask}
                    className="tm-button tm-button-primary"
                  >
                    {copy.addTask}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditProject(selectedProject)}
                    className="tm-button tm-button-ghost"
                  >
                    {copy.editProjectAction}
                  </button>
                </div>
              </section>

              <section className="tm-panel-soft tm-surface-inset p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm text-amber-200/80">
                      {copy.completedCount(
                        getProjectCompletedCount(tasks, taskStatusById, selectedProject.id),
                        selectedProjectTasks.length
                      )}
                    </p>
                    <p className="text-xs text-amber-200/70">
                      {copy.activeDone(
                        selectedProjectActiveTasks.length,
                        selectedProjectCompletedTasks.length
                      )}
                    </p>
                  </div>
                  <p className="text-lg font-semibold tm-title">
                    {getProjectProgress(tasks, taskStatusById, selectedProject.id)}%
                  </p>
                </div>
                <ProjectProgressBar
                  value={getProjectProgress(tasks, taskStatusById, selectedProject.id)}
                />
              </section>

              {selectedProjectDisplayStatus === 'completed' ? (
                <section className="tm-panel-soft tm-surface-success p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tm-title">{copy.projectCompleted}</h2>
                    <ProjectStatusBadge status="completed" />
                  </div>
                  <p className="text-sm text-amber-200/80">{copy.allTasksClosed}</p>
                  <p className="text-xs text-amber-200/70">{copy.progress}: 100%</p>
                  {typeof selectedProject.completionBonusXp === 'number' ? (
                    <p className="text-sm font-semibold text-emerald-300">
                      {copy.bonusAwarded(selectedProject.completionBonusXp)}
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold tm-title">{copy.activeTasks}</h2>
                  <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{selectedProjectActiveTasks.length}</span>
                </div>
                {sortedSelectedActiveTasks.length > 0 ? (
                  <div className="space-y-3">
                    {sortedSelectedActiveTasks.map((task) => (
                      <ProjectTaskRow
                        key={task.id}
                        task={task}
                        status={taskStatusById[task.id] ?? 'pending'}
                        onComplete={(nextTask) => {
                          void handleComplete(nextTask);
                        }}
                        onUndo={(nextTask) => {
                          void handleUndo(nextTask);
                        }}
                        onEdit={openEditTask}
                        dragEnabled={canReorderProjectTasks}
                        showDragGrip={canReorderProjectTasks}
                        dragging={draggingProjectTaskId === task.id}
                        dragOver={dragOverProjectTaskId === task.id && draggingProjectTaskId !== task.id}
                        onDragStart={handleProjectTaskDragStart}
                        onDragOver={handleProjectTaskDragOver}
                        onDrop={(event, taskId) => {
                          void handleProjectTaskDrop(event, taskId);
                        }}
                        onDragEnd={handleProjectTaskDragEnd}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="tm-panel-soft tm-surface-muted p-4">
                    <p className="text-sm text-amber-200/80">
                      {copy.emptyActive}
                    </p>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold tm-title">{copy.completedTasks}</h2>
                  <span className="tm-badge tm-badge-note tm-chip tm-chip-muted">{selectedProjectCompletedTasks.length}</span>
                </div>
                {sortedSelectedCompletedTasks.length > 0 ? (
                  <div className="space-y-3">
                    {sortedSelectedCompletedTasks.map((task) => (
                      <ProjectTaskRow
                        key={task.id}
                        task={task}
                        status={taskStatusById[task.id] ?? 'completed'}
                        onComplete={(nextTask) => {
                          void handleComplete(nextTask);
                        }}
                        onUndo={(nextTask) => {
                          void handleUndo(nextTask);
                        }}
                        onEdit={openEditTask}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="tm-panel-soft tm-surface-muted p-4">
                    <p className="text-sm text-amber-200/80">
                      {copy.emptyCompleted}
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="sr-only">Projects</h1>
                  <p className="text-sm text-amber-200/80">
                    {copy.intro}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateProject}
                  className="tm-button tm-button-primary"
                >
                  {copy.addProject}
                </button>
              </section>

              {loading ? (
                <div className="tm-panel-soft p-4">
                  <p className="text-amber-200/80">{copy.loadingProjects}</p>
                </div>
              ) : projects.length === 0 ? (
                <div className="tm-panel-soft tm-surface-muted p-5 space-y-3">
                  <h2 className="text-xl font-semibold tm-title">{copy.emptyTitle}</h2>
                  <p className="text-sm text-amber-200/80">
                    {copy.emptyText}
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={openCreateProject}
                      className="tm-button tm-button-primary"
                    >
                      {copy.createProject}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {projects.map((project) => {
                    const totalTasks = getProjectTasks(tasks, project.id).length;
                    const completedCount = getProjectCompletedCount(tasks, taskStatusById, project.id);
                    const progress = getProjectProgress(tasks, taskStatusById, project.id);
                    const displayStatus = getDisplayProjectStatus(project, tasks, taskStatusById);
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => setSelectedProjectId(project.id)}
                        className="tm-panel-soft tm-surface-interactive tm-project-card p-4 text-left w-full"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-2 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-xl font-semibold tm-title break-words">
                                {project.title}
                              </h2>
                              <ProjectStatusBadge status={displayStatus} />
                            </div>
                            {project.description ? (
                              <p className="text-sm text-amber-200/80 whitespace-pre-wrap">
                                {project.description}
                              </p>
                            ) : null}
                            <p className="text-sm text-amber-200/80">
                              {copy.completedCount(completedCount, totalTasks)}
                            </p>
                            <ProjectProgressBar value={progress} />
                          </div>
                          <span className="tm-button tm-button-ghost tm-button-sm">{copy.open}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ProjectModal
        open={projectModalOpen}
        project={editingProject}
        onClose={() => {
          setProjectModalOpen(false);
          setEditingProject(null);
        }}
        onSaved={load}
      />

      <ProjectTaskModal
        open={taskModalOpen}
        project={selectedProject}
        task={editingTask}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSaved={load}
      />

      <ProjectCompletionModal
        award={projectCompletionAward}
        onClose={() => setProjectCompletionAward(null)}
      />

      {busyTaskId ? (
        <div className="tm-project-busy-toast" role="status" aria-live="polite">
          {copy.updatingTask}
        </div>
      ) : null}
    </div>
  );
}
