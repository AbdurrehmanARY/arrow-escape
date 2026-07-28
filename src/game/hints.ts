/**
 * hints.ts — "which arrow should I tap next?"
 *
 * Purpose:      Back the Hint button with an arrow that is genuinely free, so
 *               following a hint can never cost the player a heart.
 * Responsibilities:
 *               - `findSafeMove`     — the next arrow to tap.
 *               - `findAllSafeMoves` — every free arrow, for an assist mode.
 * Notes:        Runs on-device. The whole hint system is a thin wrapper over the
 *               solver, which is why hints work fully offline with no server and
 *               no precomputed hint data shipped alongside the level.
 *
 *               A hint here is worth real money to the player — hints are earned
 *               by watching a rewarded ad — so "the hint cost me a heart" is a
 *               failure mode worth ruling out structurally rather than testing
 *               for. Every hint is the opening move of a proven winning line.
 */

import { isCleared, legalMoves } from './rules';
import { solve } from './solver';
import type { ArrowId, Board, BoardState } from './types';

/** What the Hint button gets back. */
export type HintResult =
  | { readonly kind: 'move'; readonly arrowIndex: number; readonly arrowId: ArrowId }
  | { readonly kind: 'already-won' }
  | { readonly kind: 'no-safe-move'; readonly reason: string };

/**
 * The next arrow to tap, guaranteed free.
 *
 * Implemented as "take the first step of a winning line" rather than as a
 * separate heuristic. That is the strongest guarantee available and it is free:
 * if the solver can finish from here, its opening move is by construction an
 * arrow with a clear run to the edge.
 */
export function findSafeMove(board: Board, state: BoardState): HintResult {
  if (isCleared(state)) return { kind: 'already-won' };

  const outcome = solve(board, state);

  if (outcome.kind === 'solved') {
    const arrowIndex = outcome.solution[0];
    if (arrowIndex === undefined) return { kind: 'already-won' };
    return { kind: 'move', arrowIndex, arrowId: board.arrows[arrowIndex]!.id };
  }

  return {
    kind: 'no-safe-move',
    reason: 'No arrow on this board can reach the edge. Restart to try again.',
  };
}

/**
 * Every arrow that can be tapped right now without costing a heart.
 *
 * Powers an optional assist mode (highlight all playable arrows) and the "show
 * safe" toggle on the debug screen.
 *
 * Note this is exactly `legalMoves` whenever the board is winnable at all — no
 * per-move solvability check is needed, because removing an arrow can never block
 * another one, so no free arrow can ever be the wrong choice. The only case that
 * needs care is a board already past saving, where nothing should be called safe.
 */
export function findAllSafeMoves(board: Board, state: BoardState): number[] {
  if (isCleared(state)) return [];
  const candidates = legalMoves(board, state);
  return solve(board, state).kind === 'solved' ? candidates : [];
}
