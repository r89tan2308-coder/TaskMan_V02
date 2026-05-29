import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { showAppAlert, showAppConfirm } from '../../components/AppDialog';
import { useLocale, type AppLocale } from '../../i18n/appLocale';
import { emitPetEvent } from '../pet/petEvents';
import './tetris.css';
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  applyAction,
  createEmptyBoard,
  createNewGame,
  getDropIntervalMs,
  getNextPieceType,
  getPieceCells,
  getVisibleBoard,
  type BoardMatrix,
  type TetrisAction,
  type TetrisGameState,
  type TetrominoType
} from './tetrisEngine';
import {
  clearTetrisRecords,
  loadTetrisRecords,
  loadTetrisSkin,
  saveTetrisRecord,
  saveTetrisSkin,
  type TetrisRecord,
  type TetrisSkinId
} from './tetrisStorage';

const TILE_SKINS: Record<
  TetrisSkinId,
  { label: string; symbol: string; className: string }
> = {
  cat: {
    label: 'Котята',
    symbol: '🐱',
    className: 'tm-tetris-cell-cat'
  },
  heart: {
    label: 'Сердечки',
    symbol: '❤',
    className: 'tm-tetris-cell-heart'
  },
  paw: {
    label: 'Лапки',
    symbol: '🐾',
    className: 'tm-tetris-cell-paw'
  },
  star: {
    label: 'Звёзды',
    symbol: '✦',
    className: 'tm-tetris-cell-star'
  }
};

const CONTROL_BUTTONS: Array<{
  action: TetrisAction;
  text: string;
}> = [
  { action: 'move-left', text: '←' },
  { action: 'rotate-cw', text: '⟳' },
  { action: 'move-right', text: '→' },
  { action: 'soft-drop', text: '↓' },
  { action: 'hard-drop', text: '⤓' }
];

const TETRIS_COPY = {
  ru: {
    back: '← Настройки',
    moduleChip: 'Отдельный модуль',
    description:
      'Фигуры можно переключать между котятами, сердечками, лапками и звёздами. Управление работает стрелками на клавиатуре и большими кнопками на смартфоне.',
    status: 'Статус',
    statuses: {
      idle: 'Готова к старту',
      paused: 'Пауза',
      gameOver: 'Игра окончена',
      running: 'Идёт игра'
    },
    start: 'Start',
    restart: 'Start заново',
    resume: 'Продолжить',
    pause: 'Пауза',
    startHint: 'Нажми Start, чтобы начать.',
    gameOverHint: 'Можно сразу начать заново.',
    score: 'Очки',
    best: 'Рекорд',
    controls: 'Управление',
    controlsHint:
      'Стрелки ← → двигают фигуру, ↑ поворачивает, ↓ ускоряет падение, Space делает мгновенный бросок, P ставит на паузу.',
    skinSection: 'Оформление фигур',
    skinHint: 'Квадратики убраны. Все фигуры используют выбранный тобой скин.',
    nextPiece: 'Следующая фигура',
    activeSkin: 'Активный скин',
    statistics: 'Статистика',
    lines: 'Линии',
    level: 'Уровень',
    records: 'Рекорды',
    autosave: 'Автосохранение',
    clear: 'Стереть',
    clearConfirm: 'Стереть все рекорды Tetris? Это действие нельзя отменить.',
    clearFailed: 'Не удалось стереть рекорды Tetris.',
    emptyRecords: 'Пока нет рекордов. Первый результат сохранится автоматически после партии.',
    recordScore: (score: number) => `${score} очков`,
    recordMeta: (lines: number, level: number, duration: string) =>
      `${lines} линий · уровень ${level} · ${duration}`,
    controlsTitles: {
      'move-left': 'Влево',
      'rotate-cw': 'Повернуть',
      'move-right': 'Вправо',
      'soft-drop': 'Вниз',
      'hard-drop': 'Бросок'
    },
    skins: {
      cat: 'Котята',
      heart: 'Сердечки',
      paw: 'Лапки',
      star: 'Звёзды'
    },
    dateLocale: 'ru-RU'
  },
  en: {
    back: '← Settings',
    moduleChip: 'Standalone module',
    description:
      'Pieces can switch between cats, hearts, paws, and stars. Controls work with keyboard arrows and large mobile buttons.',
    status: 'Status',
    statuses: {
      idle: 'Ready to start',
      paused: 'Paused',
      gameOver: 'Game over',
      running: 'Running'
    },
    start: 'Start',
    restart: 'Restart',
    resume: 'Resume',
    pause: 'Pause',
    startHint: 'Press Start to begin.',
    gameOverHint: 'You can restart right away.',
    score: 'Score',
    best: 'Best',
    controls: 'Controls',
    controlsHint:
      '← → move the piece, ↑ rotates, ↓ speeds up the fall, Space hard-drops, and P pauses.',
    skinSection: 'Piece Style',
    skinHint: 'Squares are removed. All pieces use the selected skin.',
    nextPiece: 'Next Piece',
    activeSkin: 'Active skin',
    statistics: 'Statistics',
    lines: 'Lines',
    level: 'Level',
    records: 'Records',
    autosave: 'Autosave',
    clear: 'Clear',
    clearConfirm: 'Clear all Tetris records? This cannot be undone.',
    clearFailed: 'Could not clear Tetris records.',
    emptyRecords: 'No records yet. The first result will be saved automatically after a game.',
    recordScore: (score: number) => `${score} points`,
    recordMeta: (lines: number, level: number, duration: string) =>
      `${lines} line${lines === 1 ? '' : 's'} · level ${level} · ${duration}`,
    controlsTitles: {
      'move-left': 'Left',
      'rotate-cw': 'Rotate',
      'move-right': 'Right',
      'soft-drop': 'Down',
      'hard-drop': 'Drop'
    },
    skins: {
      cat: 'Cats',
      heart: 'Hearts',
      paw: 'Paws',
      star: 'Stars'
    },
    dateLocale: 'en-US'
  }
} satisfies Record<AppLocale, unknown>;

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatRecordDate(value: string, locale: string) {
  try {
    return new Date(value).toLocaleString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return value;
  }
}

