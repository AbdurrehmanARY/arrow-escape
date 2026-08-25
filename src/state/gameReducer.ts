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
  readonly freeCells?: number | undefined;
  /** Bumped on every failed tap so the view can re-trigger an identical shake. */
  readonly nonce: number;
}

export interface GameState {
  readonly session: PlaySession;
  readonly departing: readonly number[];
  readonly highlight: BlockHighlight | undefined;
  readonly blockedArrows: readonly number[];
  readonly blockerArrows: readonly number[];
  readonly lastOutcome: MoveOutcome | undefined;
  readonly lastHeartDeducted: boolean;
  readonly taps: number;
}

/** Append `value` if it is not already present. Keeps the marks a set in spirit. */
function withValue(list: readonly number[], value: number): readonly number[] {
  return list.includes(value) ? list : [...list, value];
}

export type GameAction =
  | { readonly type: 'tap'; readonly board: Board; readonly arrowIndex: number }
  /** One arrow's release animation finished; it can stop being tracked. */
  | { readonly type: 'departed'; readonly arrowIndex: number }
  /** The failed-tap flash has run its course. */
  | { readonly type: 'clearHighlight' }
  | { readonly type: 'restart'; readonly initial: BoardState; readonly hearts: number }
  | { readonly type: 'addHearts'; readonly count: number };

/** Fresh state for a level, used both on entry and on Restart. */
export function initGameState(initial: BoardState, hearts: number): GameState {
  return {
    session: startSession(initial, hearts),
    departing: [],
    highlight: undefined,
    blockedArrows: [],
    blockerArrows: [],
    lastOutcome: undefined,
    lastHeartDeducted: false,
    taps: 0,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'restart':
      return initGameState(action.initial, action.hearts);

    case 'addHearts': {
      const newHearts = state.session.heartsLeft + action.count;
      return {
        ...state,
        session: {
          ...state.session,
          heartsLeft: newHearts,
          status: newHearts > 0 && state.session.state.remaining > 0 ? 'playing' : state.session.status,
        },
      };
    }

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

      if (outcome.kind === 'blocked') {
        const heartDeducted = session.heartsLeft < state.session.heartsLeft;
        return {
          ...state,
          session,
          lastOutcome: outcome,
          lastHeartDeducted: heartDeducted,
          taps: state.taps + 1,
          // The standing marks. Deliberately never cleared by a later tap — only a
          // restart wipes them, because they describe what happened in *this*
          // attempt and the attempt is what ends.
          blockedArrows: withValue(state.blockedArrows, arrowIndex),
          blockerArrows: withValue(state.blockerArrows, outcome.blockerIndex),
          highlight: {
            blocked: arrowIndex,
            blocker: outcome.blockerIndex,
            ...(outcome.freeCells !== undefined ? { freeCells: outcome.freeCells } : {}),
            nonce: (state.highlight?.nonce ?? 0) + 1,
          },
        };
      }

      return {
        ...state,
        session,
        lastOutcome: outcome,
        lastHeartDeducted: false,
        taps: state.taps + 1,
        departing: [...state.departing, arrowIndex],
        highlight: undefined,
      };
    }

    default:
      return state;
  }
}
