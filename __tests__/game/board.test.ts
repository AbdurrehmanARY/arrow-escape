/** Geometry, snake-body validation, and the ray walk that every other rule sits on. */

import {
  buildLevel,
  castRay,
  colOf,
  createInitialState,
  directionBetween,
  EMPTY,
  exitPath,
  indexOfArrow,
  isDirection,
  type LevelDefinition,
  parseAscii,
  renderAscii,
  rowOf,
  toCell,
} from '@game';
import { build } from '../helpers';

describe('cell geometry', () => {
  it('round-trips row/col through a cell index', () => {
    const cols = 7;
    for (let row = 0; row < 5; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = toCell(row, col, cols);
        expect(rowOf(cell, cols)).toBe(row);
        expect(colOf(cell, cols)).toBe(col);
      }
    }
  });

  it('names the direction between adjacent cells', () => {
    const cols = 4;
    expect(directionBetween(toCell(1, 1, cols), toCell(0, 1, cols), cols)).toBe('up');
    expect(directionBetween(toCell(1, 1, cols), toCell(2, 1, cols), cols)).toBe('down');
    expect(directionBetween(toCell(1, 1, cols), toCell(1, 0, cols), cols)).toBe('left');
    expect(directionBetween(toCell(1, 1, cols), toCell(1, 2, cols), cols)).toBe('right');
    // Diagonal and distant cells are not adjacent.
    expect(directionBetween(toCell(1, 1, cols), toCell(2, 2, cols), cols)).toBeUndefined();
    expect(directionBetween(toCell(1, 1, cols), toCell(1, 3, cols), cols)).toBeUndefined();
  });
});

describe('isDirection', () => {
  it('accepts the four directions and rejects anything else', () => {
    expect(isDirection('up')).toBe(true);
    expect(isDirection('right')).toBe(true);
    expect(isDirection('diagonal')).toBe(false);
    expect(isDirection(3)).toBe(false);
    expect(isDirection(undefined)).toBe(false);
  });
});

