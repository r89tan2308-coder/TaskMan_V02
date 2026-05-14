import { useEffect, useMemo, useState } from 'react';
import { Reward } from '../entities/reward/types';
import { getXpBalance } from '../services/xpService';
import { addEvent, listEvents } from '../db/repositories/ledgerRepo';
import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { db } from '../db';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';

const generateId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

const PINNED_REWARDS_META_KEY = 'pinnedRewards';

export function ShopPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [expandedRewardId, setExpandedRewardId] = useState<string | null>(null);
  const [pinnedRewardIds, setPinnedRewardIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCost, setNewCost] = useState('');
  const [newRepeatable, setNewRepeatable] = useState(true);
  const [newCooldown, setNewCooldown] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editRepeatable, setEditRepeatable] = useState(true);
  const [editCooldown, setEditCooldown] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [rewardsFromDb, balance, eventsData, pinned] = await Promise.all([
      db.rewards.toArray(),
      getXpBalance(),
      listEvents(),
      getAppMetaValue<string[]>(PINNED_REWARDS_META_KEY)
    ]);
    const normalizedPins = Array.isArray(pinned)
      ? pinned.filter((id): id is string => typeof id === 'string')
      : [];
    setRewards(rewardsFromDb);
    setXp(balance);
    setEvents(eventsData);
    setPinnedRewardIds(normalizedPins);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const parseCost = (value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.max(0, Math.round(parsed));
    return rounded > 0 ? rounded : null;
  };

  const parseCooldown = (value: string, repeatable: boolean) => {
    if (!repeatable) return undefined;
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const rounded = Math.max(0, Math.round(parsed));
    return rounded > 0 ? rounded : undefined;
  };

  const getProgressPercent = (balance: number, cost: number) => {
    if (!Number.isFinite(cost) || cost <= 0) return 100;
    const raw = (balance / cost) * 100;
    return Math.min(100, Math.max(0, Math.round(raw)));
  };

  const setRepeatableDraft = (value: boolean, scope: 'new' | 'edit') => {
    if (scope === 'new') {
      setNewRepeatable(value);
      if (!value) setNewCooldown('');
      return;
    }
    setEditRepeatable(value);
    if (!value) setEditCooldown('');
  };

  const formatCooldown = (ms: number) => {
    const totalMinutes = Math.max(1, Math.ceil(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];
    if (hours) parts.push(`${hours}ч`);
    if (minutes) parts.push(`${minutes}м`);
    return parts.join(' ');
  };

  const purchasesByReward = useMemo(() => {
    const map = new Map<string, { count: number; lastAt: number | null }>();
    for (const event of events) {
      if (event.kind !== 'reward' || !event.rewardId) continue;
      const eventTime = Date.parse(event.createdAt);
      const current = map.get(event.rewardId) ?? { count: 0, lastAt: null };
      const nextTime = Number.isNaN(eventTime) ? current.lastAt : eventTime;
      map.set(event.rewardId, {
        count: current.count + 1,
        lastAt:
          typeof current.lastAt === 'number'
            ? Math.max(current.lastAt, nextTime ?? 0)
            : nextTime ?? null
      });
    }
    return map;
  }, [events]);

  const pinnedRewardSet = useMemo(
    () => new Set(pinnedRewardIds),
    [pinnedRewardIds]
  );

  const updatePinnedRewards = async (nextIds: string[]) => {
    const uniqueIds = Array.from(new Set(nextIds));
    setPinnedRewardIds(uniqueIds);
    await setAppMetaValue(PINNED_REWARDS_META_KEY, uniqueIds);
  };

  const pinReward = async (rewardId: string) => {
    if (pinnedRewardSet.has(rewardId)) return;
    try {
      await updatePinnedRewards([...pinnedRewardIds, rewardId]);
    } catch (error) {
      await showAppAlert('Не удалось закрепить награду.');
    }
  };

  const unpinReward = async (rewardId: string) => {
    if (!pinnedRewardSet.has(rewardId)) return;
    try {
      await updatePinnedRewards(pinnedRewardIds.filter((id) => id !== rewardId));
    } catch (error) {
      await showAppAlert('Не удалось убрать награду.');
    }
  };

  const buy = async (reward: Reward) => {
    if (xp < reward.cost) return;
    const purchaseInfo = purchasesByReward.get(reward.id);
    const isRepeatable = reward.repeatable !== false;
    const purchaseCount = purchaseInfo?.count ?? 0;
    const lastPurchaseAt = purchaseInfo?.lastAt ?? null;
    const cooldownMs =
      isRepeatable && reward.cooldownHours
        ? reward.cooldownHours * 60 * 60 * 1000
        : 0;
    const onCooldown =
      isRepeatable &&
      cooldownMs > 0 &&
      typeof lastPurchaseAt === 'number' &&
      Date.now() - lastPurchaseAt < cooldownMs;
    if (!isRepeatable && purchaseCount > 0) return;
    if (onCooldown) return;
    setPurchasing(reward.id);
    await addEvent({
      id: generateId(),
      kind: 'reward',
      rewardId: reward.id,
      deltaXp: -reward.cost,
      createdAt: new Date().toISOString(),
      note: 'purchase'
    });
    await load();
    setPurchasing(null);
  };

  const startEdit = (reward: Reward) => {
    setExpandedRewardId(null);
    setEditingId(reward.id);
    setEditName(reward.name);
    setEditCost(String(reward.cost));
    setEditRepeatable(reward.repeatable !== false);
    setEditCooldown(
      typeof reward.cooldownHours === 'number' ? String(reward.cooldownHours) : ''
    );
  };

  const cancelEdit = () => {
    setExpandedRewardId(null);
    setEditingId(null);
    setEditName('');
    setEditCost('');
    setEditRepeatable(true);
    setEditCooldown('');
  };

  const saveEdit = async (reward: Reward) => {
    if (savingId) return;
    const name = editName.trim();
    const cost = parseCost(editCost);
    if (!name || cost === null) {
      await showAppAlert('Введите название и цену.');
      return;
    }
    const cooldownHours = parseCooldown(editCooldown, editRepeatable);
    setSavingId(reward.id);
    try {
      const updated: Reward = {
        ...reward,
        name,
        cost,
        repeatable: editRepeatable,
        cooldownHours,
        updatedAt: new Date().toISOString()
      };
      await db.rewards.put(updated);
      setEditingId(null);
      setEditName('');
      setEditCost('');
      setEditRepeatable(true);
      setEditCooldown('');
      await load();
    } catch (error) {
      await showAppAlert('Не удалось сохранить покупку.');
    } finally {
      setSavingId(null);
    }
  };

  const addReward = async () => {
    if (adding) return;
    const name = newName.trim();
    const cost = parseCost(newCost);
    if (!name || cost === null) {
      await showAppAlert('Введите название и цену.');
      return;
    }
    setAdding(true);
    try {
      const now = new Date().toISOString();
      const cooldownHours = parseCooldown(newCooldown, newRepeatable);
      await db.rewards.add({
        id: generateId(),
        name,
        cost,
        repeatable: newRepeatable,
        cooldownHours,
        createdAt: now,
        updatedAt: now
      });
      setNewName('');
      setNewCost('');
      setNewRepeatable(true);
      setNewCooldown('');
      await load();
    } catch (error) {
      await showAppAlert('Не удалось добавить покупку.');
    } finally {
      setAdding(false);
    }
  };

  const deleteReward = async (reward: Reward) => {
    if (deletingId) return;
    const confirmed = await showAppConfirm({
      message: `Удалить покупку "${reward.name}"?`,
      confirmLabel: 'Удалить',
      tone: 'danger'
    });
    if (!confirmed) return;
    setDeletingId(reward.id);
    try {
      await db.rewards.delete(reward.id);
      if (pinnedRewardSet.has(reward.id)) {
        await updatePinnedRewards(pinnedRewardIds.filter((id) => id !== reward.id));
      }
      if (expandedRewardId === reward.id) {
        setExpandedRewardId(null);
      }
      await load();
    } catch (error) {
      await showAppAlert('Не удалось удалить покупку.');
    } finally {
      setDeletingId(null);
    }
  };

  const now = Date.now();

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <h1 className="sr-only">Shop</h1>
          <p className="tm-label">XP: {xp}</p>

          <div className="tm-panel-soft p-3 space-y-2">
            <p className="tm-label">Новая покупка</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="tm-input flex-1"
                  placeholder="Название"
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newCost}
                  onChange={(event) => setNewCost(event.target.value)}
                  className="tm-input w-32"
                  placeholder="Цена"
                />
                <button
                  onClick={addReward}
                  disabled={adding}
                  className="tm-button tm-button-primary"
                >
                  {adding ? 'Добавление...' : 'Добавить'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm tm-label">
                  <input
                    type="checkbox"
                    checked={newRepeatable}
                    onChange={(event) => setRepeatableDraft(event.target.checked, 'new')}
                    className="h-4 w-4 accent-amber-500"
                  />
                  Повторяемая
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newCooldown}
                  onChange={(event) => setNewCooldown(event.target.value)}
                  className="tm-input w-36"
                  placeholder="Кулдаун (ч)"
                  disabled={!newRepeatable}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-amber-200/80">Loading...</p>
          ) : rewards.length === 0 ? (
            <p className="text-amber-200/80">No rewards yet</p>
          ) : (
            <div className="space-y-3">
              {rewards.map((reward) => {
                const isEditing = editingId === reward.id;
                const isSaving = savingId === reward.id;
                const isDeleting = deletingId === reward.id;
                const isExpanded = expandedRewardId === reward.id && !isEditing;
                const isPinned = pinnedRewardSet.has(reward.id);
                const purchaseInfo = purchasesByReward.get(reward.id);
                const purchaseCount = purchaseInfo?.count ?? 0;
                const lastPurchaseAt = purchaseInfo?.lastAt ?? null;
                const isRepeatable = reward.repeatable !== false;
                const cooldownMs =
                  isRepeatable && reward.cooldownHours
                    ? reward.cooldownHours * 60 * 60 * 1000
                    : 0;
                const onCooldown =
                  isRepeatable &&
                  cooldownMs > 0 &&
                  typeof lastPurchaseAt === 'number' &&
                  now - lastPurchaseAt < cooldownMs;
                const cooldownRemaining = onCooldown ? cooldownMs - (now - lastPurchaseAt) : 0;
                const lockedByRepeatable = !isRepeatable && purchaseCount > 0;
                const isLocked = lockedByRepeatable || onCooldown;
                const disabled =
                  xp < reward.cost ||
                  purchasing === reward.id ||
                  isEditing ||
                  isLocked ||
                  isDeleting;
                const progressValue = getProgressPercent(xp, reward.cost);
                return (
                  <div
                    key={reward.id}
                    className="tm-card px-4 py-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      {isEditing ? (
                        <div className="space-y-2 flex-1">
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            className="tm-input"
                            placeholder="Название"
                          />
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editCost}
                            onChange={(event) => setEditCost(event.target.value)}
                            className="tm-input w-32"
                            placeholder="Цена"
                          />
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-2 text-sm tm-label">
                              <input
                                type="checkbox"
                                checked={editRepeatable}
                                onChange={(event) =>
                                  setRepeatableDraft(event.target.checked, 'edit')
                                }
                                className="h-4 w-4 accent-amber-500"
                              />
                              Повторяемая
                            </label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={editCooldown}
                              onChange={(event) => setEditCooldown(event.target.value)}
                              className="tm-input w-36"
                              placeholder="Кулдаун (ч)"
                              disabled={!editRepeatable}
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRewardId((prev) => (prev === reward.id ? null : reward.id))
                          }
                          className="text-left flex-1 space-y-2"
                          aria-expanded={isExpanded}
                          aria-controls={`reward-actions-${reward.id}`}
                        >
                          <p className="text-amber-50 font-semibold">{reward.name}</p>
                          <p className="text-sm text-amber-200/80">
                            Cost: {reward.cost} XP
                            {isPinned ? ' · На главном' : ''}
                          </p>
                          <div className="space-y-1">
                            <div
                              className="tm-progress w-full"
                              role="progressbar"
                              aria-valuenow={progressValue}
                              aria-valuemin={0}
                              aria-valuemax={100}
                            >
                              <div
                                className="tm-progress-fill"
                                style={{ width: `${progressValue}%` }}
                              />
                              <span className="tm-progress-value">{progressValue}%</span>
                            </div>
                            <p className="text-xs text-amber-200/70">
                              XP: {xp} / {reward.cost}
                            </p>
                          </div>
                          <p className="text-xs text-amber-200/70">
                            {isRepeatable ? 'Повторяемая' : 'Одноразовая'}
                            {isRepeatable && reward.cooldownHours
                              ? ` · Кулдаун: ${reward.cooldownHours} ч`
                              : ''}
                          </p>
                        </button>
                      )}
                      <div className="flex items-center gap-3">
                        {isEditing ? (
                          <>
                          <button
                            onClick={() => saveEdit(reward)}
                            disabled={isSaving}
                            className="tm-button tm-button-primary"
                          >
                            {isSaving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="tm-button tm-button-ghost"
                            disabled={isSaving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => buy(reward)}
                            disabled={disabled}
                            className={`tm-button ${disabled ? 'tm-button-ghost' : 'tm-button-primary'}`}
                          >
                            {purchasing === reward.id ? 'Buying...' : 'Buy'}
                          </button>
                          <button
                            onClick={() => startEdit(reward)}
                            className="tm-button tm-button-ghost"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteReward(reward)}
                            className="tm-button tm-button-danger"
                            disabled={isDeleting}
                          >
                            {isDeleting ? 'Удаление...' : 'Удалить'}
                          </button>
                          {xp < reward.cost && (
                            <p className="text-xs text-amber-200/80">Недостаточно XP</p>
                          )}
                          {lockedByRepeatable && (
                            <p className="text-xs text-amber-200/80">Уже куплено</p>
                          )}
                          {onCooldown && (
                            <p className="text-xs text-amber-200/80">
                              Кулдаун: {formatCooldown(cooldownRemaining)}
                            </p>
                          )}
                        </>
                      )}
                      </div>
                    </div>
                    <div
                      id={`reward-actions-${reward.id}`}
                      className={`tm-note-body ${isExpanded ? 'tm-note-body-open' : ''}`}
                    >
                      <div className="tm-note-body-inner pt-3 space-y-2">
                        <p className="text-xs tm-label">Главный экран</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => pinReward(reward.id)}
                            disabled={isPinned}
                            className="tm-button tm-button-ghost tm-button-sm"
                          >
                            Поместить на главный экран
                          </button>
                          <button
                            onClick={() => unpinReward(reward.id)}
                            disabled={!isPinned}
                            className="tm-button tm-button-ghost tm-button-sm"
                          >
                            Убрать с главного экрана
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
