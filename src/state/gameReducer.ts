/**
 * gameReducer.ts — the live board state machine.
 *
 * Purpose:      Sequence one level: taps, hearts, the transient highlight after a
 *               failed tap, and the win/fail transitions.
 * Responsibilities:
 *               - `gameReducer` and its action type.
 *               - `initGameState` for starting and restarting.
 * Notes:        Deliberately a reducer rather than a Zustand store. A level in
 *               progress is ephemeral — it dies when the player leaves — and it
 *               is a genuine state machine, so keeping it local means no other
 *               screen can accidentally read or corrupt a half-finished board
 *               (TDD §7).
 *
 *               All the *rules* live in `game/`. This file only decides what the
 *               view needs to know and when, which is why it is small.
 */

import {
  type Board,
  type BoardState,
  type MoveOutcome,
  type PlaySession,
  startSession,
  tapArrow,
} from '@game';

/** What the board should be flashing right now, after a failed tap. */
export interface BlockHighlight {
  readonly blocked: number;
  readonly blocker: number;
  /** Bumped on every failed tap so the view can re-trigger an identical shake. */
  readonly nonce: number;
}

export interface GameState {
  readonly session: PlaySession;
  /**
   * Arrows currently animating off the board.
   *
   * A list, and taps are *not* blocked while it is non-empty. It used to be a
   * single slot with the reducer ignoring any tap that arrived mid-flight, which
   * was defensible when the exit took 340ms and became indefensible once it was
   * slowed down deliberately — a player tapping at a normal pace would have every
   * second tap silently dropped.
   *
   * Nothing is at risk in allowing them: `applyOutcome` has already removed the
   * departing arrow from the board state, so the next tap resolves against a board
   * that is correct *now*. The animation is presentation catching up, not state.
   */
  readonly departing: readonly number[];
  readonly highlight: BlockHighlight | undefined;
  /** The most recent outcome, so the view can react without diffing state. */
  readonly lastOutcome: MoveOutcome | undefined;
  /** Player-facing explanation of what just happened. */
  readonly message: string;
  /** Taps made this attempt, including failed ones. Feeds the level summary. */
  readonly taps: number;
}

export type GameAction =
  | { readonly type: 'tap'; readonly board: Board; readonly arrowIndex: number }
  /** One arrow's release animation finished; it can stop being tracked. */
  | { readonly type: 'departed'; readonly arrowIndex: number }
  /** The failed-tap flash has run its course. */
  | { readonly type: 'clearHighlight' }
  | { readonly type: 'restart'; readonly initial: BoardState; readonly hearts: number };

const OPENING_MESSAGE = 'Find a head with a clear run to the edge.';

/** Fresh state for a level, used both on entry and on Restart. */
export function initGameState(initial: BoardState, hearts: number): GameState {
  return {
    session: startSession(initial, hearts),
    departing: [],
    highlight: undefined,
    lastOutcome: undefined,
    message: OPENING_MESSAGE,
    taps: 0,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'restart':
      return initGameState(action.initial, action.hearts);

    case 'departed': {
      if (!state.departing.includes(action.arrowIndex)) return state;
      return {
        ...state,
        departing: state.departing.filter((index) => index !== action.arrowIndex),
      };
    }

    case 'clearHighlight':
      return state.highlight === undefined ? state : { ...state, highlight: undefined };

    case 'tap': {
      const { board, arrowIndex } = action;

      // Deliberately no "ignore taps while an arrow is mid-flight" guard. See
      // `GameState.departing` — it dropped taps a player had genuinely made, and
      // the state it was protecting was never at risk.
      const { session, outcome } = tapArrow(board, state.session, arrowIndex);
      if (outcome.kind === 'invalid') return state;

      const id = board.arrows[arrowIndex]?.id ?? '?';

      if (outcome.kind === 'blocked') {
        return {
          ...state,
          session,
          lastOutcome: outcome,
          taps: state.taps + 1,
          highlight: {
            blocked: arrowIndex,
            blocker: outcome.blockerIndex,
            nonce: (state.highlight?.nonce ?? 0) + 1,
          },
          message: session.status === 'failed' ? 'Out of hearts.' : blockedMessage(board, outcome),
        };
      }

      return {
        ...state,
        session,
        lastOutcome: outcome,
        taps: state.taps + 1,
        departing: [...state.departing, arrowIndex],
        highlight: undefined,
        message: session.status === 'won' ? 'Board clear.' : `"${id}" had a clear run.`,
      };
    }

    default:
      return state;
  }
}

/**
 * Say what stopped the arrow, in the player's terms.
 *
 * Three different things can block a ray now, and they call for three different
 * responses from the player — wait for another snake, give up on that arrow
 * entirely, or clear a colour first. A single generic message would charge a heart
 * and explain nothing, which is the version of this game nobody would keep
 * playing.
 */
function blockedMessage(board: Board, outcome: Extract<MoveOutcome, { kind: 'blocked' }>): string {
  if (outcome.blockerKind === 'wall') return 'That way is walled off — it cost a heart.';
  if (outcome.blockerKind === 'gate') {
    const group = board.groups[outcome.blockerGroup] ?? 'a colour';
    return `A ${group} gate is closed — that cost a heart.`;
  }
  const blocker = board.arrows[outcome.blockerIndex]?.id ?? '?';
  return `Blocked by "${blocker}" — that cost a heart.`;
}
