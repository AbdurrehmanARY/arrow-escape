/**
 * types.ts — the vocabulary of the ArrowPath rules engine.
 *
 * Purpose:      Every type the domain layer speaks in. Nothing else in `game/`
 *               declares a shared shape; they all import from here.
 * Responsibilities:
 *               - Level data as authored on disk (`LevelDefinition`).
 *               - Runtime board topology (`Board`) vs. mutable play state
 *                 (`BoardState`) — deliberately separate, see below.
 *               - The outcome of a single tap (`MoveOutcome`).
 * Notes:        Pure TypeScript. No React, no I/O, no imports. This file is
 *               shared verbatim between the app and the off-device level
 *               tooling in `tools/`, so it must never reach for a platform API.
 */

/** The four directions an arrow can point. Diagonals are deliberately absent. */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Stable identifier for an arrow, unique within a level. */
export type ArrowId = string;

/**
 * A cell index: `row * cols + col`.
 *
 * Exists because the hot path (walking an arrow's ray and testing occupancy) runs
 * millions of times inside the solver. A single integer key into a flat typed
 * array is dramatically faster than allocating `{row, col}` pairs per step.
 */
export type CellIndex = number;

/** Sentinel stored in `BoardState.positions` for an arrow that has left the board. */
export const ESCAPED = -1;

/** Sentinel stored in `BoardState.occupancy` for a cell with no arrow on it. */
export const EMPTY = -1;

/**
 * Which rule set a level is played under.
 *
 * - `escape-only`  — the rule as written in the GDD. A tapped arrow flies off if
 *   its path is clear; if anything blocks it, *nothing happens at all*.
 * - `slide-and-stop` — a blocked arrow slides as far as it can and stops just
 *   short of the blocker, taking up a new cell and blocking different arrows.
 *
 * This is a variant rather than a hardcoded rule because the two produce very
 * different games, and which one ArrowPath ships is still an open design
 * decision. See `docs/MECHANIC_ANALYSIS.md` — under `escape-only`, removing an
 * arrow can never block another arrow, so tap order provably cannot matter.
 */
export type RuleVariant = 'escape-only' | 'slide-and-stop';

/** An arrow as authored in level JSON. */
export interface ArrowSpec {
  readonly id: ArrowId;
  readonly row: number;
  readonly col: number;
  readonly dir: Direction;
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
  /** Which shape mask the generator used. Purely descriptive/visual. */
  readonly layout: string;
  /** Curated difficulty band, 1–5. Assigned by a human, informed by metrics. */
  readonly difficulty: number;
  /** Defaults to `escape-only` when absent, matching the original GDD rule. */
  readonly variant?: RuleVariant;
  readonly arrows: readonly ArrowSpec[];
  /** Canonical winning tap order, written by the validator. Verified in CI. */
  readonly solution?: readonly ArrowId[];
}

/** Per-arrow data that never changes while a level is being played. */
export interface Arrow {
  readonly id: ArrowId;
  readonly dir: Direction;
  /** Where this arrow starts. Restart returns every arrow here. */
  readonly startCell: CellIndex;
  /** Row delta of `dir`, precomputed to keep the ray walk branch-free. */
  readonly dr: number;
  /** Column delta of `dir`. */
  readonly dc: number;
}

/**
 * The static half of a level in play: geometry, rule variant, and arrow identity.
 *
 * Split from `BoardState` so the solver can explore thousands of states while
 * allocating nothing but a small position array per state.
 */
export interface Board {
  readonly rows: number;
  readonly cols: number;
  readonly cellCount: number;
  readonly variant: RuleVariant;
  /** Indexed by arrow index. Index — not id — is the currency inside the engine. */
  readonly arrows: readonly Arrow[];
}

/**
 * The mutable half: where every arrow currently is.
 *
 * Treated as immutable by every exported function — `applyOutcome` returns a new
 * state and never edits the one it was given. (The typed arrays cannot be marked
 * `readonly` at the element level in TypeScript, so this is a convention the
 * tests enforce rather than something the compiler can prove.) The solver has an
 * internal mutable fast path that never escapes its own module.
 */
export interface BoardState {
  /** arrow index → `CellIndex`, or `ESCAPED`. */
  readonly positions: Int32Array;
  /** `CellIndex` → arrow index, or `EMPTY`. Kept in sync with `positions`. */
  readonly occupancy: Int32Array;
  /** How many arrows are still on the board. Cheap win check. */
  readonly remaining: number;
}

/**
 * What happened when the player tapped an arrow.
 *
 * A discriminated union rather than a boolean because the view needs to react
 * differently to each case: fly off, slide to a new cell, or shake in place.
 */
export type MoveOutcome =
  | {
      /** Path was clear — the arrow leaves the board and is gone for good. */
      readonly kind: 'escaped';
      readonly arrowIndex: number;
      readonly from: CellIndex;
      /** Cells travelled to fully clear the board. Drives the exit animation. */
      readonly distance: number;
    }
  | {
      /** `slide-and-stop` only: moved forward but stopped short of a blocker. */
      readonly kind: 'moved';
      readonly arrowIndex: number;
      readonly from: CellIndex;
      readonly to: CellIndex;
      readonly distance: number;
      readonly blockerIndex: number;
    }
  | {
      /** Could not move at all. The view shakes the arrow; state is unchanged. */
      readonly kind: 'blocked';
      readonly arrowIndex: number;
      readonly blockerIndex: number;
    }
  | {
      /** The tap was not a legal request (bad index, or already gone). */
      readonly kind: 'invalid';
      readonly reason: 'unknown-arrow' | 'already-escaped';
    };

/** High-level state of a level in progress, derived from `BoardState`. */
export type GameStatus = 'playing' | 'won' | 'deadlocked';

/**
 * Success-or-explanation return type.
 *
 * The TDD requires domain functions to be total: invalid input comes back as a
 * typed value, never a thrown exception, so a malformed level file can never
 * crash gameplay.
 */
export type Result<T, E = string> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Build a successful `Result`. */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Build a failed `Result`. */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
