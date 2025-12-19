// Domain types for rewards; no business logic here.
export interface Reward {
  id: string;
  name: string;
  cost: number; // XP cost
  repeatable: boolean;
  cooldownHours?: number;
  createdAt: string; // ISO datetime
  updatedAt: string; // ISO datetime
}

export interface RewardRedemption {
  id: string;
  rewardId: string;
  spentXp: number;
  redeemedAt: string; // ISO datetime
  note?: string;
}
