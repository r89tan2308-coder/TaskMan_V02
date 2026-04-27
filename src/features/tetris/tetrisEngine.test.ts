import { describe, expect, it } from 'vitest';
import {
  applyAction,
  calculateLevel,
  canPlacePiece,
  createEmptyBoard,
  createPiece,
  getDropIntervalMs,
  getPieceCells,
  type TetrisGameState
} from './tetrisEngine';

function createState(overrides: Partial<TetrisGameState>): TetrisGameState {
  return {
    board: createEmptyBoard(),
    current: createPiece('T'),
    nextQueue: ['I', 'O', 'S', 'Z', 'J', 'L'],
    score: 0,
    lines: 0,
    level: 1,
    status: 'running',
    ...overrides
  };
}

describe('tetrisEngine', () => {
  it('rotates L piece into the next standard orientation', () => {
    const state = createState({
      current: createPiece('L', 0, 4, 5)
    });

    const rotated = applyAction(state, 'rotate-cw');
    const rotatedCells = getPieceCells(rotated.current)
      .map(({ x, y }) => `${x}:${y}`)
      .sort();

    expect(rotated.current.rotation).toBe(1);
    expect(rotatedCells).toEqual(['1:0', '1:1', '1:2', '2:2']);
    expect(canPlacePiece(rotated.board, rotated.current)).toBe(true);
  });

  it('clears completed lines and awards score when a piece locks', () => {
    const board = createEmptyBoard();

    for (let x = 0; x < 10; x += 1) {
      if (x === 4 || x === 5) continue;
      board[18][x] = 'I';
      board[19][x] = 'I';
    }

    const state = createState({
      board,
      current: createPiece('O', 0, 4, 18)
    });

    const next = applyAction(state, 'tick');

    expect(next.lines).toBe(2);
    expect(next.score).toBe(300);
    expect(next.board[18].every((cell) => cell === null)).toBe(true);
    expect(next.board[19].every((cell) => cell === null)).toBe(true);
  });

  it('adds hard-drop score based on travelled rows', () => {
    const state = createState({
      current: createPiece('I', 1, 4, 0)
    });

    const next = applyAction(state, 'hard-drop');

    expect(next.score).toBeGreaterThanOrEqual(30);
    expect(next.board.some((row) => row.some((cell) => cell === 'I'))).toBe(true);
  });

  it('ramps level and fall speed faster than before', () => {
    expect(calculateLevel(0)).toBe(1);
    expect(calculateLevel(5)).toBe(1);
    expect(calculateLevel(6)).toBe(2);
    expect(calculateLevel(12)).toBe(3);
    expect(getDropIntervalMs(1)).toBe(760);
    expect(getDropIntervalMs(4)).toBe(520);
  });
});
