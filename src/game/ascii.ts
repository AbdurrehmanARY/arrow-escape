/**
 * ascii.ts — boards as text.
 *
 * Purpose:      A compact, eyeball-checkable notation for a board of snakes, so a
 *               level can be written, printed, and diffed as plain text.
 * Responsibilities:
 *               - `parseAscii`  — text -> `LevelDefinition`.
 *               - `renderAscii` — `BoardState` -> text.
 * Notes:        Production code, not a test-only helper: the level generator
 *               prints candidates with it, the validator quotes failing boards
 *               with it, and the unit tests author fixtures with it. One notation
 *               everywhere means a board in a failing CI log can be pasted
 *               straight back into a test.
 *
 *               Notation: each arrow is one letter. **Uppercase marks the head**,
 *               lowercase marks the rest of the body, `.` is empty.
 *
 *                   A a a .
 *                   . . a .
 *                   . . a .
 *
 *               The body order is recovered by walking from the head through
 *               connected cells of the same letter, and the direction is inferred
 *               from the head's last segment — an arrowhead always continues the
 *               line it is drawn on. So the picture alone fully determines the
 *               arrow, with nothing to keep in sync by hand.
 *
 *               Two more glyphs arrived with Phase 15. `#` is a wall, and a digit
 *               is a gate cell — `0` is the first entry of `options.gates`, `1` the
 *               second, and so on. Colours cannot be drawn, so an arrow's group is
 *               named in `options.groups` by letter. Keeping gate polarity out of
 *               the picture is deliberate: `opens` and `shuts` look identical on a
 *               grid and would be the easiest thing in the world to misread.
 */

import { colOf, rowOf, toCell } from './board';
import {
  type ArrowSpec,
  type Board,
  type BoardState,
  EMPTY,
  type LevelDefinition,
} from './types';

export interface ParseAsciiOptions {
  readonly id?: number;
  readonly name?: string;
  readonly layout?: string;
  readonly difficulty?: number;
  readonly hearts?: number;
  /**
   * Arrow letter -> colour group name, e.g. `{ a: 'red', b: 'red' }`.
   *
   * Groups live outside the picture because a grid of letters has no room left to
   * carry a second axis of identity, and inventing one would make every fixture in
   * the test suite harder to read for the sake of the few that need colours.
   */
  readonly groups?: Readonly<Record<string, string>>;
}

/** Split a drawing into a rectangular grid of single-character cells. */
function toGrid(art: string): string[][] {
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

  return grid;
}

/**
 * Read a board drawn as text into a `LevelDefinition`.
 *
 * Throws on malformed input. That is deliberate and is the one exception to the
 * "domain functions never throw" rule: this parser only ever sees developer- or
 * tool-authored input, never a shipped level file, so a loud failure at authoring
 * time is better than a `Result` every caller has to unwrap.
 */
