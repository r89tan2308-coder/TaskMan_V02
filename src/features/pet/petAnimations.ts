export type PetVisualState =
  | 'idle'
  | 'running-right'
  | 'running-left'
  | 'waving'
  | 'celebrating'
  | 'jumping'
  | 'failed'
  | 'waiting'
  | 'running'
  | 'review';

export interface PetAnimationDefinition {
  row: number;
  frames: number;
  durations: number[];
  loop?: boolean;
}

export const PET_CELL_WIDTH = 192;
export const PET_CELL_HEIGHT = 208;
export const PET_ATLAS_COLUMNS = 8;
export const PET_ATLAS_ROWS = 9;

export const PET_ANIMATIONS: Record<PetVisualState, PetAnimationDefinition> = {
  idle: {
    row: 0,
    frames: 6,
    durations: [2800, 170, 130, 220, 130, 3200]
  },
  'running-right': {
    row: 1,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220]
  },
  'running-left': {
    row: 2,
    frames: 8,
    durations: [120, 120, 120, 120, 120, 120, 120, 220]
  },
  waving: {
    row: 3,
    frames: 4,
    durations: [140, 140, 140, 280]
  },
  celebrating: {
    row: 4,
    frames: 5,
    durations: [130, 140, 240, 180, 520],
    loop: false
  },
  jumping: {
    row: 4,
    frames: 5,
    durations: [140, 140, 140, 140, 280]
  },
  failed: {
    row: 5,
    frames: 8,
    durations: [140, 140, 140, 140, 140, 140, 140, 240]
  },
  waiting: {
    row: 6,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 260]
  },
  running: {
    row: 7,
    frames: 6,
    durations: [170, 170, 170, 170, 170, 280]
  },
  review: {
    row: 8,
    frames: 6,
    durations: [150, 150, 150, 150, 150, 280]
  }
};
