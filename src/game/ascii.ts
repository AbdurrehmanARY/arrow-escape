/**
 * ascii.ts — boards as text.
 *
 * Purpose:      A compact, eyeball-checkable notation for a board, so a level can
 *               be written, printed, and diffed as plain text.
 * Responsibilities:
 *               - `parseAscii`  — text -> `LevelDefinition`.
 *               - `renderAscii` — `BoardState` -> text.
 * Notes:        This is production code, not a test-only helper: the level
 *               generator prints candidates with it, the validator quotes failing
 *               boards with it, and the unit tests author fixtures with it. One
 *               notation everywhere means a board in a failing CI log can be
 *               pasted straight back into a test.
 *
 *               Glyphs: `^` up, `v` down, `<` left, `>` right, `.` empty.
 */

import { rowOf, colOf } from './board';
import {
  type Board,
  type BoardState,
  type Direction,
  ESCAPED,
  type LevelDefinition,
  type ArrowSpec,
  type RuleVariant,
} from './types';

const GLYPH_TO_DIR: Readonly<Record<string, Direction>> = {
  '^': 'up',
  v: 'down',
  V: 'down',
  '<': 'left',
  '>': 'right',
};

/** Glyph used to draw each direction. Exported so the renderer can share it. */
export const DIR_TO_GLYPH: Readonly<Record<Direction, string>> = {
  up: '^',
  down: 'v',
  left: '<',
  right: '>',
};

export interface ParseAsciiOptions {
  readonly id?: number;
  readonly name?: string;
  readonly layout?: string;
  readonly difficulty?: number;
  readonly variant?: RuleVariant;
}

/**
 * Read a board drawn as text into a `LevelDefinition`.
 *
 * Blank lines are ignored and each row is read by non-space glyphs, so both
 * `>.<` and `> . <` describe the same three-cell row. Arrows are given ids
 * `a0, a1, ...` in reading order, which keeps generated fixtures stable.
 *
 * Throws on malformed input. That is deliberate and is the one exception to the
 * "domain functions never throw" rule: this parser only ever sees developer- or
 * tool-authored input, never a shipped level file, so a loud failure at authoring
 * time is better than a `Result` every caller has to unwrap.
 */
export function parseAscii(art: string, options: ParseAsciiOptions = {}): LevelDefinition {
  const lines = art
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) throw new Error('parseAscii: empty board');

  const grid = lines.map((line) => line.split(/\s+/).flatMap((chunk) => [...chunk]));
  const cols = grid[0]!.length;

  grid.forEach((row, index) => {
    if (row.length !== cols) {
      throw new Error(`parseAscii: row ${index} has ${row.length} cells, expected ${cols}`);
    }
  });

  const arrows: ArrowSpec[] = [];
  grid.forEach((row, r) => {
    row.forEach((glyph, c) => {
      if (glyph === '.') return;
      const dir = GLYPH_TO_DIR[glyph];
      if (!dir) throw new Error(`parseAscii: unknown glyph "${glyph}" at (${r}, ${c})`);
      arrows.push({ id: `a${arrows.length}`, row: r, col: c, dir });
    });
  });

  const level: LevelDefinition = {
    id: options.id ?? 0,
    name: options.name ?? 'ascii',
    rows: grid.length,
    cols,
    layout: options.layout ?? 'free',
    difficulty: options.difficulty ?? 1,
    arrows,
    ...(options.variant ? { variant: options.variant } : {}),
  };

  return level;
}

/**
 * Draw the current board as text.
 *
 * Used for failure messages in tests and for the generator's console preview, so
 * a human can see the board that misbehaved instead of a list of coordinates.
 */
export function renderAscii(board: Board, state: BoardState): string {
  const grid: string[][] = Array.from({ length: board.rows }, () =>
    Array.from({ length: board.cols }, () => '.'),
  );

  board.arrows.forEach((arrow, index) => {
    const cell = state.positions[index]!;
    if (cell === ESCAPED) return;
    grid[rowOf(cell, board.cols)]![colOf(cell, board.cols)] = DIR_TO_GLYPH[arrow.dir];
  });

  return grid.map((row) => row.join(' ')).join('\n');
}
