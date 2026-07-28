/**
 * rules.ts — what a tap does, and whether the level is over.
 *
 * Purpose:      The rule set itself. Given a board and a tap, produce an outcome;
 *               given a state, say whether it is won, lost, or still in play.
 * Responsibilities:
 *               - `resolveTap`  — the rules, per variant.
 *               - `applyOutcome` — the only function that advances state.
 *               - `legalMoves` / `getStatus` — win and deadlock detection.
 * Notes:        Pure and total. Every function here is a plain data transform, so
 *               the entire rule set is unit-testable with no renderer, and the
 *               off-device level validator runs the exact same code the phone
 *               runs. That shared-code property is the point of the domain layer.
 */

import { castRay } from './board';
import {
  type Board,
  type BoardState,
  EMPTY,
  ESCAPED,
  type GameStatus,
  type MoveOutcome,
} from './types';

/**
 * Decide what happens when the player taps an arrow.
 *
 * This function is deliberately free of side effects: it reports what *would*
 * happen. The caller decides whether to commit it (`applyOutcome`), which lets
 * the solver look one move ahead cheaply and lets the view start an animation
 * before the state changes.
 */
export function resolveTap(board: Board, state: BoardState, arrowIndex: number): MoveOutcome {
  if (arrowIndex < 0 || arrowIndex >= board.arrows.length) {
    return { kind: 'invalid', reason: 'unknown-arrow' };
  }

  const from = state.positions[arrowIndex]!;
  if (from === ESCAPED) {
    return { kind: 'invalid', reason: 'already-escaped' };
  }

  const ray = castRay(board, state, arrowIndex);

  // Nothing in the way all the way to the edge: the arrow leaves, under either
  // variant. `+1` because it must travel one cell past the last board cell to be
  // visually clear of the board.
  if (ray.blockerIndex === EMPTY) {
    return { kind: 'escaped', arrowIndex, from, distance: ray.freeCells + 1 };
  }

  // Something is in the way. What that means depends on the variant.
  if (board.variant === 'slide-and-stop' && ray.freeCells > 0) {
    return {
      kind: 'moved',
      arrowIndex,
      from,
      to: ray.lastFreeCell,
      distance: ray.freeCells,
      blockerIndex: ray.blockerIndex,
    };
  }

  return { kind: 'blocked', arrowIndex, blockerIndex: ray.blockerIndex };
}

/**
 * Commit an outcome, returning a new state.
 *
 * Never mutates its argument — the reducer relies on identity changes to know
 * when to re-render, and the solver relies on being able to hold a parent state
 * while exploring a child.
 *
 * A `blocked` or `invalid` outcome returns the *same object*, so callers can use
 * `next === prev` as a cheap "nothing changed" test.
 */
export function applyOutcome(state: BoardState, outcome: MoveOutcome): BoardState {
  if (outcome.kind === 'blocked' || outcome.kind === 'invalid') {
    return state;
  }

  const positions = Int32Array.from(state.positions);
  const occupancy = Int32Array.from(state.occupancy);

  if (outcome.kind === 'escaped') {
    positions[outcome.arrowIndex] = ESCAPED;
    occupancy[outcome.from] = EMPTY;
    return { positions, occupancy, remaining: state.remaining - 1 };
  }

  positions[outcome.arrowIndex] = outcome.to;
  occupancy[outcome.from] = EMPTY;
  occupancy[outcome.to] = outcome.arrowIndex;
  return { positions, occupancy, remaining: state.remaining };
}

/** Convenience: resolve and commit in one step. Returns both for the caller's UI. */
export function tap(
  board: Board,
  state: BoardState,
  arrowIndex: number,
): { readonly outcome: MoveOutcome; readonly next: BoardState } {
  const outcome = resolveTap(board, state, arrowIndex);
  return { outcome, next: applyOutcome(state, outcome) };
}

/** The board is empty — the player has won. */
export function isCleared(state: BoardState): boolean {
  return state.remaining === 0;
}

/**
 * Every arrow index whose tap would actually change the board.
 *
 * "Legal" means *productive*: an arrow that can only shake in place is not a
 * move. Under `escape-only` this is exactly the set of arrows that can escape;
 * under `slide-and-stop` it also includes arrows that can shuffle forward.
 */
export function legalMoves(board: Board, state: BoardState): number[] {
  const moves: number[] = [];
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (state.positions[i] === ESCAPED) continue;
    const ray = castRay(board, state, i);
    if (ray.blockerIndex === EMPTY) {
      moves.push(i);
    } else if (board.variant === 'slide-and-stop' && ray.freeCells > 0) {
      moves.push(i);
    }
  }
  return moves;
}

/** Cheaper `legalMoves(...).length > 0` for the common "is anything playable" check. */
export function hasLegalMove(board: Board, state: BoardState): boolean {
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (state.positions[i] === ESCAPED) continue;
    const ray = castRay(board, state, i);
    if (ray.blockerIndex === EMPTY) return true;
    if (board.variant === 'slide-and-stop' && ray.freeCells > 0) return true;
  }
  return false;
}

/**
 * Won, deadlocked, or still playing.
 *
 * Note what `deadlocked` means per variant, because it drives very different UX:
 * - `slide-and-stop`: the player made a real mistake and needs Restart.
 * - `escape-only`: this is *unreachable* mid-level. Because removing an arrow can
 *   never block another one, an arrow that is free stays free until it is tapped,
 *   so a board that starts solvable can never become stuck. Seeing this status
 *   under `escape-only` means the level data itself was unsolvable and should
 *   never have shipped — the level-integrity test exists to catch exactly that.
 */
export function getStatus(board: Board, state: BoardState): GameStatus {
  if (isCleared(state)) return 'won';
  return hasLegalMove(board, state) ? 'playing' : 'deadlocked';
}
