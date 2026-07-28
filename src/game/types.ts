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
   * The arrow's cells, **head first**. Consecutive entries must be orthogonally
   * adjacent — the body is a connected, non-self-touching path.
   */
  readonly body: readonly (readonly [row: number, col: number])[];
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
    }
  | {
      /** Something stands in the head's way. Costs a heart; the board is unchanged. */
      readonly kind: 'blocked';
      readonly arrowIndex: number;
      readonly blockerIndex: number;
      /** Where the collision happens — the view flashes this cell. */
      readonly blockedAt: CellIndex;
    }
  | {
      /** The tap was not a legal request (bad index, or already gone). */
      readonly kind: 'invalid';
      readonly reason: 'unknown-arrow' | 'already-escaped';
    };

/** How a level in progress can end. */
export type GameStatus = 'playing' | 'won' | 'failed';

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
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Build a successful `Result`. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Build a failed `Result`. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
