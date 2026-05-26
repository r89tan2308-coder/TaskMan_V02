import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { showAppAlert, showAppConfirm } from '../../components/AppDialog';
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
  title: string;
  text: string;
}> = [
  { action: 'move-left', title: 'Влево', text: '←' },
  { action: 'rotate-cw', title: 'Повернуть', text: '⟳' },
  { action: 'move-right', title: 'Вправо', text: '→' },
  { action: 'soft-drop', title: 'Вниз', text: '↓' },
  { action: 'hard-drop', title: 'Бросок', text: '⤓' }
];

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatRecordDate(value: string) {
  try {
    return new Date(value).toLocaleString('ru-RU', {
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

function renderBoardCell(cell: TetrominoType | null, key: string, selectedSkin: TetrisSkinId) {
  if (!cell) {
    return <div key={key} className="tm-tetris-cell tm-tetris-cell-empty" aria-hidden="true" />;
  }

  const skin = TILE_SKINS[selectedSkin];

  return (
    <div
      key={key}
      className={`tm-tetris-cell tm-tetris-cell-filled ${skin.className}`}
      title={skin.label}
      aria-hidden="true"
    >
      <span>{skin.symbol}</span>
    </div>
  );
}

function renderGrid(
  grid: BoardMatrix | Array<Array<TetrominoType | null>>,
  prefix: string,
  selectedSkin: TetrisSkinId
) {
  return grid.flatMap((row, rowIndex) =>
    row.map((cell, columnIndex) =>
      renderBoardCell(cell, `${prefix}-${rowIndex}-${columnIndex}`, selectedSkin)
    )
  );
}

export function TetrisPage({ onBack }: { onBack: () => void }) {
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
      message: 'Стереть все рекорды Tetris? Это действие нельзя отменить.',
      confirmLabel: 'Стереть',
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      const nextRecords = await clearTetrisRecords();
      setRecords(nextRecords);
    } catch (error) {
      await showAppAlert('Не удалось стереть рекорды Tetris.');
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
      ? 'Готова к старту'
      : phase === 'paused'
      ? 'Пауза'
      : phase === 'game-over'
      ? 'Игра окончена'
      : 'Идёт игра';

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-8">
        <div className="tm-frame tm-reveal space-y-4 p-3 sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={onBack} className="tm-button tm-button-ghost">
                  ← Settings
                </button>
                <span className="tm-tetris-chip">Отдельный модуль</span>
              </div>
              <h1 className="text-3xl font-semibold tm-title">Tetris</h1>
              <p className="text-sm text-amber-200/75 max-w-2xl">
                Фигуры можно переключать между котятами, сердечками, лапками и звёздами.
                Управление работает стрелками на клавиатуре и большими кнопками на смартфоне.
              </p>
            </div>
            <div className="tm-panel-soft p-3 tm-tetris-status-card">
              <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">Статус</p>
              <p className="text-lg font-semibold tm-title">{statusLabel}</p>
            </div>
          </div>

          <div className="tm-tetris-layout">
            <section className="tm-panel p-3 sm:p-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <button onClick={beginGame} className="tm-button tm-button-gold">
                  {phase === 'idle' ? 'Start' : 'Start заново'}
                </button>
                <button
                  onClick={handlePause}
                  className="tm-button tm-button-steel"
                  disabled={phase === 'idle' || phase === 'game-over'}
                >
                  {phase === 'paused' ? 'Продолжить' : 'Пауза'}
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
                  {renderGrid(visibleBoard, 'board', selectedSkin)}
                </div>
                {phase === 'idle' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card">
                      Нажми <strong>Start</strong>, чтобы начать.
                    </div>
                  </div>
                ) : null}
                {phase === 'paused' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card">Пауза</div>
                  </div>
                ) : null}
                {phase === 'game-over' ? (
                  <div className="tm-tetris-overlay">
                    <div className="tm-tetris-overlay-card tm-tetris-game-over-card">
                      <p className="m-0">Игра окончена</p>
                      <div className="tm-tetris-game-over-stats">
                        <div>
                          <span>Очки</span>
                          <strong>{score}</strong>
                        </div>
                        <div>
                          <span>Рекорд</span>
                          <strong>{bestScore}</strong>
                        </div>
                      </div>
                      <p className="m-0 text-sm text-amber-200/75">Можно сразу начать заново.</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="tm-tetris-controls">
                {CONTROL_BUTTONS.map((button) => (
                  <button
                    key={button.action}
                    onClick={() => handleGameAction(button.action)}
                    className="tm-button tm-button-primary tm-tetris-control"
                    disabled={phase !== 'running'}
                    aria-label={button.title}
                    title={button.title}
                  >
                    {button.text}
                  </button>
                ))}
              </div>

              <div className="tm-panel-soft p-3 space-y-2">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">Управление</p>
                <p className="text-sm text-amber-100">
                  Стрелки ← → двигают фигуру, ↑ поворачивает, ↓ ускоряет падение, Space делает
                  мгновенный бросок, P ставит на паузу.
                </p>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">
                  Оформление фигур
                </p>
                <div className="tm-tetris-skin-picker">
                  {Object.entries(TILE_SKINS).map(([skinId, skin]) => (
                    <button
                      key={skinId}
                      onClick={() => handleSkinChange(skinId as TetrisSkinId)}
                      className={`tm-button ${
                        selectedSkin === skinId ? 'tm-button-gold' : 'tm-button-ghost'
                      } tm-tetris-skin-button`}
                      title={skin.label}
                    >
                      <span className={`tm-tetris-skin-swatch ${skin.className}`}>{skin.symbol}</span>
                      <span>{skin.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-200/65">
                  Квадратики убраны. Все фигуры используют выбранный тобой скин.
                </p>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">
                  Следующая фигура
                </p>
                <div className="tm-tetris-preview">{renderGrid(previewBoard, 'preview', selectedSkin)}</div>
                <div className="tm-tetris-skin-legend">
                  <div className="tm-tetris-legend-item">
                    <span className={`tm-tetris-legend-chip ${TILE_SKINS[selectedSkin].className}`}>
                      {TILE_SKINS[selectedSkin].symbol}
                    </span>
                    <span className="text-sm text-amber-100">
                      Активный скин: {TILE_SKINS[selectedSkin].label}
                    </span>
                  </div>
                </div>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em]">Статистика</p>
                <div className="tm-tetris-metrics">
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">Score</span>
                    <strong>{score}</strong>
                  </div>
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">Lines</span>
                    <strong>{lines}</strong>
                  </div>
                  <div className="tm-tetris-metric">
                    <span className="tm-tetris-metric-label">Level</span>
                    <strong>{level}</strong>
                  </div>
                </div>
              </section>

              <section className="tm-panel p-3 sm:p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-amber-200/65 uppercase tracking-[0.2em] m-0">
                      Рекорды
                    </p>
                    <span className="text-xs text-amber-200/65">Автосохранение</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleClearRecords();
                    }}
                    className="tm-button tm-button-danger tm-button-sm"
                    disabled={records.length === 0}
                  >
                    Стереть
                  </button>
                </div>
                {records.length > 0 ? (
                  <div className="space-y-2">
                    {records.slice(0, 8).map((record, index) => (
                      <div key={record.id} className="tm-panel-soft p-3 tm-tetris-record-row">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="m-0 text-sm font-semibold tm-title">
                              #{index + 1} · {record.score} очков
                            </p>
                            <p className="m-0 text-xs text-amber-200/70">
                              {record.lines} линий · уровень {record.level} ·{' '}
                              {formatDuration(record.durationMs)}
                            </p>
                          </div>
                          <span className="text-[11px] text-amber-200/55">
                            {formatRecordDate(record.achievedAt)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="tm-screen p-3 text-sm text-amber-200/70">
                    Пока нет рекордов. Первый результат сохранится автоматически после партии.
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
