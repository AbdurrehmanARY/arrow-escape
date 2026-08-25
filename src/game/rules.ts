/**
 * rules.ts — what a tap does, and whether the level is over.
 *
 * Purpose:      The rule set itself. Given a board and a tap, produce an outcome;
 *               given a session, say whether it is won, failed, or still in play.
 * Responsibilities:
 *               - `resolveTap`   — the rules.
 *               - `applyOutcome` — the only function that advances board state.
 *               - `tapArrow`     — the same, plus hearts, for a live session.
 *               - `legalMoves` / `getStatus` — win and failure detection.
 * Notes:        Pure and total. Every function here is a plain data transform, so
 *               the entire rule set is unit-testable with no renderer, and the
 *               off-device level validator runs the exact same code the phone
 *               runs. That shared-code property is the point of the domain layer.
 */

import { castRay, isAlive } from './board';
import {
  type Board,
  type BoardState,
  DEFAULT_HEARTS,
  EMPTY,
  type GameStatus,
  type MoveOutcome,
  NO_GROUP,
  type PlaySession,
} from './types';

/**
 * Decide what happens when the player taps an arrow.
 *
 * Deliberately free of side effects: it reports what *would* happen. The caller
 * decides whether to commit it, which lets the solver look one move ahead cheaply
 * and lets the view start an animation before the state changes.
 */
export function resolveTap(board: Board, state: BoardState, arrowIndex: number): MoveOutcome {
  if (arrowIndex < 0 || arrowIndex >= board.arrows.length) {
    return { kind: 'invalid', reason: 'unknown-arrow' };
  }
  if (!isAlive(state, arrowIndex)) {
    return { kind: 'invalid', reason: 'already-escaped' };
  }

  const arrow = board.arrows[arrowIndex]!;
  const ray = castRay(board, state, arrowIndex);

  if (ray.blockedBy === 'nothing') {
    return {
      kind: 'escaped',
      arrowIndex,
      headCell: arrow.body[0]!,
      // `+1` because the head must travel one cell past the last board cell to
      // be visually clear of the board.
      exitDistance: ray.freeCells + 1,
      bodyLength: arrow.body.length,
      group: arrow.group,
    };
  }

  return {
    kind: 'blocked',
    arrowIndex,
    blockerIndex: ray.blockerArrow,
    blockerKind: ray.blockedBy,
    blockedAt: ray.blockedAt,
    freeCells: ray.freeCells,
  };
}

/**
 * Commit an outcome, returning a new board state.
 *
 * Never mutates its argument — the reducer relies on identity changes to know
 * when to re-render, and the solver relies on being able to hold a parent state
 * while exploring a child.
 *
 * A `blocked` or `invalid` outcome returns the *same object*, so callers can use
 * `next === prev` as a cheap "nothing changed" test.
 */
export function applyOutcome(state: BoardState, outcome: MoveOutcome): BoardState {
  if (outcome.kind !== 'escaped') return state;

  const alive = Uint8Array.from(state.alive);
  const occupancy = Int32Array.from(state.occupancy);
  const groupsLeft = Int32Array.from(state.groupsLeft);

  alive[outcome.arrowIndex] = 0;
  // Free every cell the snake occupied. It threads out along the trail its own
  // head clears, so the whole body leaves in one move or none of it does.
  for (let cell = 0; cell < occupancy.length; cell += 1) {
    if (occupancy[cell] === outcome.arrowIndex) occupancy[cell] = EMPTY;
  }

  if (outcome.group !== NO_GROUP) {
    groupsLeft[outcome.group] = (groupsLeft[outcome.group] ?? 0) - 1;
  }

  return { alive, occupancy, remaining: state.remaining - 1, groupsLeft };
}

/** The board is empty — the player has won. */
export function isCleared(state: BoardState): boolean {
  return state.remaining === 0;
}

/**
 * Every arrow that can leave right now.
 *
 * Under this rule set "legal" and "clears the board" are the same thing: a tap
 * either removes an arrow or costs a heart and changes nothing.
 */
export function legalMoves(board: Board, state: BoardState): number[] {
  const moves: number[] = [];
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (!isAlive(state, i)) continue;
    if (castRay(board, state, i).blockedBy === 'nothing') moves.push(i);
  }
  return moves;
}

/** Cheaper `legalMoves(...).length > 0` for the common "is anything playable" check. */
export function hasLegalMove(board: Board, state: BoardState): boolean {
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (!isAlive(state, i)) continue;
    if (castRay(board, state, i).blockedBy === 'nothing') return true;
  }
  return false;
}

