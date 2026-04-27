import { useEffect, useMemo, useState } from 'react';
import { TaskEditorModal } from '../components/TaskEditorModal';
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
  undoComplete
} from '../services/tasksService';

const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: 'Активный',
  paused: 'На паузе',
  completed: 'Завершён',
  archived: 'Архив'
};

const PERIODICITY_LABELS: Record<Periodicity, string> = {
  daily: 'Ежедневно',
  weekly: 'Раз в неделю',
  'one-time': 'Разово',
  monthly: 'Раз в месяц',
  yearly: 'Раз в год'
};

const QUEUE_LABELS: Record<TaskBucket, string> = {
  today: 'Today',
  inbox: 'Inbox',
  next: 'Next',
  backlog: 'Backlog'
};

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

function ProjectProgressBar({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className="tm-progress w-full"
      role="progressbar"
      aria-valuenow={normalized}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="tm-progress-fill" style={{ width: `${normalized}%` }} />
      <span className="tm-progress-value">{normalized}%</span>
    </div>
  );
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`tm-project-status ${getProjectStatusToneClass(status)}`}>
      {PROJECT_STATUS_LABELS[status]}
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(project?.title ?? '');
    setDescription(project?.description ?? '');
    setStatus(project?.status ?? 'active');
    setSaving(false);
  }, [open, project]);

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
      <div className="w-full max-w-md tm-panel p-6 shadow-xl space-y-4">
        <h2 className="text-xl font-semibold tm-title">
          {project ? 'Редактировать проект' : 'Новый проект'}
        </h2>
        <div>
          <label className="block text-sm tm-label mb-1">Название</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="tm-input"
            placeholder="Например: Ремонт кухни"
            maxLength={120}
          />
        </div>
        <div>
          <label className="block text-sm tm-label mb-1">Описание</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="tm-input"
            rows={3}
            placeholder="Коротко: что входит в проект"
          />
        </div>
        <div>
          <label className="block text-sm tm-label mb-1">Статус</label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectStatus)}
            className="tm-select"
          >
            <option value="active">Активный</option>
            <option value="paused">На паузе</option>
            <option value="completed">Завершён</option>
            <option value="archived">Архив</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
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
            onClick={handleSave}
            className="tm-button tm-button-primary"
            disabled={saving}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
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
  return (
    <TaskEditorModal
      open={open && Boolean(project)}
      mode={task ? 'edit' : 'create'}
      task={task}
      onClose={onClose}
      onSaved={onSaved}
      projects={project ? [project] : []}
      modalTitle={task ? 'Редактировать задачу проекта' : 'Новая задача проекта'}
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
  onEdit
}: {
  task: Task;
  status: TaskStatus;
  onComplete: (task: Task) => void;
  onUndo: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const deadlineLabel = formatDeadline(task.deadline);
  const taskValue = getTaskValue(task);
  const showUndo = status === 'completed';

  return (
    <div className="tm-card tm-project-task-row px-3 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="tm-task-title whitespace-normal break-words">{task.title}</h3>
            {status === 'overdue' ? <span className="tm-badge tm-badge-danger">Просрочено</span> : null}
            {status === 'missed' ? <span className="tm-badge tm-badge-danger">Пропущено</span> : null}
          </div>
          <p className="text-sm text-amber-200/80">
            {QUEUE_LABELS[task.bucket]} · {PERIODICITY_LABELS[task.periodicity]} · Ценность {taskValue}
          </p>
          {deadlineLabel ? <p className="text-xs text-amber-200/70">Дедлайн {deadlineLabel}</p> : null}
          {task.comment ? (
            <p className="text-sm text-amber-100/90 whitespace-pre-wrap">{task.comment}</p>
          ) : null}
        </div>
        <div className="flex flex-col items-stretch gap-2 shrink-0">
          {showUndo ? (
            <button
              type="button"
              onClick={() => onUndo(task)}
              className="tm-button tm-button-steel tm-button-sm"
            >
              Undo
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onComplete(task)}
              className="tm-button tm-button-primary tm-button-sm"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="tm-button tm-button-ghost tm-button-sm"
          >
            Edit
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
  if (!award) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-start sm:items-center justify-center px-4 py-6 overflow-y-auto z-[190]">
      <div className="w-full max-w-md tm-panel p-6 shadow-xl space-y-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tm-title">Проект завершён</h2>
          <p className="text-sm text-amber-200/80">Все задачи проекта закрыты.</p>
          <p className="text-base font-semibold text-emerald-300">
            Бонус за завершение: +{award.bonusXp} XP
          </p>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="tm-button tm-button-primary">
            Продолжить
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
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
        const leftStatus = taskStatusById[left.id];
        const rightStatus = taskStatusById[right.id];
        if (leftStatus === 'overdue' && rightStatus !== 'overdue') return -1;
        if (rightStatus === 'overdue' && leftStatus !== 'overdue') return 1;
        const leftCreatedAt = Date.parse(left.createdAt);
        const rightCreatedAt = Date.parse(right.createdAt);
        if (!Number.isNaN(leftCreatedAt) && !Number.isNaN(rightCreatedAt) && leftCreatedAt !== rightCreatedAt) {
          return rightCreatedAt - leftCreatedAt;
        }
        return left.title.localeCompare(right.title, 'ru-RU');
      }),
    [selectedProjectActiveTasks, taskStatusById]
  );

  const sortedSelectedCompletedTasks = useMemo(
    () =>
      [...selectedProjectCompletedTasks].sort((left, right) =>
        left.title.localeCompare(right.title, 'ru-RU')
      ),
    [selectedProjectCompletedTasks]
  );

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
                    ← Projects
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
                    + Задача
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditProject(selectedProject)}
                    className="tm-button tm-button-ghost"
                  >
                    Изменить проект
                  </button>
                </div>
              </section>

              <section className="tm-panel-soft p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm text-amber-200/80">
                      {getProjectCompletedCount(tasks, taskStatusById, selectedProject.id)} /{' '}
                      {selectedProjectTasks.length} задач завершено
                    </p>
                    <p className="text-xs text-amber-200/70">
                      Активных {selectedProjectActiveTasks.length} · Сделано {selectedProjectCompletedTasks.length}
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
                <section className="tm-panel-soft p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold tm-title">Проект завершён</h2>
                    <ProjectStatusBadge status="completed" />
                  </div>
                  <p className="text-sm text-amber-200/80">Все задачи проекта закрыты.</p>
                  <p className="text-xs text-amber-200/70">Прогресс: 100%</p>
                  {typeof selectedProject.completionBonusXp === 'number' ? (
                    <p className="text-sm font-semibold text-emerald-300">
                      Начислен бонус: +{selectedProject.completionBonusXp} XP
                    </p>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold tm-title">Активные задачи</h2>
                  <span className="tm-badge tm-badge-note">{selectedProjectActiveTasks.length}</span>
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
                      />
                    ))}
                  </div>
                ) : (
                  <div className="tm-panel-soft p-4">
                    <p className="text-sm text-amber-200/80">
                      В проекте пока нет активных задач. Добавь первую и прогресс появится автоматически.
                    </p>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold tm-title">Завершённые задачи</h2>
                  <span className="tm-badge tm-badge-note">{selectedProjectCompletedTasks.length}</span>
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
                  <div className="tm-panel-soft p-4">
                    <p className="text-sm text-amber-200/80">
                      Пока ничего не закрыто. Когда завершишь первую задачу проекта, она появится здесь.
                    </p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <>
              <section className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-3xl font-semibold tm-title">Projects</h1>
                  <p className="text-sm text-amber-200/80">
                    Контейнеры для больших целей. Прогресс считается по обычным задачам.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateProject}
                  className="tm-button tm-button-primary"
                >
                  + Проект
                </button>
              </section>

              {loading ? (
                <div className="tm-panel-soft p-4">
                  <p className="text-amber-200/80">Загрузка проектов...</p>
                </div>
              ) : projects.length === 0 ? (
                <div className="tm-panel-soft p-5 space-y-3">
                  <h2 className="text-xl font-semibold tm-title">Пока нет Projects</h2>
                  <p className="text-sm text-amber-200/80">
                    Создай проект, а потом привязывай к нему обычные задачи. Прогресс будет считаться автоматически.
                  </p>
                  <div>
                    <button
                      type="button"
                      onClick={openCreateProject}
                      className="tm-button tm-button-primary"
                    >
                      Создать проект
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
                        className="tm-panel-soft tm-project-card p-4 text-left w-full"
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
                              {completedCount} / {totalTasks} задач завершено
                            </p>
                            <ProjectProgressBar value={progress} />
                          </div>
                          <span className="tm-button tm-button-ghost tm-button-sm">Открыть</span>
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
          Обновляем задачу...
        </div>
      ) : null}
    </div>
  );
}
