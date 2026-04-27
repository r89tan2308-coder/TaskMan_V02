export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 20;

export const TETROMINO_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;

export type TetrominoType = (typeof TETROMINO_TYPES)[number];
export type TetrisAction =
  | 'tick'
  | 'move-left'
  | 'move-right'
  | 'soft-drop'
  | 'hard-drop'
  | 'rotate-cw'
  | 'rotate-ccw';
export type BoardCell = TetrominoType | null;
export type BoardMatrix = BoardCell[][];

export interface PiecePoint {
  x: number;
  y: number;
}

export interface ActivePiece {
  type: TetrominoType;
  rotation: number;
  x: number;
  y: number;
}

export interface TetrisGameState {
  board: BoardMatrix;
  current: ActivePiece;
  nextQueue: TetrominoType[];
  score: number;
  lines: number;
  level: number;
  status: 'running' | 'game-over';
}

const LINE_CLEAR_SCORE: Record<number, number> = {
  0: 0,
  1: 100,
  2: 300,
  3: 500,
  4: 800
};

const ROTATIONS: Record<TetrominoType, readonly (readonly PiecePoint[])[]> = {
  I: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 }
    ]
  ],
  O: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]
  ],
  T: [
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ],
  S: [
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ],
  Z: [
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0, y: 2 }
    ]
  ],
  J: [
    [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 }
    ]
  ],
  L: [
    [
      { x: 2, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 }
    ],
    [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 }
    ],
    [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 2 }
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 }
    ]
  ]
};

const ROTATION_KICKS: ReadonlyArray<PiecePoint> = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 }
];

export function createEmptyBoard(): BoardMatrix {
  return Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null)
  );
}

function normalizeRotation(value: number) {
  return ((value % 4) + 4) % 4;
}

export function getPieceCells(piece: ActivePiece): readonly PiecePoint[] {
  return ROTATIONS[piece.type][normalizeRotation(piece.rotation)];
}

function getPieceBounds(type: TetrominoType, rotation = 0) {
  const cells = ROTATIONS[type][normalizeRotation(rotation)];
  let maxX = 0;
  let maxY = 0;
  for (const cell of cells) {
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y > maxY) maxY = cell.y;
  }
  return {
    width: maxX + 1,
    height: maxY + 1
  };
}

export function createPiece(
  type: TetrominoType,
  rotation = 0,
  x?: number,
  y = 0
): ActivePiece {
  const bounds = getPieceBounds(type, rotation);
  return {
    type,
    rotation: normalizeRotation(rotation),
    x: x ?? Math.floor((BOARD_WIDTH - bounds.width) / 2),
    y
  };
}

function cloneBoard(board: BoardMatrix) {
  return board.map((row) => row.slice());
}

function shuffleBag(random: () => number) {
  const bag = [...TETROMINO_TYPES];
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = bag[index];
    bag[index] = bag[swapIndex];
    bag[swapIndex] = current;
  }
  return bag;
}

function ensureQueue(queue: TetrominoType[], random: () => number) {
  const nextQueue = [...queue];
  while (nextQueue.length < TETROMINO_TYPES.length) {
    nextQueue.push(...shuffleBag(random));
  }
  return nextQueue;
}

function takeNextType(queue: TetrominoType[], random: () => number) {
  const prepared = ensureQueue(queue, random);
  const [nextType, ...rest] = prepared;
  return {
    nextType,
    nextQueue: rest
  };
}

export function canPlacePiece(board: BoardMatrix, piece: ActivePiece) {
  const cells = getPieceCells(piece);
  for (const cell of cells) {
    const boardX = piece.x + cell.x;
    const boardY = piece.y + cell.y;
    if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
      return false;
    }
    if (boardY >= 0 && board[boardY][boardX] !== null) {
      return false;
    }
  }
  return true;
}

function translatePiece(piece: ActivePiece, deltaX: number, deltaY: number): ActivePiece {
  return {
    ...piece,
    x: piece.x + deltaX,
    y: piece.y + deltaY
  };
}

function rotatePiece(piece: ActivePiece, direction: 1 | -1) {
  return {
    ...piece,
    rotation: normalizeRotation(piece.rotation + direction)
  };
}

function mergePieceIntoBoard(board: BoardMatrix, piece: ActivePiece) {
  const nextBoard = cloneBoard(board);
  for (const cell of getPieceCells(piece)) {
    const boardX = piece.x + cell.x;
    const boardY = piece.y + cell.y;
    if (boardY < 0) continue;
    nextBoard[boardY][boardX] = piece.type;
  }
  return nextBoard;
}

