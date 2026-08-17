/**
 * types.ts — the vocabulary of the ArrowPath rules engine.
 *
 * Purpose:      Every type the domain layer speaks in. Nothing else in `game/`
 *               declares a shared shape; they all import from here.
 * Responsibilities:
 *               - Level data as authored on disk (`LevelDefinition`).
 *               - Runtime board topology (`Board`) vs. play state (`BoardState`).
 *               - A level in progress including hearts (`PlaySession`).
 *               - The outcome of a single tap (`MoveOutcome`).
 * Notes:        Pure TypeScript. No React, no I/O, no imports. This file is
 *               shared verbatim between the app and the off-device level
 *               tooling in `tools/`, so it must never reach for a platform API.
 *
 *               An arrow is a *snake*, not a single cell: a connected chain of
 *               cells with an arrowhead at one end. That is the whole source of
 *               difficulty in this game — the bodies tangle, so working out
 *               which head belongs to which tail, and whether that head has a
 *               clear run to the edge, is genuinely hard by eye.
 */

/** The four directions an arrowhead can point. Diagonals are deliberately absent. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Stable identifier for an arrow, unique within a level. */
export type ArrowId = string;

/** Sentinel for an arrow that belongs to no colour group. */
export const NO_GROUP = -1;

/**
 * How a gate cell reacts to its colour group leaving the board.
 *
 * This one word is the difference between two different games, so it is worth
 * stating plainly:
 *
 * - `opens` — the cell blocks rays **until** every arrow of its group has gone.
 *   Clearing arrows only ever opens gates, so the board still gets strictly
 *   easier with every tap. Order still cannot lose the level; what a gate buys is
 *   *depth* — a whole region stays shut until you find and clear the key colour.
 *
 * - `shuts` — the inverse. The cell is passable **while** its group is still on
 *   the board and seals permanently once the last of that colour leaves. This is
 *   the mechanic that makes tap order matter: clear the red arrows too early and
 *   the shutter closes on something that still needed to get out. Deadlock is
 *   real on these boards, and `isBoardStuck` is no longer merely theoretical.
 *
 * See `docs/MECHANIC_ANALYSIS.md` — the "what would change this" section named
 * exactly this and `mechanic-invariants.test.ts` pins both behaviours.
 */
export type GateMode = 'opens' | 'shuts';

/**
 * A run of cells whose passability is tied to a colour group.
 *
 * Authored as a group of cells rather than one cell per entry because gates are
 * almost always a wall segment, and repeating the group name and mode per cell
 * would triple the size of the level files for nothing.
 */
export interface GateSpec {
  /** `[row, col]` pairs. Loose arrays for the same reason as `ArrowSpec.body`. */
  readonly cells: readonly (readonly number[])[];
  /** Which colour group controls it. Must match an arrow group used in the level. */
  readonly group: string;
  readonly mode: GateMode;
}

/**
 * A cell index: `row * cols + col`.
 *
 * Exists because the hot path (walking a head's ray and testing occupancy) runs
 * many thousands of times per level inside the solver. A single integer key into
 * a flat typed array is dramatically faster than allocating `{row, col}` pairs.
 */
export type CellIndex = number;

/** Sentinel stored in `BoardState.occupancy` for a cell no arrow sits on. */
export const EMPTY = -1;

/** An arrow as authored in level JSON. */
export interface ArrowSpec {
  readonly id: ArrowId;
  /**
   * The arrow's cells as `[row, col]` pairs, **head first**. Consecutive entries
   * must be orthogonally adjacent — the body is a connected, non-self-touching
   * path.
   *
   * Typed as a loose array rather than a `[number, number]` tuple because these
   * arrive from `import`ed JSON, which TypeScript always widens to `number[][]`.
   * Insisting on the tuple here would only force an unchecked cast at every level
   * file. The pair-ness is enforced where it can actually be trusted — at build
   * time in `resolveArrow`, which sees the real runtime value.
   */
  readonly body: readonly (readonly number[])[];
  /**
   * Which way the arrowhead points.
   *
   * Optional, and normally omitted: for a body of two or more cells the direction
   * is *inferred* from the last segment, because an arrowhead always continues
   * the line it is drawn on. Only a single-cell arrow needs it stated. When it is
   * supplied alongside a longer body it is validated against the geometry, which
   * catches hand-editing mistakes in level files.
   */
  readonly dir?: Direction;
  /**
   * Colour group this arrow belongs to, if any.
   *
   * Groups exist to drive gates: a gate names a group, and its state depends on
   * whether that group is still on the board. They are rendered as a colour,
   * which is the only reason the player can reason about them at all — but note
   * that colouring arrows *reduces* tracing difficulty, so a level should only
   * spend colours where a gate makes them earn their keep.
   */
  readonly group?: string;
}

