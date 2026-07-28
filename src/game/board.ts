/**
 * board.ts — geometry, board construction, and the ray walk.
 *
 * Purpose:      Turn authored level data into a runtime `Board`, and answer the
 *               one question the whole game rests on: "what is in front of this
 *               arrow?"
 * Responsibilities:
 *               - Cell index <-> row/col conversion.
 *               - Validating and building a `Board` + initial `BoardState`.
 *               - `castRay`, the single place that walks an arrow's path.
 * Notes:        Pure. `castRay` is the hottest function in the codebase — the
 *               solver calls it on the order of 10^5–10^6 times per level — so it
 *               allocates nothing and reads a flat `Int32Array`.
 */

import {
  type Arrow,
  type ArrowSpec,
  type Board,
  type BoardState,
  type CellIndex,
  type Direction,
  EMPTY,
  ESCAPED,
  err,
  type LevelDefinition,
  ok,
  type Result,
} from './types';

/** Row/column deltas for each direction. Single source of truth for "forward". */
const DELTAS: Record<Direction, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

/** Every legal direction, for validation and for the level generator. */
export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

/** True if `value` is one of the four directions. Guards untrusted level JSON. */
export function isDirection(value: unknown): value is Direction {
  return typeof value === 'string' && (DIRECTIONS as readonly string[]).includes(value);
}

/** Pack a row/column pair into a `CellIndex`. */
export const toCell = (row: number, col: number, cols: number): CellIndex => row * cols + col;

/** Row component of a `CellIndex`. */
export const rowOf = (cell: CellIndex, cols: number): number => Math.floor(cell / cols);

/** Column component of a `CellIndex`. */
export const colOf = (cell: CellIndex, cols: number): number => cell % cols;

/**
 * What an arrow's forward ray runs into.
 *
 * `blockerIndex` is `EMPTY` when the ray reaches the edge unobstructed, which is
 * the "this arrow can escape" case. `freeCells` is how many empty cells sit
 * between the arrow and whatever stopped it — it doubles as the slide distance
 * for `slide-and-stop` and as the travel distance for the exit animation.
 */
export interface RayResult {
  readonly blockerIndex: number;
  readonly freeCells: number;
  /** Last empty cell on the ray, or `EMPTY` if the arrow is already hard against something. */
  readonly lastFreeCell: CellIndex;
}

/**
 * Walk straight ahead from an arrow until the board edge or another arrow.
 *
 * The one place path logic lives. Both rule variants, deadlock detection, the
 * solver, and the hint system all bottom out here, so there is exactly one
 * definition of "blocked" in the codebase.
 */
export function castRay(board: Board, state: BoardState, arrowIndex: number): RayResult {
  const arrow = board.arrows[arrowIndex]!;
  const from = state.positions[arrowIndex]!;
  const { cols, rows } = board;

  let r = rowOf(from, cols) + arrow.dr;
  let c = colOf(from, cols) + arrow.dc;
  let freeCells = 0;
  let lastFreeCell: CellIndex = EMPTY;

  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    const cell = r * cols + c;
    const occupant = state.occupancy[cell]!;
    if (occupant !== EMPTY) {
      return { blockerIndex: occupant, freeCells, lastFreeCell };
    }
    freeCells += 1;
    lastFreeCell = cell;
    r += arrow.dr;
    c += arrow.dc;
  }

  return { blockerIndex: EMPTY, freeCells, lastFreeCell };
}

/**
 * Reject a level that could never be played, with a human-readable reason.
 *
 * Runs before every board build so a hand-edited or mis-generated JSON file
 * surfaces as a clear message rather than an out-of-bounds read at runtime.
 */
function validateLevel(level: LevelDefinition): Result<true> {
  const { rows, cols, arrows } = level;

  if (!Number.isInteger(rows) || rows <= 0) return err(`rows must be a positive integer, got ${rows}`);
  if (!Number.isInteger(cols) || cols <= 0) return err(`cols must be a positive integer, got ${cols}`);
  if (arrows.length === 0) return err('level has no arrows');

  const seenIds = new Set<string>();
  const seenCells = new Set<number>();

  for (const a of arrows) {
    if (!a.id) return err('every arrow needs a non-empty id');
    if (seenIds.has(a.id)) return err(`duplicate arrow id "${a.id}"`);
    seenIds.add(a.id);

    if (!Number.isInteger(a.row) || a.row < 0 || a.row >= rows) {
      return err(`arrow "${a.id}" has row ${a.row}, outside 0..${rows - 1}`);
    }
    if (!Number.isInteger(a.col) || a.col < 0 || a.col >= cols) {
      return err(`arrow "${a.id}" has col ${a.col}, outside 0..${cols - 1}`);
    }
    if (!isDirection(a.dir)) return err(`arrow "${a.id}" has invalid dir "${a.dir}"`);

    const cell = toCell(a.row, a.col, cols);
    if (seenCells.has(cell)) return err(`two arrows share cell (${a.row}, ${a.col})`);
    seenCells.add(cell);
  }

  return ok(true);
}

/** A validated level, ready to play: immutable topology plus starting positions. */
export interface BuiltLevel {
  readonly board: Board;
  readonly initial: BoardState;
}

/**
 * Build a playable board from level data.
 *
 * Returns a `Result` rather than throwing so a corrupt level file degrades into
 * an error message on screen instead of a crash (TDD §14).
 */
export function buildLevel(level: LevelDefinition): Result<BuiltLevel> {
  const validation = validateLevel(level);
  if (!validation.ok) return err(`level ${level.id}: ${validation.error}`);

  const { rows, cols } = level;
  const arrows: Arrow[] = level.arrows.map((spec: ArrowSpec) => {
    const [dr, dc] = DELTAS[spec.dir];
    return { id: spec.id, dir: spec.dir, startCell: toCell(spec.row, spec.col, cols), dr, dc };
  });

  const board: Board = {
    rows,
    cols,
    cellCount: rows * cols,
    variant: level.variant ?? 'escape-only',
    arrows,
  };

  return ok({ board, initial: createInitialState(board) });
}

/**
 * Put every arrow back on its starting cell.
 *
 * Used both for the first render and for Restart, which is why it derives from
 * `Arrow.startCell` rather than re-reading the level JSON.
 */
export function createInitialState(board: Board): BoardState {
  const positions = new Int32Array(board.arrows.length);
  const occupancy = new Int32Array(board.cellCount).fill(EMPTY);

  board.arrows.forEach((arrow, index) => {
    positions[index] = arrow.startCell;
    occupancy[arrow.startCell] = index;
  });

  return { positions, occupancy, remaining: board.arrows.length };
}

/** Copy a state so callers can treat every `BoardState` as frozen. */
export function cloneState(state: BoardState): BoardState {
  return {
    positions: Int32Array.from(state.positions),
    occupancy: Int32Array.from(state.occupancy),
    remaining: state.remaining,
  };
}

/**
 * Stable string key for a state, used to memoise the `slide-and-stop` search.
 *
 * Only positions matter — occupancy is derived from them, so including it would
 * just make the key longer for no extra discrimination.
 */
export function stateKey(state: BoardState): string {
  return state.positions.join(',');
}

/** Look up an arrow's index by its authored id, or `-1`. Used at the UI boundary. */
export function indexOfArrow(board: Board, id: string): number {
  return board.arrows.findIndex((a) => a.id === id);
}

/** Cell an arrow currently sits on, or `ESCAPED`. Convenience for the renderer. */
export function positionOf(state: BoardState, arrowIndex: number): CellIndex {
  return state.positions[arrowIndex] ?? ESCAPED;
}