/** Every arrow that is currently stuck. Tapping any of these costs a heart. */
export function blockedArrows(board: Board, state: BoardState): number[] {
  const blocked: number[] = [];
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (!isAlive(state, i)) continue;
    if (castRay(board, state, i).blockedBy !== 'nothing') blocked.push(i);
  }
  return blocked;
}

// ---------------------------------------------------------------------------
// Sessions — the board plus the player's hearts
// ---------------------------------------------------------------------------

/** Start a level. Hearts come from the level, falling back to the standard five. */
export function startSession(state: BoardState, hearts: number = DEFAULT_HEARTS): PlaySession {
  const maxHearts = Math.max(1, Math.floor(hearts));
  return {
    state,
    heartsLeft: maxHearts,
    maxHearts,
    status: isCleared(state) ? 'won' : 'playing',
    mistakes: 0,
    chargedArrows: new Set(),
  };
}

/**
 * Tap an arrow in a live session: resolve it, move the board, and charge a heart
 * if the tap was a mistake.
 *
 * Returns the outcome alongside the new session so the view can animate the
 * specific thing that happened — thread the snake out, or flash it red — without
 * re-deriving it from a state diff.
 *
 * Note what this means for the shape of the game: **wrong taps, not wrong plans,
 * are the failure mode.** A blocked tap never changes the board, so it can never
 * make the level unwinnable; it only costs a heart. The skill being tested is
 * reading the tangle correctly, not ordering moves.
 *
 * A heart is charged **per arrow, not per tap** — see `PlaySession.chargedArrows`.
 * The first time an arrow turns out to be stuck it costs one; after that it is
 * free to tap forever, while every other arrow is still unpaid. A repeat tap
 * still returns a `blocked` outcome, so the view shakes it and marks it exactly
 * as before: the player is told the same thing, they are simply not billed twice
 * for it.
 */
export function tapArrow(
  board: Board,
  session: PlaySession,
  arrowIndex: number,
): { readonly session: PlaySession; readonly outcome: MoveOutcome } {
  if (session.status !== 'playing') {
    return { session, outcome: { kind: 'invalid', reason: 'already-escaped' } };
  }

  const outcome = resolveTap(board, session.state, arrowIndex);

  if (outcome.kind === 'invalid') return { session, outcome };

  if (outcome.kind === 'blocked') {
    // Already paid for. The outcome still comes back so the view shakes the arrow
    // and keeps its mark; the session is returned *by identity*, matching the
    // `next === prev` convention `applyOutcome` sets for "nothing changed".
    if (session.chargedArrows.has(arrowIndex)) return { session, outcome };

    const heartsLeft = session.heartsLeft - 1;
    const chargedArrows = new Set(session.chargedArrows);
    chargedArrows.add(arrowIndex);

    return {
      outcome,
      session: {
        ...session,
        heartsLeft,
        mistakes: session.mistakes + 1,
        status: heartsLeft <= 0 ? 'failed' : 'playing',
        chargedArrows,
      },
    };
  }

  const state = applyOutcome(session.state, outcome);
  return { outcome, session: { ...session, state, status: statusAfter(board, state) } };
}

/**
 * The status a session lands in once a move has been committed.
 *
 * The `stuck` branch only ever fires on a board carrying a `shuts` gate, and the
 * `hasShutters` test is what keeps it free everywhere else: on every other board
 * the arrow that just left cannot have blocked anything, so re-scanning for a
 * legal move would be work with a known answer.
 *
 * Note what this detects and what it does not. "No arrow can be tapped" is exact
 * and cheap. "Arrows can still be tapped, but the level is already lost" needs the
 * solver, which `rules.ts` deliberately cannot import — that check lives in
 * `isDoomed` and is called by the screen, which can see both modules.
 */
function statusAfter(_board: Board, state: BoardState): GameStatus {
  if (isCleared(state)) return 'won';
  return 'playing';
}

/**
 * Won, failed, stuck, or still playing.
 *
 * On a board with no `shuts` gate, `stuck` is unreachable — a tap only ever
 * removes an arrow, removing an arrow can never block another one, so a board that
 * starts solvable stays solvable no matter what the player taps, and running out
 * of hearts is the only way to lose. A shutter is the single mechanic that breaks
 * that, which is why it is the only thing that can produce `stuck`.
 * See `docs/MECHANIC_ANALYSIS.md`.
 */
export function getStatus(session: PlaySession): GameStatus {
  return session.status;
}

/**
 * Is this board finishable at all, ignoring hearts?
 *
 * Used by the level validator. A board fails this only if some arrows form a
 * cycle of mutual blocking, which the level pipeline must never ship.
 */
export function isBoardStuck(board: Board, state: BoardState): boolean {
  return !isCleared(state) && !hasLegalMove(board, state);
}
