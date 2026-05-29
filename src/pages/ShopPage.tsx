import { useEffect, useMemo, useState } from 'react';
import { Reward } from '../entities/reward/types';
import { getXpBalance } from '../services/xpService';
import { addEvent, listEvents } from '../db/repositories/ledgerRepo';
import { getAppMetaValue, setAppMetaValue } from '../db/repositories/appMetaRepo';
import { LedgerEvent } from '../entities/ledger/types';
import { db } from '../db';
import { showAppAlert, showAppConfirm } from '../components/AppDialog';
import { useLocale, type AppLocale } from '../i18n/appLocale';

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

const SHOP_COPY = {
  ru: {
    title: 'Магазин',
    xpBalance: (xp: number) => `XP: ${xp}`,
    newReward: 'Новая покупка',
    namePlaceholder: 'Название',
    costPlaceholder: 'Цена',
    add: 'Добавить',
    adding: 'Добавление...',
    repeatable: 'Повторяемая',
    oneTime: 'Одноразовая',
    cooldownPlaceholder: 'Кулдаун (ч)',
    loading: 'Загрузка магазина...',
    empty: 'Наград пока нет. Добавь первую покупку, чтобы появилась цель для XP.',
    cost: (cost: number) => `Цена: ${cost} XP`,
    pinned: 'На главной',
    xpProgress: (xp: number, cost: number) => `XP: ${xp} / ${cost}`,
    cooldown: (hours: number) => `Кулдаун: ${hours} ч`,
    save: 'Сохранить',
    saving: 'Сохранение...',
    cancel: 'Отмена',
    buy: 'Купить',
    buying: 'Покупка...',
    edit: 'Изменить',
    delete: 'Удалить',
    deleting: 'Удаление...',
    notEnoughXp: 'Недостаточно XP',
    alreadyBought: 'Уже куплено',
    cooldownRemaining: (value: string) => `Кулдаун: ${value}`,
    homeSection: 'Главный экран',
    pin: 'Показать на главной',
    unpin: 'Убрать с главной',
    deleteConfirm: (name: string) => `Удалить покупку "${name}"?`,
    invalidReward: 'Введите название и цену.',
    pinFailed: 'Не удалось закрепить награду.',
    unpinFailed: 'Не удалось убрать награду.',
    saveFailed: 'Не удалось сохранить покупку.',
    addFailed: 'Не удалось добавить покупку.',
    deleteFailed: 'Не удалось удалить покупку.',
    cooldownUnits: {
      hour: 'ч',
      minute: 'м'
    }
  },
  en: {
    title: 'Shop',
    xpBalance: (xp: number) => `XP: ${xp}`,
    newReward: 'New reward',
    namePlaceholder: 'Name',
    costPlaceholder: 'Cost',
    add: 'Add',
    adding: 'Adding...',
    repeatable: 'Repeatable',
    oneTime: 'One-time',
    cooldownPlaceholder: 'Cooldown (h)',
    loading: 'Loading shop...',
    empty: 'No rewards yet. Add the first one to create an XP goal.',
    cost: (cost: number) => `Cost: ${cost} XP`,
    pinned: 'On Today',
    xpProgress: (xp: number, cost: number) => `XP: ${xp} / ${cost}`,
    cooldown: (hours: number) => `Cooldown: ${hours} h`,
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    buy: 'Buy',
    buying: 'Buying...',
    edit: 'Edit',
    delete: 'Delete',
    deleting: 'Deleting...',
    notEnoughXp: 'Not enough XP',
    alreadyBought: 'Already bought',
    cooldownRemaining: (value: string) => `Cooldown: ${value}`,
    homeSection: 'Today screen',
    pin: 'Show on Today',
    unpin: 'Remove from Today',
    deleteConfirm: (name: string) => `Delete reward "${name}"?`,
    invalidReward: 'Enter a name and cost.',
    pinFailed: 'Could not pin the reward.',
    unpinFailed: 'Could not unpin the reward.',
    saveFailed: 'Could not save the reward.',
    addFailed: 'Could not add the reward.',
    deleteFailed: 'Could not delete the reward.',
    cooldownUnits: {
      hour: 'h',
      minute: 'm'
    }
  }
} satisfies Record<AppLocale, unknown>;

