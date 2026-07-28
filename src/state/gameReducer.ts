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
  /** The arrow currently animating off the board, if any. */
  readonly departing: number | undefined;
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
  /** The release animation finished; the arrow can stop being tracked. */
  | { readonly type: 'departed' }
  /** The failed-tap flash has run its course. */
  | { readonly type: 'clearHighlight' }
  | { readonly type: 'restart'; readonly initial: BoardState; readonly hearts: number };

const OPENING_MESSAGE = 'Find a head with a clear run to the edge.';

/** Fresh state for a level, used both on entry and on Restart. */
export function initGameState(initial: BoardState, hearts: number): GameState {
  return {
    session: startSession(initial, hearts),
    departing: undefined,
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

    case 'departed':
      return state.departing === undefined ? state : { ...state, departing: undefined };

    case 'clearHighlight':
      return state.highlight === undefined ? state : { ...state, highlight: undefined };

    case 'tap': {
      const { board, arrowIndex } = action;

      // Ignore taps while an arrow is mid-flight. Without this, a fast double-tap
      // can start a second release before the first has left, and the board
      // appears to skip an animation.
      if (state.departing !== undefined) return state;

      const { session, outcome } = tapArrow(board, state.session, arrowIndex);
      if (outcome.kind === 'invalid') return state;

      const id = board.arrows[arrowIndex]?.id ?? '?';

      if (outcome.kind === 'blocked') {
        const blocker = board.arrows[outcome.blockerIndex]?.id ?? '?';
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
          message:
            session.status === 'failed'
              ? 'Out of hearts.'
              : `Blocked by "${blocker}" — that cost a heart.`,
        };
      }

      return {
        ...state,
        session,
        lastOutcome: outcome,
        taps: state.taps + 1,
        departing: arrowIndex,
        highlight: undefined,
        message:
          session.status === 'won'
            ? 'Board clear.'
            : `"${id}" had a clear run.`,
      };
    }

    default:
      return state;
  }
}
