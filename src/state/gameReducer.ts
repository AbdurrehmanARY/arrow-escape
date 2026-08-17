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
  /**
   * Every arrow that has been blocked this attempt, and everything that blocked
   * one — kept for the rest of the level rather than cleared on the next tap.
   *
   * `highlight` above is the *momentary* record: it drives the shake and it is
   * replaced by the next failed tap. These two are the *standing* one, and they
   * exist because a collision is a fact the player needs to keep. A flash that
   * has already faded cannot be re-read, so a player who looks away mid-animation
   * has lost the only feedback the game gave them about a pair they misjudged.
   *
   * It cannot grow without bound: a heart is charged the first time each arrow is
   * found stuck (`PlaySession.chargedArrows`), so five *distinct* blocked arrows
   * is exactly what ends the level and `blockedArrows` therefore tops out at five.
   * Repeat taps on an already-marked arrow add nothing to either list. That is
   * what makes "until the level ends" affordable — on a fifty-arrow board it is
   * ten arrows at the very worst.
   *
   * An arrow can appear in both, and legitimately does: the thing that blocked you
   * once may be the thing you misjudge next.
   */
  readonly blockedArrows: readonly number[];
  readonly blockerArrows: readonly number[];
  /** The most recent outcome, so the view can react without diffing state. */
  readonly lastOutcome: MoveOutcome | undefined;
  /** Taps made this attempt, including failed ones. Feeds the level summary. */
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
  | { readonly type: 'restart'; readonly initial: BoardState; readonly hearts: number };

/** Fresh state for a level, used both on entry and on Restart. */
export function initGameState(initial: BoardState, hearts: number): GameState {
  return {
    session: startSession(initial, hearts),
    departing: [],
    highlight: undefined,
    blockedArrows: [],
    blockerArrows: [],
    lastOutcome: undefined,
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

      if (outcome.kind === 'blocked') {
        return {
          ...state,
          session,
          lastOutcome: outcome,
          taps: state.taps + 1,
          // The standing marks. Deliberately never cleared by a later tap — only a
          // restart wipes them, because they describe what happened in *this*
          // attempt and the attempt is what ends.
          blockedArrows: withValue(state.blockedArrows, arrowIndex),
          blockerArrows: withValue(state.blockerArrows, outcome.blockerIndex),
          highlight: {
            blocked: arrowIndex,
            blocker: outcome.blockerIndex,
            nonce: (state.highlight?.nonce ?? 0) + 1,
          },
        };
      }

      return {
        ...state,
        session,
        lastOutcome: outcome,
        taps: state.taps + 1,
        departing: [...state.departing, arrowIndex],
        highlight: undefined,
      };
    }

    default:
      return state;
  }
}
