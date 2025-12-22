import { useEffect, useState } from 'react';
import { Reward } from '../entities/reward/types';
import { getXpBalance } from '../services/xpService';
import { addEvent } from '../db/repositories/ledgerRepo';
import { db } from '../db';

const generateId = (): string => {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : undefined;
  if (uuid) return uuid;
  const rand = Math.random().toString(16).slice(2);
  const time = Date.now().toString(16);
  return `${time}-${rand}-${Math.random().toString(16).slice(2, 10)}`;
};

export function ShopPage() {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [xp, setXp] = useState(0);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [rewardsFromDb, balance] = await Promise.all([
        db.rewards.toArray(),
        getXpBalance()
      ]);
      const data =
        rewardsFromDb.length > 0
          ? rewardsFromDb
          : (() => {
              const now = new Date().toISOString();
              return [
                { id: 'mock-1', name: 'Отпуск на день', cost: 200, repeatable: true, createdAt: now, updatedAt: now },
                { id: 'mock-2', name: 'Кофе с десертом', cost: 80, repeatable: true, createdAt: now, updatedAt: now }
              ];
            })();
      setRewards(data);
      setXp(balance);
      setLoading(false);
    };
    load();
  }, []);

  const buy = async (reward: Reward) => {
    if (xp < reward.cost) return;
    setPurchasing(reward.id);
    await addEvent({
      id: generateId(),
      kind: 'reward',
      rewardId: reward.id,
      deltaXp: -reward.cost,
      createdAt: new Date().toISOString(),
      note: 'purchase'
    });
    const balance = await getXpBalance();
    setXp(balance);
    setPurchasing(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">
        <h1 className="text-3xl font-semibold text-white">Shop</h1>
        <p className="text-slate-300">XP: {xp}</p>

        {loading ? (
          <p className="text-slate-400">Loading...</p>
        ) : rewards.length === 0 ? (
          <p className="text-slate-400">No rewards yet</p>
        ) : (
          <div className="space-y-3">
            {rewards.map((reward) => {
              const disabled = xp < reward.cost || purchasing === reward.id;
              return (
                <div
                  key={reward.id}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="text-white font-semibold">{reward.name}</p>
                    <p className="text-sm text-slate-400">Cost: {reward.cost} XP</p>
                  </div>
                  <button
                    onClick={() => buy(reward)}
                    disabled={disabled}
                    className={`px-4 py-2 rounded-md text-sm font-semibold ${
                      disabled
                        ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                        : 'bg-emerald-500 text-slate-900'
                    }`}
                  >
                    {purchasing === reward.id ? 'Buying...' : 'Buy'}
                  </button>
                  {xp < reward.cost && (
                    <p className="ml-3 text-xs text-amber-400">Недостаточно XP</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