function createPreviewBoard(type: TetrominoType | null) {
  const grid = Array.from({ length: 4 }, () =>
    Array.from({ length: 4 }, () => null as TetrominoType | null)
  );
  if (!type) return grid;

  const cells = getPieceCells({
    type,
    rotation: 0,
    x: 0,
    y: 0
  });
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const offsetX = Math.floor((4 - width) / 2);
  const offsetY = Math.floor((4 - height) / 2);

  for (const cell of cells) {
    const boardX = cell.x - minX + offsetX;
    const boardY = cell.y - minY + offsetY;
    if (boardX >= 0 && boardX < 4 && boardY >= 0 && boardY < 4) {
      grid[boardY][boardX] = type;
    }
  }

  return grid;
}

function renderBoardCell(
  cell: TetrominoType | null,
  key: string,
  selectedSkin: TetrisSkinId,
  skinLabels: Record<TetrisSkinId, string>
) {
  if (!cell) {
    return <div key={key} className="tm-tetris-cell tm-tetris-cell-empty" aria-hidden="true" />;
  }

  const skin = TILE_SKINS[selectedSkin];

  return (
    <div
      key={key}
      className={`tm-tetris-cell tm-tetris-cell-filled ${skin.className}`}
      title={skinLabels[selectedSkin]}
      aria-hidden="true"
    >
      <span>{skin.symbol}</span>
    </div>
  );
}

function renderGrid(
  grid: BoardMatrix | Array<Array<TetrominoType | null>>,
  prefix: string,
  selectedSkin: TetrisSkinId,
  skinLabels: Record<TetrisSkinId, string>
) {
  return grid.flatMap((row, rowIndex) =>
    row.map((cell, columnIndex) =>
      renderBoardCell(cell, `${prefix}-${rowIndex}-${columnIndex}`, selectedSkin, skinLabels)
    )
  );
}