function clearCompletedLines(board: BoardMatrix) {
  const keptRows = board.filter((row) => row.some((cell) => cell === null));
  const clearedLineCount = BOARD_HEIGHT - keptRows.length;
  const nextBoard = [
    ...Array.from({ length: clearedLineCount }, () => Array.from({ length: BOARD_WIDTH }, () => null)),
    ...keptRows.map((row) => row.slice())
  ];
  return {
    board: nextBoard,
    clearedLineCount
  };
}

const LINES_PER_LEVEL = 6;

export function calculateLevel(lines: number) {
  return Math.floor(lines / LINES_PER_LEVEL) + 1;
}

function spawnNextPiece(
  board: BoardMatrix,
  queue: TetrominoType[],
  score: number,
  lines: number,
  random: () => number
) {
  const { nextType, nextQueue } = takeNextType(queue, random);
  const current = createPiece(nextType);
  return {
    board,
    current,
    nextQueue,
    score,
    lines,
    level: calculateLevel(lines),
    status: canPlacePiece(board, current) ? ('running' as const) : ('game-over' as const)
  };
}

function lockCurrentPiece(
  state: TetrisGameState,
  random: () => number,
  dropBonus = 0
): TetrisGameState {
  const overflow = getPieceCells(state.current).some((cell) => state.current.y + cell.y < 0);
  if (overflow) {
    return {
      ...state,
      score: state.score + dropBonus,
      status: 'game-over'
    };
  }

  const mergedBoard = mergePieceIntoBoard(state.board, state.current);
  const { board, clearedLineCount } = clearCompletedLines(mergedBoard);
  const nextLines = state.lines + clearedLineCount;
  const nextScore =
    state.score + dropBonus + (LINE_CLEAR_SCORE[clearedLineCount] ?? 0) * state.level;

  return spawnNextPiece(board, state.nextQueue, nextScore, nextLines, random);
}

export function createNewGame(random: () => number = Math.random): TetrisGameState {
  return spawnNextPiece(createEmptyBoard(), [], 0, 0, random);
}

export function getVisibleBoard(state: TetrisGameState): BoardMatrix {
  if (state.status === 'game-over') {
    return mergePieceIntoBoard(state.board, state.current);
  }

  const nextBoard = cloneBoard(state.board);
  for (const cell of getPieceCells(state.current)) {
    const boardX = state.current.x + cell.x;
    const boardY = state.current.y + cell.y;
    if (boardY < 0) continue;
    nextBoard[boardY][boardX] = state.current.type;
  }
  return nextBoard;
}

export function getNextPieceType(state: TetrisGameState) {
  return state.nextQueue[0] ?? null;
}

export function getDropIntervalMs(level: number) {
  return Math.max(100, 760 - (level - 1) * 80);
}

export function applyAction(
  state: TetrisGameState,
  action: TetrisAction,
  random: () => number = Math.random
): TetrisGameState {
  if (state.status === 'game-over') {
    return state;
  }

  if (action === 'move-left' || action === 'move-right') {
    const deltaX = action === 'move-left' ? -1 : 1;
    const nextPiece = translatePiece(state.current, deltaX, 0);
    return canPlacePiece(state.board, nextPiece) ? { ...state, current: nextPiece } : state;
  }

  if (action === 'soft-drop' || action === 'tick') {
    const nextPiece = translatePiece(state.current, 0, 1);
    if (canPlacePiece(state.board, nextPiece)) {
      return {
        ...state,
        current: nextPiece,
        score: action === 'soft-drop' ? state.score + 1 : state.score
      };
    }
    return lockCurrentPiece(state, random);
  }

  if (action === 'hard-drop') {
    let current = state.current;
    let droppedRows = 0;
    while (true) {
      const nextPiece = translatePiece(current, 0, 1);
      if (!canPlacePiece(state.board, nextPiece)) {
        break;
      }
      current = nextPiece;
      droppedRows += 1;
    }
    return lockCurrentPiece({ ...state, current }, random, droppedRows * 2);
  }

  if (action === 'rotate-cw' || action === 'rotate-ccw') {
    const direction = action === 'rotate-cw' ? 1 : -1;
    const rotated = rotatePiece(state.current, direction);
    for (const kick of ROTATION_KICKS) {
      const candidate = translatePiece(rotated, kick.x, kick.y);
      if (canPlacePiece(state.board, candidate)) {
        return {
          ...state,
          current: candidate
        };
      }
    }
  }

  return state;
}
