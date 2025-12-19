import { useEffect, useMemo, useState } from 'react';
import { Task, Periodicity, Rarity } from '../entities/task/types';
import { StreakState } from '../entities/streak/types';
import { createTask, listTasks, completeTask } from '../services/tasksService';
import { getXpBalance } from '../services/xpService';
import { getStreak } from '../services/streakService';

type TaskFilter = 'all' | Periodicity;

const STREAK_PERIOD = { kind: 'daily' } as const;
const STREAK_RULE = { requiredCountPerPeriod: 1 } as const;

function AddTaskModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [periodicity, setPeriodicity] = useState<Periodicity>('daily');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle('');
      setRarity('common');
      setPeriodicity('daily');
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await createTask({ title: title.trim(), rarity, periodicity });
    await onCreated();
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg bg-slate-900 p-6 shadow-xl border border-slate-800">
        <h2 className="text-xl font-semibold text-white mb-4">Новая задача</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-white"
              placeholder="Например: Сделать тренировку"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-slate-300 mb-1">Редкость</label>
              <select
                value={rarity}
                onChange={(e) => setRarity(e.target.value as Rarity)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-white"
              >
                <option value="common">Common</option>
                <option value="rare">Rare</option>
                <option value="epic">Epic</option>
                <option value="legendary">Legendary</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm text-slate-300 mb-1">Периодичность</label>
              <select
                value={periodicity}
                onChange={(e) => setPeriodicity(e.target.value as Periodicity)}
                className="w-full rounded-md bg-slate-800 border border-slate-700 px-3 py-2 text-white"
              >
                <option value="daily">Daily</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="rounded-md px-4 py-2 text-slate-200 bg-slate-800 border border-slate-700"
              disabled={saving}
            >
              Отмена
            </button>
            <button
              onClick={submit}
              className="rounded-md px-4 py-2 bg-emerald-500 text-slate-900 font-semibold disabled:opacity-60"
              disabled={saving}
            >
              {saving ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  onComplete
}: {
  task: Task;
  onComplete: (taskId: string) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-white font-semibold">{task.title}</p>
        <p className="text-xs text-slate-400">
          {task.periodicity === 'daily' ? 'Daily' : 'One-time'} · {task.rarity}
        </p>
      </div>
      <button
        onClick={() => onComplete(task.id)}
        className="rounded-md bg-emerald-500 text-slate-900 px-3 py-2 text-sm font-semibold"
      >
        Complete
      </button>
    </div>
  );
}

export function TodayPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState<StreakState>({
    currentCount: 0,
    bestCount: 0,
    period: STREAK_PERIOD,
    rule: STREAK_RULE
  });
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [t, balance, st] = await Promise.all([
      listTasks(),
      getXpBalance(),
      getStreak(STREAK_PERIOD, STREAK_RULE)
    ]);
    setTasks(t);
    setXp(balance);
    setStreak(st);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => t.periodicity === filter);
  }, [filter, tasks]);

  const handleComplete = async (taskId: string) => {
    await completeTask(taskId);
    await load();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Сегодня</p>
            <h1 className="text-3xl font-semibold text-white">TaskMan PWA</h1>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="rounded-md bg-emerald-500 text-slate-900 px-4 py-2 font-semibold"
          >
            + Add task
          </button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">XP balance</p>
            <p className="text-3xl font-bold text-white">{xp}</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-sm text-slate-400">Streak (current / best)</p>
            <p className="text-3xl font-bold text-white">
              {streak.currentCount} / {streak.bestCount}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Задачи</h2>
            <div className="flex gap-2 text-sm">
              {(['all', 'daily', 'one-time'] as TaskFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md border ${
                    filter === f
                      ? 'bg-emerald-500 border-emerald-500 text-slate-900'
                      : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'daily' ? 'Daily' : 'One-time'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-slate-400">Загрузка...</p>
          ) : filteredTasks.length === 0 ? (
            <p className="text-slate-400">Нет задач.</p>
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((task) => (
                <TaskCard key={task.id} task={task} onComplete={handleComplete} />
              ))}
            </div>
          )}
        </section>
      </div>

      <AddTaskModal
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={load}
      />
    </div>
  );
}
