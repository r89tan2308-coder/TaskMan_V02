import { getAppMetaValue, setAppMetaValue } from '../../db/repositories/appMetaRepo';

export interface TetrisRecord {
  id: string;
  score: number;
  lines: number;
  level: number;
  durationMs: number;
  achievedAt: string;
}

export const TETRIS_SKIN_IDS = ['cat', 'heart', 'paw', 'star'] as const;

export type TetrisSkinId = (typeof TETRIS_SKIN_IDS)[number];

const TETRIS_RECORDS_META_KEY = 'tetris.records';
const TETRIS_SKIN_META_KEY = 'tetris.skin';

function isTetrisRecord(value: unknown): value is TetrisRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<TetrisRecord>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.score === 'number' &&
    typeof candidate.lines === 'number' &&
    typeof candidate.level === 'number' &&
    typeof candidate.durationMs === 'number' &&
    typeof candidate.achievedAt === 'string'
  );
}

export async function loadTetrisRecords() {
  const raw = await getAppMetaValue<unknown>(TETRIS_RECORDS_META_KEY);
  if (!Array.isArray(raw)) {
    return [] as TetrisRecord[];
  }

  return raw.filter(isTetrisRecord).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.lines !== left.lines) return right.lines - left.lines;
    return right.achievedAt.localeCompare(left.achievedAt);
  });
}

export async function saveTetrisRecord(record: TetrisRecord) {
  const existing = await loadTetrisRecords();
  const next = [...existing, record]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      if (right.lines !== left.lines) return right.lines - left.lines;
      return right.achievedAt.localeCompare(left.achievedAt);
    })
    .slice(0, 12);

  await setAppMetaValue(TETRIS_RECORDS_META_KEY, next);
  return next;
}

export async function loadTetrisSkin() {
  const raw = await getAppMetaValue<unknown>(TETRIS_SKIN_META_KEY);
  return TETRIS_SKIN_IDS.includes(raw as TetrisSkinId) ? (raw as TetrisSkinId) : 'cat';
}

export async function saveTetrisSkin(skin: TetrisSkinId) {
  await setAppMetaValue(TETRIS_SKIN_META_KEY, skin);
}