describe('buildLevel validation', () => {
  const base: LevelDefinition = {
    id: 1,
    name: 'test',
    rows: 3,
    cols: 3,
    layout: 'free',
    difficulty: 1,
    arrows: [{ id: 'a', body: [[0, 0], [0, 1]] }],
  };

  it('accepts a well-formed level', () => {
    const result = buildLevel(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Head at (0,0), neck at (0,1) â€” the head continues leftward.
    expect(result.value.board.arrows[0]!.dir).toBe('left');
  });

  it.each([
    ['no arrows', { ...base, arrows: [] }, /no arrows/],
    ['zero rows', { ...base, rows: 0 }, /rows must be a positive integer/],
    ['zero cols', { ...base, cols: 0 }, /cols must be a positive integer/],
    ['empty body', { ...base, arrows: [{ id: 'a', body: [] }] }, /empty body/],
    [
      'row out of bounds',
      { ...base, arrows: [{ id: 'a', body: [[9, 0], [9, 1]] }] },
      /outside 0\.\.2/,
    ],
    [
      'col out of bounds',
      { ...base, arrows: [{ id: 'a', body: [[0, -1], [0, 0]] }] },
      /outside 0\.\.2/,
    ],
    [
      'disconnected body',
      { ...base, arrows: [{ id: 'a', body: [[0, 0], [2, 2]] }] },
      /not connected/,
    ],
    [
      'body visits a cell twice',
      { ...base, arrows: [{ id: 'a', body: [[0, 0], [0, 1], [0, 0]] }] },
      /twice/,
    ],
    [
      'two arrows share a cell',
      {
        ...base,
        arrows: [
          { id: 'a', body: [[0, 0], [0, 1]] },
          { id: 'b', body: [[0, 1], [0, 2]] },
        ],
      },
      /both occupy cell/,
    ],
    [
      'duplicate id',
      {
        ...base,
        arrows: [
          { id: 'a', body: [[0, 0], [0, 1]] },
          { id: 'a', body: [[2, 0], [2, 1]] },
        ],
      },
      /duplicate arrow id/,
    ],
    [
      'single cell without a direction',
      { ...base, arrows: [{ id: 'a', body: [[0, 0]] }] },
      /must state a "dir"/,
    ],
    [
      'declared direction contradicts the geometry',
      { ...base, arrows: [{ id: 'a', body: [[0, 0], [0, 1]], dir: 'down' as const }] },
      /must continue the line/,
    ],
  ])('rejects %s', (_label, level, pattern) => {
    const result = buildLevel(level as LevelDefinition);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });

  it('accepts a single-cell arrow when it states its direction', () => {
    const result = buildLevel({
      ...base,
      arrows: [{ id: 'a', body: [[1, 1]], dir: 'up' }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.board.arrows[0]!.dir).toBe('up');
  });

  it('reports errors rather than throwing, so a bad level file cannot crash play', () => {
    expect(() => buildLevel({ ...base, rows: -4 })).not.toThrow();
  });
});

describe('castRay', () => {
  it('reaches the edge when nothing is in the way', () => {
    // Head at (0,0) pointing left, body trailing right. Nothing to the left.
    const { board, initial } = build('A a a .');
    const ray = castRay(board, initial, 0);
    expect(ray.blockedBy).toBe('nothing');
    expect(ray.freeCells).toBe(0);
    expect(ray.blockedAt).toBe(EMPTY);
  });

  it('counts the empty cells ahead of the head', () => {
    const { board, initial } = build(`
      . . . .
      . . a A
      . . . .
    `);
    // Head at (1,3) pointing right, one column from the edge.
    const ray = castRay(board, initial, 0);
    expect(ray.blockedBy).toBe('nothing');
    expect(ray.freeCells).toBe(0);
  });

  it('stops at the first arrow in the path and reports where', () => {
    const { board, initial } = build(`
      a A . b B
    `);
    // Arrow a's head is at (0,1) pointing right; arrow b occupies (0,3) and (0,4).
    const ray = castRay(board, initial, 0);
    expect(ray.blockerArrow).toBe(1);
    expect(ray.freeCells).toBe(1);
    expect(ray.blockedAt).toBe(3);
  });

  it('does not let an arrow block itself â€” a body threads out behind its own head', () => {
    // A hook whose own tail sits directly in front of its head: the head is at
    // (2,1) pointing right, and the tail occupies (2,3) on that exact ray. The
    // tail vacates as the head advances, so this arrow is free, not self-blocked.
    // Spiral bodies are one of the shipped layout shapes, so this case is real.
    const { board, initial } = build(`
      a a a a
      a . . a
      a A . a
    `);
    expect(board.arrows[0]!.body).toHaveLength(9);
    expect(board.arrows[0]!.dir).toBe('right');

    const ray = castRay(board, initial, 0);
    expect(ray.blockedBy).toBe('nothing');
  });

  it('only looks forward â€” the body behind the head never blocks it', () => {
    const { board, initial } = build('. A a a');
    const ray = castRay(board, initial, 0);
    expect(ray.blockedBy).toBe('nothing');
  });

  it('walks vertically as well as horizontally', () => {
    const { board, initial } = build(`
      A .
      a .
      B .
      b .
    `);
    // a's head at (0,0) points up (off the board); b's head at (2,0) points up
    // into a's body.
    expect(castRay(board, initial, 0).blockedBy).toBe('nothing');
    expect(castRay(board, initial, 1).blockerArrow).toBe(0);
  });
});

describe('exitPath', () => {
  it('lists the cells the head crosses on its way out', () => {
    const { board } = build(`
      . . . .
      A a . .
      . . . .
    `);
    // Head at (1,0) pointing left â€” one step and it is off the board.
    expect(exitPath(board, 0)).toEqual([]);
  });

  it('lists every cell to the far edge', () => {
    const { board } = build(`
      a A . .
    `);
    // Head at (0,1) pointing right: crosses (0,2) then (0,3).
    expect(exitPath(board, 0)).toEqual([2, 3]);
  });
});

describe('ascii notation', () => {
  it('parses spaced and unspaced rows identically', () => {
    const spaced = parseAscii('A a .');
    const tight = parseAscii('Aa.');
    expect(tight.arrows).toEqual(spaced.arrows);
    expect(tight.cols).toBe(3);
  });

  it('recovers body order by walking from the head', () => {
    const level = parseAscii(`
      A a a
      . . a
    `);
    expect(level.arrows).toHaveLength(1);
    expect(level.arrows[0]!.body).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ]);
  });

  it('round-trips a board through render', () => {
    const art = 'A a . B\n. a . b';
    const { board, initial } = build(art);
    expect(renderAscii(board, initial)).toBe(art);
  });

  it.each([
    ['ragged rows', 'A a .\n. .', /expected 3/],
    ['unknown glyph', 'A ? .', /unknown glyph/],
    ['empty board', '   ', /empty board/],
    ['two heads', 'A A .', /two heads/],
    ['no head', 'a a .', /has no head/],
    ['detached cells', 'A a . a', /not one connected line/],
    ['branching body', 'A a a\n. a .', /branches at/],
    ['single-cell arrow', 'A . .', /single cell/],
  ])('rejects %s', (_label, art, pattern) => {
    expect(() => parseAscii(art)).toThrow(pattern);
  });
});

describe('initial state', () => {
  it('marks every body cell as occupied by its arrow', () => {
    const { board, initial } = build('A a . B b');
    expect(initial.remaining).toBe(2);

    board.arrows.forEach((arrow, index) => {
      expect(initial.alive[index]).toBe(1);
      for (const cell of arrow.body) expect(initial.occupancy[cell]).toBe(index);
    });
    expect(initial.occupancy[2]).toBe(EMPTY);
  });

  it('createInitialState is repeatable â€” this is what Restart relies on', () => {
    const { board, initial } = build('A a . B b');
    const again = createInitialState(board);
    expect(Array.from(again.occupancy)).toEqual(Array.from(initial.occupancy));
    expect(Array.from(again.alive)).toEqual(Array.from(initial.alive));
  });

  it('finds arrows by their authored id', () => {
    const { board } = build('A a . B b');
    expect(indexOfArrow(board, 'a')).toBe(0);
    expect(indexOfArrow(board, 'nope')).toBe(-1);
  });
});
