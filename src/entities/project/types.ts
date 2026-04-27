export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface Project {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  createdAt: string;
  completedAt?: string;
  completionBonusXp?: number;
  completionBonusAwardedAt?: string;
  completionBonusEventId?: string;
}
