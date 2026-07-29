/**
 * board.ts — geometry, board construction, and the ray walk.
 *
 * Purpose:      Turn authored level data into a runtime `Board`, and answer the
 *               one question the whole game rests on: "does this arrowhead have
 *               a clear run to the edge?"
 * Responsibilities:
 *               - Cell index <-> row/col conversion.
 *               - Validating arrow bodies and building a `Board` + `BoardState`.
 *               - `castRay`, the single place that walks a head's path.
 * Notes:        Pure. `castRay` is the hottest function in the codebase, so it
 *               allocates nothing and reads a flat `Int32Array`.
 *
 *               Only the *head's* ray matters. The body threads out along the
 *               trail the head has already cleared, so the cells it currently
 *               occupies are by definition available to it.
 */

import {
  type Arrow,
  type ArrowSpec,
  type Board,
  type BoardState,
  type CellIndex,
  type Direction,
  EMPTY,
  err,
  type LevelDefinition,
  NO_GROUP,
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

/** The direction you travel to get from `from` to the adjacent cell `to`. */
export function directionBetween(
  from: CellIndex,
  to: CellIndex,
  cols: number,
): Direction | undefined {
  const dr = rowOf(to, cols) - rowOf(from, cols);
  const dc = colOf(to, cols) - colOf(from, cols);
  if (dr === -1 && dc === 0) return 'up';
  if (dr === 1 && dc === 0) return 'down';
  if (dr === 0 && dc === -1) return 'left';
  if (dr === 0 && dc === 1) return 'right';
  return undefined;
}

/**
 * What an arrowhead's forward ray runs into.
 *
 * `blockedBy: 'nothing'` is the "this arrow can leave" case, and it is the only
 * one callers should treat as free. It is a discriminator rather than the old
 * `blockerIndex === EMPTY` test because three different things can now stop a
 * ray, and only one of them is an arrow — a wall and a closed gate both stop it
 * while leaving no arrow index to report.
 */
export interface RayResult {
  readonly blockedBy: 'nothing' | 'arrow' | 'wall' | 'gate';
  /** The arrow standing in the way, or `EMPTY` for every other case. */
  readonly blockerArrow: number;
  /** Controlling group of the gate that stopped it, or `NO_GROUP`. */
  readonly blockerGroup: number;
  /** Empty cells between the head and whatever stopped it. */
  readonly freeCells: number;
  /** Cell where the ray was stopped, or `EMPTY` if it reached the edge. */
  readonly blockedAt: CellIndex;
}

/** Shared "the ray got all the way out" result. Frozen — it is returned constantly. */
const CLEAR_RAY: RayResult = Object.freeze({
  blockedBy: 'nothing' as const,
  blockerArrow: EMPTY,
  blockerGroup: NO_GROUP,
  freeCells: 0,
  blockedAt: EMPTY,
});

/**
 * Is this gate cell currently passable?
 *
 * The whole of the gate mechanic is these two lines. An `opens` gate is shut
 * until its colour has left; a `shuts` gate is the exact inverse and seals once
 * the colour is gone. Exported because the renderer needs the same answer to
 * decide whether to draw a cell solid or ghosted, and two implementations of this
 * would eventually disagree.
 */
export function isGateOpen(board: Board, state: BoardState, cell: CellIndex): boolean {
  const group = board.gateGroup[cell]!;
  if (group === NO_GROUP) return true;
  const cleared = state.groupsLeft[group] === 0;
  return board.gateOpens[cell] === 1 ? cleared : !cleared;
}

/**
 * Walk straight ahead from an arrow's head until the board edge or another arrow.
 *
 * The one place path logic lives. The rules, deadlock detection, the solver, and
 * the hint system all bottom out here, so there is exactly one definition of
 * "blocked" in the codebase.
 *
 * An arrow can never block itself: the only cells ahead of the head belong to
 * other arrows, because a body is a simple path that does not double back.
 *
 * Walls and gates are checked behind `hasObstacles` so a board that has neither —
 * which is every level shipped before Phase 15 — walks exactly the loop it always
 * did, with one predictable branch added.
 */
export function castRay(board: Board, state: BoardState, arrowIndex: number): RayResult {
  const arrow = board.arrows[arrowIndex]!;
  const head = arrow.body[0]!;
  const { cols, rows } = board;

  let r = rowOf(head, cols) + arrow.dr;
  let c = colOf(head, cols) + arrow.dc;
  let freeCells = 0;

  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    const cell = r * cols + c;
    const occupant = state.occupancy[cell]!;
    if (occupant !== EMPTY && occupant !== arrowIndex) {
      return {
        blockedBy: 'arrow',
        blockerArrow: occupant,
        blockerGroup: NO_GROUP,
        freeCells,
        blockedAt: cell,
      };
    }
    if (board.hasObstacles) {
      if (board.walls[cell] === 1) {
        return {
          blockedBy: 'wall',
          blockerArrow: EMPTY,
          blockerGroup: NO_GROUP,
          freeCells,
          blockedAt: cell,
        };
      }
      const group = board.gateGroup[cell]!;
      if (group !== NO_GROUP && !isGateOpen(board, state, cell)) {
        return {
          blockedBy: 'gate',
          blockerArrow: EMPTY,
          blockerGroup: group,
          freeCells,
          blockedAt: cell,
        };
      }
    }
    freeCells += 1;
    r += arrow.dr;
    c += arrow.dc;
  }

  return { ...CLEAR_RAY, freeCells };
}