/**
 * A level exactly as it is stored in `src/data/levels/NNN.json`.
 *
 * Levels are data, not code: adding levels must never require an app change.
 */
export interface LevelDefinition {
  readonly id: number;
  readonly name: string;
  readonly rows: number;
  readonly cols: number;
  /** Which shape mask the generator used ('heart', 'diamond', …). Descriptive only. */
  readonly layout: string;
  /** Curated difficulty band, 1–5. Assigned by a human, informed by metrics. */
  readonly difficulty: number;
  /** Wrong taps the player may make before the level fails. Defaults to 5. */
  readonly hearts?: number;
  readonly arrows: readonly ArrowSpec[];
  /**
   * Permanently impassable cells, as `[row, col]` pairs.
   *
   * Walls never change, so they are pure geometry: they carve the board into
   * corridors and force heads to line up with the gaps. An arrow whose head-ray
   * meets a wall can never leave, which makes the board unsolvable — the
   * validator rejects that rather than shipping it.
   */
  readonly walls?: readonly (readonly number[])[];
  /** Cells whose passability is tied to a colour group. See `GateSpec`. */
  readonly gates?: readonly GateSpec[];
  /** Canonical winning tap order, written by the validator. Verified in CI. */
  readonly solution?: readonly ArrowId[];
}

/** Per-arrow data that never changes while a level is being played. */
export interface Arrow {
  readonly id: ArrowId;
  /** Direction the head points, and therefore the direction the arrow exits. */
  readonly dir: Direction;
  /** Cells occupied, head first. `body[0]` is the arrowhead. */
  readonly body: readonly CellIndex[];
  /** Row delta of `dir`, precomputed to keep the ray walk branch-free. */
  readonly dr: number;
  /** Column delta of `dir`. */
  readonly dc: number;
  /** Index into `Board.groups`, or `NO_GROUP`. Integer so the hot path stays flat. */
  readonly group: number;
}

/**
 * The static half of a level in play: geometry and arrow identity.
 *
 * Split from `BoardState` so the solver can explore many states while allocating
 * nothing but a small typed array per state.
 */
export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly cellCount: number;
  /** Indexed by arrow index. Index — not id — is the currency inside the engine. */
  readonly arrows: readonly Arrow[];

  /** `CellIndex` → 1 if permanently impassable. Never changes during play. */
  readonly walls: Uint8Array;
  /** `CellIndex` → controlling group index, or `NO_GROUP` if the cell is not a gate. */
  readonly gateGroup: Int32Array;
  /** `CellIndex` → 1 if the gate `opens` when its group clears, 0 if it `shuts`. */
  readonly gateOpens: Uint8Array;
  /** Colour group names, in the order arrows and gates reference them. */
  readonly groups: readonly string[];

  /**
   * True if any gate on this board `shuts`.
   *
   * Read as "does tap order matter here". The solver branches on it: without
   * shutters the board is a DAG that Kahn's algorithm peels in microseconds, and
   * with them it is a genuine search. Precomputed so the hot path never has to
   * scan for it. See `GateMode`.
   */
  readonly hasShutters: boolean;
  /** True if the board has any wall or gate at all. Lets the ray walk skip a check. */
  readonly hasObstacles: boolean;
}

/**
 * The mutable half: which arrows are still on the board.
 *
 * An arrow is either fully present or fully gone — there is no partial state,
 * because a tap either clears the whole snake or changes nothing at all.
 *
 * Treated as immutable by every exported function: `applyOutcome` returns a new
 * state and never edits the one it was given. (TypeScript cannot mark typed-array
 * elements `readonly`, so this is a convention the tests enforce rather than
 * something the compiler proves.)
 */
export interface BoardState {
  /** arrow index → 1 if still on the board, 0 if it has escaped. */
  readonly alive: Uint8Array;
  /** `CellIndex` → arrow index, or `EMPTY`. Kept in sync with `alive`. */
  readonly occupancy: Int32Array;
  /** How many arrows are still on the board. Cheap win check. */
  readonly remaining: number;
  /**
   * Group index → how many of its arrows are still on the board.
   *
   * Derived data, but stored rather than recomputed because `castRay` consults it
   * once per gate cell it crosses and is the hottest function in the codebase.
   */
  readonly groupsLeft: Int32Array;
}

