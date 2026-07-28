/**
 * hints.ts — "which arrow should I tap next?"
 *
 * Purpose:      Back the Hint button with an answer that is provably safe: a move
 *               that keeps the level winnable, never one that quietly ruins it.
 * Responsibilities:
 *               - `findSafeMove`     — the next arrow to tap.
 *               - `findAllSafeMoves` — every currently-safe arrow, for an assist
 *                 / accessibility "show me what's tappable" mode.
 * Notes:        Runs on-device. The whole hint system is a thin wrapper over the
 *               solver, which is why hints work fully offline with no server and
 *               no precomputed hint data shipped alongside the level.
 */

import { applyOutcome, isCleared, legalMoves, resolveTap } from './rules';
import { isSolvable, solve, type SolveOptions } from './solver';
import type { ArrowId, Board, BoardState } from './types';

/** What the Hint button gets back. */
export type HintResult =
  | { readonly kind: 'move'; readonly arrowIndex: number; readonly arrowId: ArrowId }
  | { readonly kind: 'already-won' }
  | { readonly kind: 'no-safe-move'; readonly reason: string };

/**
 * The next arrow to tap, guaranteed not to lose the level.
 *
 * Implemented as "take the first step of a winning line" rather than as a
 * separate heuristic. That is the strongest guarantee available and it is free:
 * if the solver can finish from here, its opening move is safe by construction.
 * A bespoke heuristic could only ever be an approximation of this.
 */
export function findSafeMove(
  board: Board,
  state: BoardState,
  options: SolveOptions = {},
): HintResult {
  if (isCleared(state)) return { kind: 'already-won' };

  const outcome = solve(board, state, options);

  if (outcome.kind === 'solved') {
    const arrowIndex = outcome.solution[0];
    if (arrowIndex === undefined) return { kind: 'already-won' };
    return { kind: 'move', arrowIndex, arrowId: board.arrows[arrowIndex]!.id };
  }

  if (outcome.kind === 'exhausted') {
    return {
      kind: 'no-safe-move',
      reason: 'This board is too tangled to analyse quickly. Restart to try again.',
    };
  }

  return {
    kind: 'no-safe-move',
    reason: 'No move can finish this board from here. Restart to try again.',
  };
}

/**
 * Every arrow that can be tapped right now without losing the level.
 *
 * Powers an optional assist mode (highlight all playable arrows) and is what the
 * test suite uses to check the central claim about `escape-only`: there, this
 * returns *every* legal move, because no legal move can ever be a mistake. Under
 * `slide-and-stop` it is a strict subset whenever the board contains a trap.
 */
export function findAllSafeMoves(
  board: Board,
  state: BoardState,
  options: SolveOptions = {},
): number[] {
  if (isCleared(state)) return [];

  const candidates = legalMoves(board, state);

  // Under `escape-only`, "legal" and "safe" are the same set — but only once the
  // board is known to be winnable at all. A board can be past saving (two arrows
  // locked head-on in a corner) while other arrows are still happily tappable;
  // calling those "safe" would be a lie. So: one solvability check for the whole
  // board, then no per-move check, which is the real saving on device.
  if (board.variant === 'escape-only') {
    return isSolvable(board, state, options) ? candidates : [];
  }

  return candidates.filter((move) =>
    isSolvable(board, applyOutcome(state, resolveTap(board, state, move)), options),
  );
}
