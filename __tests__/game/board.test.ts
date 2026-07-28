/** Geometry, level validation, and the ray walk that every other rule sits on. */

import {
  buildLevel,
  castRay,
  colOf,
  createInitialState,
  EMPTY,
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
    arrows: [{ id: 'a', row: 0, col: 0, dir: 'right' }],
  };

  it('accepts a well-formed level', () => {
    expect(buildLevel(base).ok).toBe(true);
  });

  it.each([
    ['no arrows', { ...base, arrows: [] }, /no arrows/],
    ['zero rows', { ...base, rows: 0 }, /rows must be a positive integer/],
    ['zero cols', { ...base, cols: 0 }, /cols must be a positive integer/],
    [
      'row out of bounds',
      { ...base, arrows: [{ id: 'a', row: 9, col: 0, dir: 'right' as const }] },
      /outside 0\.\.2/,
    ],
    [
      'col out of bounds',
      { ...base, arrows: [{ id: 'a', row: 0, col: -1, dir: 'right' as const }] },
      /outside 0\.\.2/,
    ],
    [
      'duplicate id',
      {
        ...base,
        arrows: [
          { id: 'a', row: 0, col: 0, dir: 'right' as const },
          { id: 'a', row: 1, col: 1, dir: 'left' as const },
        ],
      },
      /duplicate arrow id/,
    ],
    [
      'two arrows on one cell',
      {
        ...base,
        arrows: [
          { id: 'a', row: 1, col: 1, dir: 'right' as const },
          { id: 'b', row: 1, col: 1, dir: 'left' as const },
        ],
      },
      /share cell/,
    ],
    [
      'invalid direction',
      { ...base, arrows: [{ id: 'a', row: 0, col: 0, dir: 'sideways' as never }] },
      /invalid dir/,
    ],
  ])('rejects %s', (_label, level, pattern) => {
    const result = buildLevel(level as LevelDefinition);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(pattern);
  });

  it('reports errors rather than throwing, so a bad level file cannot crash play', () => {
    expect(() => buildLevel({ ...base, rows: -4 })).not.toThrow();
  });
});

describe('castRay', () => {
  it('reaches the edge when nothing is in the way', () => {
    // A single arrow pointing right from the leftmost column of a 1x4 board.
    const { board, initial } = build('> . . .');
    const ray = castRay(board, initial, 0);
    expect(ray.blockerIndex).toBe(EMPTY);
    expect(ray.freeCells).toBe(3);
  });

  it('stops at the first arrow in the path and reports it', () => {
    const { board, initial } = build('> . < .');
    const ray = castRay(board, initial, 0);
    expect(ray.blockerIndex).toBe(1);
    expect(ray.freeCells).toBe(1);
    expect(ray.lastFreeCell).toBe(1);
  });

  it('reports zero free cells when the blocker is adjacent', () => {
    const { board, initial } = build('> < .');
    const ray = castRay(board, initial, 0);
    expect(ray.blockerIndex).toBe(1);
    expect(ray.freeCells).toBe(0);
    expect(ray.lastFreeCell).toBe(EMPTY);
  });

  it('only looks forward — an arrow behind does not block', () => {
    const { board, initial } = build('> > . .');
    // Arrow 1 points right with a clear path; arrow 0 sits behind it.
    const ray = castRay(board, initial, 1);
    expect(ray.blockerIndex).toBe(EMPTY);
  });

  it('walks vertically as well as horizontally', () => {
    const { board, initial } = build(`
      v
      .
      ^
    `);
    expect(castRay(board, initial, 0).blockerIndex).toBe(1);
    expect(castRay(board, initial, 1).blockerIndex).toBe(0);
  });
});

describe('ascii notation', () => {
  it('parses spaced and unspaced rows identically', () => {
    const spaced = parseAscii('> . <');
    const tight = parseAscii('>.<');
    expect(tight.arrows).toEqual(spaced.arrows);
    expect(tight.cols).toBe(3);
  });

  it('round-trips a board through render', () => {
    const art = '> . <\n. ^ .';
    const { board, initial } = build(art);
    expect(renderAscii(board, initial)).toBe(art);
  });

  it('rejects ragged rows and unknown glyphs', () => {
    expect(() => parseAscii('> . <\n. .')).toThrow(/expected 3/);
    expect(() => parseAscii('> ? <')).toThrow(/unknown glyph/);
    expect(() => parseAscii('   ')).toThrow(/empty board/);
  });
});

describe('initial state', () => {
  it('places every arrow on its start cell with matching occupancy', () => {
    const { board, initial } = build('> . <\n. ^ .');
    expect(initial.remaining).toBe(board.arrows.length);
    board.arrows.forEach((arrow, index) => {
      expect(initial.positions[index]).toBe(arrow.startCell);
      expect(initial.occupancy[arrow.startCell]).toBe(index);
    });
  });

  it('createInitialState is repeatable — this is what Restart relies on', () => {
    const { board, initial } = build('> . <\n. ^ .');
    const again = createInitialState(board);
    expect(Array.from(again.positions)).toEqual(Array.from(initial.positions));
  });

  it('finds arrows by their authored id', () => {
    const { board } = build('> . <');
    expect(indexOfArrow(board, 'a0')).toBe(0);
    expect(indexOfArrow(board, 'nope')).toBe(-1);
  });
});