/**
 * What happened when the player tapped an arrow.
 *
 * A discriminated union rather than a boolean because the view reacts very
 * differently to each case: thread the snake off the board, or flash it red and
 * dock a heart.
 */
export type MoveOutcome =
  | {
      /** The head's ray was clear — the whole snake threads out and is gone. */
      readonly kind: 'escaped';
      readonly arrowIndex: number;
      readonly headCell: CellIndex;
      /** Cells from the head to just past the edge. Drives the exit animation. */
      readonly exitDistance: number;
      /** Body length, so the view knows how long the tail takes to follow. */
      readonly bodyLength: number;
      /**
       * The escaping arrow's colour group, or `NO_GROUP`.
       *
       * Carried on the outcome rather than looked up from the board so that
       * `applyOutcome` stays a function of `(state, outcome)` alone. It is the one
       * piece of arrow identity the state transition needs, and threading the
       * whole board through every call site to fetch a single integer would be a
       * poor trade.
       */
      readonly group: number;
    }
  | {
      /** Something stands in the head's way. Costs a heart; the board is unchanged. */
      readonly kind: 'blocked';
      readonly arrowIndex: number;
      /** The arrow in the way, or `EMPTY` when a wall or a closed gate stopped it. */
      readonly blockerIndex: number;
      /**
       * What stopped it. The view says something different for each: another snake
       * pulses orange, a wall shudders, a gate shows the colour that would open it.
       * Telling the player *why* is the whole difference between a fair heart and a
       * baffling one.
       */
      readonly blockerKind: 'arrow' | 'wall' | 'gate';
      /** Controlling group of the gate that stopped it, or `NO_GROUP`. */
      readonly blockerGroup: number;
      /** Where the collision happens — the view flashes this cell. */
      readonly blockedAt: CellIndex;
    }
  | {
      /** The tap was not a legal request (bad index, or already gone). */
      readonly kind: 'invalid';
      readonly reason: 'unknown-arrow' | 'already-escaped';
    };

/**
 * How a level in progress can end.
 *
 * `stuck` is only reachable on a board carrying a `shuts` gate. Everywhere else
 * the board is monotone — a tap only ever removes an arrow, and removing an arrow
 * can only free cells — so a level that started solvable stays solvable however
 * badly it is played, and hearts are the only way to lose. A shutter breaks that,
 * on purpose, which is why it gets its own status rather than being folded into
 * `failed`: the player needs to be told the board is unwinnable and offered a
 * restart, not shown a heart they did not spend.
 */
export type GameStatus = 'playing' | 'won' | 'failed' | 'stuck';

/**
 * A level in progress: the board plus the player's remaining hearts.
 *
 * Hearts live here rather than in `BoardState` because they are a property of
 * *this attempt*, not of the board. The solver and the level validator reason
 * about boards and must never see or care about lives.
 */
export interface PlaySession {
  readonly state: BoardState;
  readonly heartsLeft: number;
  readonly maxHearts: number;
  readonly status: GameStatus;
  /** Wrong taps so far. Drives the "how hard was this for you" curation signal. */
  readonly mistakes: number;
  /**
   * Arrows that have already cost a heart this attempt.
   *
   * An arrow is charged **once**. Tap it while it is stuck and you pay; tap the
   * same stuck arrow again and you pay nothing, because you have already been
   * told what it costs. Every *other* arrow is still on its first strike, so the
   * price of a genuinely new misread is unchanged.
   *
   * The reason is that a blocked tap never changes the board, so a player probing
   * the same tangle twice — or double-delivering a gesture the UI guard missed —
   * was being charged twice for one piece of information. Hearts now measure how
   * many distinct arrows you misread, which is the thing the level is actually
   * testing.
   *
   * It follows that failure needs `maxHearts` **distinct** wrong arrows, not
   * `maxHearts` wrong taps: the board is more forgiving than it was, deliberately.
   * It also bounds the set at `maxHearts` entries, which is what keeps a plain
   * `Set` affordable on a two-hundred-arrow board.
   *
   * Lives on the session rather than in `BoardState` for the same reason hearts
   * do: it is a property of this attempt, and the solver must never see it.
   */
  readonly chargedArrows: ReadonlySet<number>;
}

/** Default hearts per level, matching the reference game's five. */
export const DEFAULT_HEARTS = 5;

/**
 * Success-or-explanation return type.
 *
 * The TDD requires domain functions to be total: invalid input comes back as a
 * typed value, never a thrown exception, so a malformed level file can never
 * crash gameplay.
 */
export type Result<T, E = string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Build a successful `Result`. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Build a failed `Result`. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