/** Cells the head crosses on its way off the board, nearest first. */
export function exitPath(board: Board, arrowIndex: number): CellIndex[] {
  const arrow = board.arrows[arrowIndex]!;
  const head = arrow.body[0]!;
  const path: CellIndex[] = [];

  let r = rowOf(head, board.cols) + arrow.dr;
  let c = colOf(head, board.cols) + arrow.dc;
  while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
    path.push(r * board.cols + c);
    r += arrow.dr;
    c += arrow.dc;
  }
  return path;
}

/**
 * Resolve one authored arrow into runtime form, or explain why it is invalid.
 *
 * Direction is inferred from the last segment (`body[1] -> body[0]`) because an
 * arrowhead always continues the line it is drawn on. A stated `dir` is checked
 * against that geometry rather than trusted, which catches the most likely
 * hand-editing mistake: moving a head without updating its direction.
 */
function resolveArrow(
  spec: ArrowSpec,
  rows: number,
  cols: number,
  claimedCells: Map<number, string>,
  group: number,
): Result<Arrow> {
  if (!spec.id) return err('every arrow needs a non-empty id');
  if (!Array.isArray(spec.body) || spec.body.length === 0) {
    return err(`arrow "${spec.id}" has an empty body`);
  }

  const body: CellIndex[] = [];
  const seenWithinArrow = new Set<number>();

  for (const point of spec.body) {
    if (!Array.isArray(point) || point.length !== 2) {
      return err(`arrow "${spec.id}" has a malformed body cell`);
    }
    // Read the pair explicitly rather than destructuring: the element type is a
    // loose array (see `ArrowSpec.body`), so this is the point where its shape is
    // actually established.
    const row = point[0];
    const col = point[1];
    if (typeof row !== 'number' || typeof col !== 'number') {
      return err(`arrow "${spec.id}" has a non-numeric body cell`);
    }
    if (!Number.isInteger(row) || row < 0 || row >= rows) {
      return err(`arrow "${spec.id}" has row ${row}, outside 0..${rows - 1}`);
    }
    if (!Number.isInteger(col) || col < 0 || col >= cols) {
      return err(`arrow "${spec.id}" has col ${col}, outside 0..${cols - 1}`);
    }

    const cell = toCell(row, col, cols);
    if (seenWithinArrow.has(cell)) {
      return err(`arrow "${spec.id}" visits cell (${row}, ${col}) twice`);
    }
    const owner = claimedCells.get(cell);
    if (owner !== undefined) {
      return err(`arrows "${owner}" and "${spec.id}" both occupy cell (${row}, ${col})`);
    }

    seenWithinArrow.add(cell);
    body.push(cell);
  }

  // The body must be a connected chain — otherwise it is not one snake.
  for (let i = 1; i < body.length; i += 1) {
    if (directionBetween(body[i - 1]!, body[i]!, cols) === undefined) {
      return err(
        `arrow "${spec.id}" is not connected between cells ${i - 1} and ${i} — ` +
          'body cells must be orthogonally adjacent, head first',
      );
    }
  }

  let dir: Direction;
  if (body.length === 1) {
    if (!isDirection(spec.dir)) {
      return err(`arrow "${spec.id}" is a single cell, so it must state a "dir"`);
    }
    dir = spec.dir;
  } else {
    // Head continues away from its neck: neck -> head, extended.
    const inferred = directionBetween(body[1]!, body[0]!, cols);
    if (inferred === undefined) return err(`arrow "${spec.id}" has a detached head`);
    if (spec.dir !== undefined && spec.dir !== inferred) {
      return err(
        `arrow "${spec.id}" declares dir "${spec.dir}" but its head points "${inferred}" — ` +
          'the arrowhead must continue the line it is drawn on',
      );
    }
    dir = inferred;
  }

  for (const cell of body) claimedCells.set(cell, spec.id);

  const [dr, dc] = DELTAS[dir];
  return ok({ id: spec.id, dir, body, dr, dc, group });
}