export function parseAscii(art: string, options: ParseAsciiOptions = {}): LevelDefinition {
  const grid = toGrid(art);
  const rows = grid.length;
  const cols = grid[0]!.length;

  /** letter -> every cell holding it, plus which one was the head. */
  const cellsByLetter = new Map<string, { cells: number[]; head: number | undefined }>();

  grid.forEach((row, r) => {
    row.forEach((glyph, c) => {
      if (glyph === '.') return;

      if (!/^[A-Za-z]$/.test(glyph)) {
        throw new Error(`parseAscii: unknown glyph "${glyph}" at (${r}, ${c})`);
      }

      const letter = glyph.toLowerCase();
      const cell = toCell(r, c, cols);
      const entry = cellsByLetter.get(letter) ?? { cells: [], head: undefined };
      entry.cells.push(cell);

      if (glyph === glyph.toUpperCase()) {
        if (entry.head !== undefined) {
          throw new Error(`parseAscii: arrow "${letter}" has two heads`);
        }
        entry.head = cell;
      }

      cellsByLetter.set(letter, entry);
    });
  });

  const arrows: ArrowSpec[] = [];

  // Sort by letter so ids are stable regardless of drawing order.
  for (const letter of [...cellsByLetter.keys()].sort()) {
    const { cells, head } = cellsByLetter.get(letter)!;
    if (head === undefined) {
      throw new Error(
        `parseAscii: arrow "${letter}" has no head — capitalise the cell with the arrowhead`,
      );
    }

    const remaining = new Set(cells);
    const body: number[] = [head];
    remaining.delete(head);

    // Walk the chain: from the current end, step to the single unvisited
    // neighbour carrying the same letter.
    let cursor = head;
    while (remaining.size > 0) {
      const row = rowOf(cursor, cols);
      const col = colOf(cursor, cols);
      const neighbours = [
        row > 0 ? toCell(row - 1, col, cols) : -1,
        row + 1 < rows ? toCell(row + 1, col, cols) : -1,
        col > 0 ? toCell(row, col - 1, cols) : -1,
        col + 1 < cols ? toCell(row, col + 1, cols) : -1,
      ].filter((cell) => cell >= 0 && remaining.has(cell));

      if (neighbours.length === 0) {
        throw new Error(
          `parseAscii: arrow "${letter}" is not one connected line — ` +
            `${remaining.size} cell(s) are detached from the head`,
        );
      }
      if (neighbours.length > 1) {
        throw new Error(
          `parseAscii: arrow "${letter}" branches at (${row}, ${col}) — a body must be a simple path`,
        );
      }

      cursor = neighbours[0]!;
      body.push(cursor);
      remaining.delete(cursor);
    }

    if (body.length === 1) {
      throw new Error(
        `parseAscii: arrow "${letter}" is a single cell, so its direction cannot be ` +
          'inferred — give it a body of at least two cells',
      );
    }

    const group = options.groups?.[letter];
    arrows.push({
      id: letter,
      body: body.map((cell) => [rowOf(cell, cols), colOf(cell, cols)] as const),
      ...(group !== undefined ? { group } : {}),
    });
  }

  if (arrows.length === 0) throw new Error('parseAscii: board has no arrows');

  return {
    id: options.id ?? 0,
    name: options.name ?? 'ascii',
    rows,
    cols,
    layout: options.layout ?? 'free',
    difficulty: options.difficulty ?? 1,
    arrows,
    ...(options.hearts !== undefined ? { hearts: options.hearts } : {}),
  };
}

/**
 * Draw the current board as text, using the same notation `parseAscii` reads.
 */
export function renderAscii(board: Board, state: BoardState): string {
  const grid: string[][] = Array.from({ length: board.rows }, () =>
    Array.from({ length: board.cols }, () => '.'),
  );

  board.arrows.forEach((arrow, index) => {
    if (state.alive[index] !== 1) return;
    const letter = arrow.id.length === 1 ? arrow.id.toLowerCase() : String.fromCharCode(97 + index);
    arrow.body.forEach((cell, position) => {
      grid[rowOf(cell, board.cols)]![colOf(cell, board.cols)] =
        position === 0 ? letter.toUpperCase() : letter;
    });
  });

  return grid.map((row) => row.join(' ')).join('\n');
}

/**
 * Arrow glyph for a direction, for compact debug output and the HUD.
 *
 * Direction is carried by the glyph's shape rather than by colour, which keeps
 * the board readable for colour-blind players (GDD §10).
 */
export const DIR_GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶' } as const;

/** Render an arrow's head direction as a single glyph. */
export function glyphFor(board: Board, arrowIndex: number): string {
  return DIR_GLYPH[board.arrows[arrowIndex]!.dir];
}

/** True when nothing occupies this cell. Small helper for renderers. */
export function isCellEmpty(state: BoardState, cell: number): boolean {
  return state.occupancy[cell] === EMPTY;
}

/** Which arrow occupies a cell, or `EMPTY`. Small helper for renderers. */
export function occupantOf(state: BoardState, cell: number): number {
  return state.occupancy[cell] ?? EMPTY;
}