export function TetrisPage({ onBack }: { onBack: () => void }) {
  const { locale } = useLocale();
  const copy = TETRIS_COPY[locale];
  const [game, setGame] = useState<TetrisGameState | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'game-over'>('idle');
  const [records, setRecords] = useState<TetrisRecord[]>([]);
  const [selectedSkin, setSelectedSkin] = useState<TetrisSkinId>('cat');
  const sessionIdRef = useRef(0);
  const sessionStartedAtRef = useRef<number | null>(null);
  const recordedSessionRef = useRef<number | null>(null);
  const observedLinesRef = useRef(0);

  useEffect(() => {
    const loadState = async () => {
      const [savedRecords, savedSkin] = await Promise.all([loadTetrisRecords(), loadTetrisSkin()]);
      setRecords(savedRecords);
      setSelectedSkin(savedSkin);
    };
    void loadState();
  }, []);

  useEffect(() => {
    if (phase !== 'running' || !game) return;

    const intervalId = window.setInterval(() => {
      setGame((previous) => (previous ? applyAction(previous, 'tick') : previous));
    }, getDropIntervalMs(game.level));

    return () => {
      window.clearInterval(intervalId);
    };
  }, [game?.level, phase]);

  useEffect(() => {
    if (!game || phase === 'paused') return;
    if (game.status === 'game-over') {
      setPhase('game-over');
    }
  }, [game, phase]);

  useEffect(() => {
    if (!game) {
      observedLinesRef.current = 0;
      return;
    }

    const clearedLines = game.lines - observedLinesRef.current;
    if (clearedLines >= 4) {
      emitPetEvent({
        type: 'task-completed',
        taskTitle: 'Tetris',
        xpDelta: 0
      });
    }
    observedLinesRef.current = game.lines;
  }, [game?.lines]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === 'p') {
        event.preventDefault();
        setPhase((previous) => {
          if (previous === 'running') return 'paused';
          if (previous === 'paused') return 'running';
          return previous;
        });
        return;
      }

      if (phase !== 'running') return;

      const action =
        event.key === 'ArrowLeft'
          ? 'move-left'
          : event.key === 'ArrowRight'
          ? 'move-right'
          : event.key === 'ArrowDown'
          ? 'soft-drop'
          : event.key === 'ArrowUp'
          ? 'rotate-cw'
          : event.key === ' '
          ? 'hard-drop'
          : null;

      if (!action) return;

      event.preventDefault();
      setGame((previous) => (previous ? applyAction(previous, action) : previous));
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [phase]);

  useEffect(() => {
    if (!game || phase !== 'game-over' || recordedSessionRef.current === sessionIdRef.current) {
      return;
    }

    recordedSessionRef.current = sessionIdRef.current;
    const record: TetrisRecord = {
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `tetris-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      score: game.score,
      lines: game.lines,
      level: game.level,
      durationMs: Math.max(0, Date.now() - (sessionStartedAtRef.current ?? Date.now())),
      achievedAt: new Date().toISOString()
    };

    const saveRecord = async () => {
      const nextRecords = await saveTetrisRecord(record);
      setRecords(nextRecords);
    };

    if (game.score > 0 || game.lines > 0) {
      void saveRecord();
    }
  }, [game, phase]);

  const beginGame = () => {
    sessionIdRef.current += 1;
    sessionStartedAtRef.current = Date.now();
    recordedSessionRef.current = null;
    observedLinesRef.current = 0;
    setGame(createNewGame());
    setPhase('running');
  };

  const handlePause = () => {
    setPhase((previous) => {
      if (previous === 'running') return 'paused';
      if (previous === 'paused') return 'running';
      return previous;
    });
  };

  const handleGameAction = (action: TetrisAction) => {
    if (phase !== 'running') return;
    setGame((previous) => (previous ? applyAction(previous, action) : previous));
  };

  const handleSkinChange = (nextSkin: TetrisSkinId) => {
    if (nextSkin === selectedSkin) return;
    setSelectedSkin(nextSkin);
    void saveTetrisSkin(nextSkin);
  };

  const handleClearRecords = async () => {
    if (records.length === 0) return;
    const confirmed = await showAppConfirm({
      message: copy.clearConfirm,
      confirmLabel: copy.clear,
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const nextRecords = await clearTetrisRecords();
      setRecords(nextRecords);
    } catch (error) {
      await showAppAlert(copy.clearFailed);
    }
  };

  const visibleBoard = game ? getVisibleBoard(game) : createEmptyBoard();
  const nextPiece = game ? getNextPieceType(game) : null;
  const previewBoard = createPreviewBoard(nextPiece);
  const score = game?.score ?? 0;
  const lines = game?.lines ?? 0;
  const level = game?.level ?? 1;
  const bestScore = Math.max(score, records[0]?.score ?? 0);
  const statusLabel =
    phase === 'idle'
      ? copy.statuses.idle
      : phase === 'paused'
      ? copy.statuses.paused
      : phase === 'game-over'
      ? copy.statuses.gameOver
      : copy.statuses.running;

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onBack} className="tm-button tm-button-ghost">
                  {copy.back}
                </button>
                <span className="tm-tetris-chip">{copy.moduleChip}</span>
              </div>
              <h1 className="text-3xl font-semibold tm-title">Tetris</h1>
              <p className="text-sm text-amber-200/75 max-w-2xl">
                {copy.description}
              </p>
            </div>
            <div className="tm-panel-soft p-3 tm-tetris-status-card">
              <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">{copy.status}</p>
              <p className="text-lg font-semibold tm-title">{statusLabel}</p>
            </div>
          </div>

          <div className="tm-tetris-layout">
            <section className="tm-panel p-3 sm:p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={beginGame} className="tm-button tm-button-gold">
                  {phase === 'idle' ? copy.start : copy.restart}
                </button>
                <button
                  onClick={handlePause}
                  className="tm-button tm-button-steel"
                  disabled={phase === 'idle' || phase === 'game-over'}
                >
                  {phase === 'paused' ? copy.resume : copy.pause}
                </button>
              </div>

              <div className="tm-tetris-board-wrap">
                <div
                  className="tm-tetris-board"
                  style={
                    {
                      '--tm-tetris-columns': BOARD_WIDTH,
                      '--tm-tetris-rows': BOARD_HEIGHT
                    } as CSSProperties
                  }
                >
                  {renderGrid(visibleBoard, 'board', selectedSkin, copy.skins)}
                </div>
                {phase === 'idle' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card">
                      {copy.startHint}
                    </div>
                  </div>
                ) : null}
                {phase === 'paused' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card">{copy.statuses.paused}</div>
                  </div>
                ) : null}
                {phase === 'game-over' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card tm-tetris-game-over-card">
                      <p className="m-0">{copy.statuses.gameOver}</p>
                      <div className="tm-tetris-game-over-stats">
                        <div>
                          <span>{copy.score}</span>
                          <strong>{score}</strong>
                        </div>
                        <div>
                          <span>{copy.best}</span>
                          <strong>{bestScore}</strong>
                        </div>
                      </div>
                      <p className="m-0 text-sm text-amber-200/75">{copy.gameOverHint}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="tm-tetris-controls">
                {CONTROL_BUTTONS.map((button) => {
                  const title =
                    copy.controlsTitles[button.action as keyof typeof copy.controlsTitles];
                  return (
                    <button
                      key={button.action}
                      onClick={() => handleGameAction(button.action)}
                      className="tm-button tm-button-primary tm-tetris-control"
                      disabled={phase !== 'running'}
                      aria-label={title}
                      title={title}
                    >
                      {button.text}
                    </button>
                  );
                })}
              </div>

              <div className="tm-panel-soft p-3 space-y-2">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">{copy.controls}</p>
                <p className="text-sm text-amber-100">
                  {copy.controlsHint}
                </p>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">
                  {copy.skinSection}
                </p>
                <div className="tm-tetris-skin-picker">
                  {Object.entries(TILE_SKINS).map(([skinId, skin]) => (
                    <button
                      key={skinId}
                      onClick={() => handleSkinChange(skinId as TetrisSkinId)}
                      className={`tm-button ${
                        selectedSkin === skinId ? 'tm-button-gold' : 'tm-button-ghost'
                      } tm-tetris-skin-button`}
                      title={copy.skins[skinId as TetrisSkinId]}
                    >
                      <span className={`tm-tetris-skin-swatch ${skin.className}`}>{skin.symbol}</span>
                      <span>{copy.skins[skinId as TetrisSkinId]}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-200/65">
                  {copy.skinHint}
                </p>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">
                  {copy.nextPiece}
                </p>
                <div className="tm-tetris-preview">
                  {renderGrid(previewBoard, 'preview', selectedSkin, copy.skins)}
                </div>
                <div className="tm-tetris-skin-legend">
                  <div className="tm-tetris-legend-item">
                    <span className={`tm-tetris-legend-chip ${TILE_SKINS[selectedSkin].className}`}>
                      {TILE_SKINS[selectedSkin].symbol}
                    </span>
                    <span className="text-sm text-amber-100">
                      {copy.activeSkin}: {copy.skins[selectedSkin]}
                    </span>
                  </div>
                </div>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">{copy.statistics}</p>
                <div className="tm-tetris-metrics">
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">{copy.score}</span>
                    <strong>{score}</strong>
                  </div>
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">{copy.lines}</span>
                    <strong>{lines}</strong>
                  </div>
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">{copy.level}</span>
                    <strong>{level}</strong>
                  </div>
                </div>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em] m-0">
                      {copy.records}
                    </p>
                    <span className="text-xs text-amber-200/65">{copy.autosave}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleClearRecords();
                    }}
                    className="tm-button tm-button-danger tm-button-sm"
                    disabled={records.length === 0}
                  >
                    {copy.clear}
                  </button>
                </div>
                {records.length > 0 ? (
                  <div className="space-y-2">
                    {records.slice(0, 8).map((record, index) => (
                      <div key={record.id} className="tm-panel-soft p-3 tm-tetris-record-row">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="m-0 text-sm font-semibold tm-title">
                              #{index + 1} · {copy.recordScore(record.score)}
                            </p>
                            <p className="m-0 text-xs text-amber-200/70">
                              {copy.recordMeta(
                                record.lines,
                                record.level,
                                formatDuration(record.durationMs)
                              )}
                            </p>
                          </div>
                          <span className="text-[11px] text-amber-200/55">
                            {formatRecordDate(record.achievedAt, copy.dateLocale)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    {copy.emptyRecords}
                  </div>
                )}
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