/** A validated level, ready to play: immutable topology plus starting occupancy. */
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
  const { rows, cols } = level;

  if (!Number.isInteger(rows) || rows <= 0) {
    return err(`level ${level.id}: rows must be a positive integer, got ${rows}`);
  }
  if (!Number.isInteger(cols) || cols <= 0) {
    return err(`level ${level.id}: cols must be a positive integer, got ${cols}`);
  }
  if (level.arrows.length === 0) return err(`level ${level.id}: no arrows`);

  const claimedCells = new Map<number, string>();
  const seenIds = new Set<string>();
  const arrows: Arrow[] = [];

  // Group names are interned to indices here and nowhere else, so an arrow and a
  // gate that spell the same colour always land on the same integer.
  const groups: string[] = [];
  const groupIndex = (name: string): number => {
    const existing = groups.indexOf(name);
    if (existing !== -1) return existing;
    groups.push(name);
    return groups.length - 1;
  };

  for (const spec of level.arrows) {
    if (seenIds.has(spec.id)) return err(`level ${level.id}: duplicate arrow id "${spec.id}"`);
    seenIds.add(spec.id);

    const group = spec.group === undefined ? NO_GROUP : groupIndex(spec.group);
    const resolved = resolveArrow(spec, rows, cols, claimedCells, group);
    if (!resolved.ok) return err(`level ${level.id}: ${resolved.error}`);
    arrows.push(resolved.value);
  }

  const cellCount = rows * cols;
  const walls = new Uint8Array(cellCount);
  const gateGroup = new Int32Array(cellCount).fill(NO_GROUP);
  const gateOpens = new Uint8Array(cellCount);
  let hasShutters = false;

  for (const point of level.walls ?? []) {
    const cell = readCell(point, rows, cols);
    if (!cell.ok) return err(`level ${level.id}: wall ${cell.error}`);
    const owner = claimedCells.get(cell.value);
    if (owner !== undefined) {
      return err(`level ${level.id}: a wall sits on arrow "${owner}"`);
    }
    walls[cell.value] = 1;
  }

  for (const gate of level.gates ?? []) {
    if (!gate.group) return err(`level ${level.id}: a gate has no group`);
    if (gate.mode !== 'opens' && gate.mode !== 'shuts') {
      return err(`level ${level.id}: gate "${gate.group}" has unknown mode "${gate.mode}"`);
    }
    // A gate keyed to a colour no arrow wears can never change state, which is
    // always an authoring mistake — it is either a wall written the long way or a
    // typo in the colour name.
    if (!groups.includes(gate.group)) {
      return err(
        `level ${level.id}: gate "${gate.group}" names a group no arrow belongs to — ` +
          'it could never open or shut',
      );
    }
    const group = groupIndex(gate.group);
    if (gate.mode === 'shuts') hasShutters = true;

    for (const point of gate.cells) {
      const cell = readCell(point, rows, cols);
      if (!cell.ok) return err(`level ${level.id}: gate "${gate.group}" ${cell.error}`);
      const owner = claimedCells.get(cell.value);
      if (owner !== undefined) {
        return err(`level ${level.id}: gate "${gate.group}" sits on arrow "${owner}"`);
      }
      if (walls[cell.value] === 1) {
        return err(`level ${level.id}: gate "${gate.group}" sits on a wall`);
      }
      if (gateGroup[cell.value] !== NO_GROUP) {
        return err(`level ${level.id}: two gates share a cell`);
      }
      gateGroup[cell.value] = group;
      gateOpens[cell.value] = gate.mode === 'opens' ? 1 : 0;
    }
  }

  const board: Board = {
    rows,
    cols,
    cellCount,
    arrows,
    walls,
    gateGroup,
    gateOpens,
    groups,
    hasShutters,
    hasObstacles: (level.walls?.length ?? 0) > 0 || (level.gates?.length ?? 0) > 0,
  };
  return ok({ board, initial: createInitialState(board) });
}