export function ShopPage() {
  const { locale } = useLocale();
  const copy = SHOP_COPY[locale];
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
    if (hours) parts.push(`${hours}${copy.cooldownUnits.hour}`);
    if (minutes) parts.push(`${minutes}${copy.cooldownUnits.minute}`);
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
      await showAppAlert(copy.pinFailed);
    }
  };

  const unpinReward = async (rewardId: string) => {
    if (!pinnedRewardSet.has(rewardId)) return;
    try {
      await updatePinnedRewards(pinnedRewardIds.filter((id) => id !== rewardId));
    } catch (error) {
      await showAppAlert(copy.unpinFailed);
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
      await showAppAlert(copy.invalidReward);
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
      await showAppAlert(copy.saveFailed);
    } finally {
      setSavingId(null);
    }
  };

  const addReward = async () => {
    if (adding) return;
    const name = newName.trim();
    const cost = parseCost(newCost);
    if (!name || cost === null) {
      await showAppAlert(copy.invalidReward);
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
      await showAppAlert(copy.addFailed);
    } finally {
      setAdding(false);
    }
  };

  const deleteReward = async (reward: Reward) => {
    if (deletingId) return;
    const confirmed = await showAppConfirm({
      message: copy.deleteConfirm(reward.name),
      confirmLabel: copy.delete,
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
      await showAppAlert(copy.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const now = Date.now();

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <h1 className="sr-only">{copy.title}</h1>
          <p className="tm-label">{copy.xpBalance(xp)}</p>

          <div className="tm-panel-soft p-3 space-y-2">
            <p className="tm-label">{copy.newReward}</p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  className="tm-input flex-1"
                  placeholder={copy.namePlaceholder}
                />
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newCost}
                  onChange={(event) => setNewCost(event.target.value)}
                  className="tm-input w-32"
                  placeholder={copy.costPlaceholder}
                />
                <button
                  onClick={addReward}
                  disabled={adding}
                  className="tm-button tm-button-primary"
                >
                  {adding ? copy.adding : copy.add}
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
                  {copy.repeatable}
                </label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={newCooldown}
                  onChange={(event) => setNewCooldown(event.target.value)}
                  className="tm-input w-36"
                  placeholder={copy.cooldownPlaceholder}
                  disabled={!newRepeatable}
                />
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-amber-200/80">{copy.loading}</p>
          ) : rewards.length === 0 ? (
            <p className="text-amber-200/80">{copy.empty}</p>
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
                        <div className="space-y-2 flex-1 min-w-0">
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            className="tm-input"
                            placeholder={copy.namePlaceholder}
                          />
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={editCost}
                            onChange={(event) => setEditCost(event.target.value)}
                            className="tm-input w-32"
                            placeholder={copy.costPlaceholder}
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
                              {copy.repeatable}
                            </label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={editCooldown}
                              onChange={(event) => setEditCooldown(event.target.value)}
                              className="tm-input w-36"
                              placeholder={copy.cooldownPlaceholder}
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
                          className="text-left flex-1 min-w-0 space-y-2"
                          aria-expanded={isExpanded}
                          aria-controls={`reward-actions-${reward.id}`}
                        >
                          <p className="text-amber-50 font-semibold break-words">{reward.name}</p>
                          <p className="text-sm text-amber-200/80">
                            {copy.cost(reward.cost)}
                            {isPinned ? ` · ${copy.pinned}` : ''}
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
                              {copy.xpProgress(xp, reward.cost)}
                            </p>
                          </div>
                          <p className="text-xs text-amber-200/70">
                            {isRepeatable ? copy.repeatable : copy.oneTime}
                            {isRepeatable && reward.cooldownHours
                              ? ` · ${copy.cooldown(reward.cooldownHours)}`
                              : ''}
                          </p>
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {isEditing ? (
                          <>
                          <button
                            onClick={() => saveEdit(reward)}
                            disabled={isSaving}
                            className="tm-button tm-button-primary"
                          >
                            {isSaving ? copy.saving : copy.save}
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="tm-button tm-button-ghost"
                            disabled={isSaving}
                          >
                            {copy.cancel}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => buy(reward)}
                            disabled={disabled}
                            className={`tm-button ${disabled ? 'tm-button-ghost' : 'tm-button-primary'}`}
                          >
                            {purchasing === reward.id ? copy.buying : copy.buy}
                          </button>
                          <button
                            onClick={() => startEdit(reward)}
                            className="tm-button tm-button-ghost"
                          >
                            {copy.edit}
                          </button>
                          <button
                            onClick={() => deleteReward(reward)}
                            className="tm-button tm-button-danger"
                            disabled={isDeleting}
                          >
                            {isDeleting ? copy.deleting : copy.delete}
                          </button>
                          {xp < reward.cost && (
                            <p className="text-xs text-amber-200/80">{copy.notEnoughXp}</p>
                          )}
                          {lockedByRepeatable && (
                            <p className="text-xs text-amber-200/80">{copy.alreadyBought}</p>
                          )}
                          {onCooldown && (
                            <p className="text-xs text-amber-200/80">
                              {copy.cooldownRemaining(formatCooldown(cooldownRemaining))}
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
                        <p className="text-xs tm-label">{copy.homeSection}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => pinReward(reward.id)}
                            disabled={isPinned}
                            className="tm-button tm-button-ghost tm-button-sm"
                          >
                            {copy.pin}
                          </button>
                          <button
                            onClick={() => unpinReward(reward.id)}
                            disabled={!isPinned}
                            className="tm-button tm-button-ghost tm-button-sm"
                          >
                            {copy.unpin}
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
