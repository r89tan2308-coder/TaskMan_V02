import { getAppMetaValue, setAppMetaValue } from '../../db/repositories/appMetaRepo';

export type PetMotionMode = 'full' | 'reduced' | 'static';

export interface PetPosition {
  left: number;
  top: number;
}

export const PET_ENABLED_META_KEY = 'petEnabled';
export const PET_MOTION_MODE_META_KEY = 'petMotionMode';
export const PET_POSITION_META_KEY = 'petPosition';

export const DEFAULT_PET_ENABLED = true;
export const DEFAULT_PET_MOTION_MODE: PetMotionMode = 'full';

export const isPetMotionMode = (value: unknown): value is PetMotionMode =>
  value === 'full' || value === 'reduced' || value === 'static';

export const isPetPosition = (value: unknown): value is PetPosition => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PetPosition>;
  return Number.isFinite(candidate.left) && Number.isFinite(candidate.top);
};

export const getPetEnabled = async () => {
  const saved = await getAppMetaValue<unknown>(PET_ENABLED_META_KEY);
  return typeof saved === 'boolean' ? saved : DEFAULT_PET_ENABLED;
};

export const setPetEnabled = async (enabled: boolean) => {
  await setAppMetaValue(PET_ENABLED_META_KEY, enabled);
};

export const getPetMotionMode = async () => {
  const saved = await getAppMetaValue<unknown>(PET_MOTION_MODE_META_KEY);
  return isPetMotionMode(saved) ? saved : DEFAULT_PET_MOTION_MODE;
};

export const setPetMotionMode = async (mode: PetMotionMode) => {
  await setAppMetaValue(PET_MOTION_MODE_META_KEY, mode);
};

export const getPetPosition = async () => {
  const saved = await getAppMetaValue<unknown>(PET_POSITION_META_KEY);
  return isPetPosition(saved) ? saved : null;
};

export const setPetPosition = async (position: PetPosition) => {
  await setAppMetaValue(PET_POSITION_META_KEY, position);
};

export const resetPetPosition = async () => {
  await setAppMetaValue<PetPosition | null>(PET_POSITION_META_KEY, null);
};