/** Validate one authored `[row, col]` pair and pack it. Shared by walls and gates. */
function readCell(point: readonly number[], rows: number, cols: number): Result<CellIndex, string> {
  if (!Array.isArray(point) || point.length !== 2) return err('cell is malformed');
  const row = point[0];
  const col = point[1];
  if (typeof row !== 'number' || typeof col !== 'number') return err('cell is non-numeric');
  if (!Number.isInteger(row) || row < 0 || row >= rows) return err(`row ${row} is off-board`);
  if (!Number.isInteger(col) || col < 0 || col >= cols) return err(`col ${col} is off-board`);
  return ok(toCell(row, col, cols));
}

/**
 * Put every arrow back on the board.
 *
 * Used both for the first render and for Restart, which is why it derives from
 * `Arrow.body` rather than re-reading the level JSON.
 */
export function createInitialState(board: Board): BoardState {
  const alive = new Uint8Array(board.arrows.length).fill(1);
  const occupancy = new Int32Array(board.cellCount).fill(EMPTY);
  const groupsLeft = new Int32Array(board.groups.length);

  board.arrows.forEach((arrow, index) => {
    for (const cell of arrow.body) occupancy[cell] = index;
    if (arrow.group !== NO_GROUP) groupsLeft[arrow.group] = (groupsLeft[arrow.group] ?? 0) + 1;
  });

  return { alive, occupancy, remaining: board.arrows.length, groupsLeft };
}

/**
 * A board with nothing on it.
 *
 * Exists for the screen's "the level failed to load" path, which still has to hand
 * the reducer a well-formed state before it can render an error. Building one by
 * hand at the call site means a new `BoardState` field silently gets left off.
 */
export function emptyBoardState(): BoardState {
  return {
    alive: new Uint8Array(),
    occupancy: new Int32Array(),
    remaining: 0,
    groupsLeft: new Int32Array(),
  };
}

/** Copy a state so callers can treat every `BoardState` as frozen. */
export function cloneState(state: BoardState): BoardState {
  return {
    alive: Uint8Array.from(state.alive),
    occupancy: Int32Array.from(state.occupancy),
    remaining: state.remaining,
    groupsLeft: Int32Array.from(state.groupsLeft),
  };
}

/** Is this arrow still on the board? */
export function isAlive(state: BoardState, arrowIndex: number): boolean {
  return state.alive[arrowIndex] === 1;
}

/** Stable string key for a state. Used to memoise searches over board states. */
export function stateKey(state: BoardState): string {
  return state.alive.join('');
}

/** Look up an arrow's index by its authored id, or `-1`. Used at the UI boundary. */
export function indexOfArrow(board: Board, id: string): number {
  return board.arrows.findIndex((a) => a.id === id);
}
