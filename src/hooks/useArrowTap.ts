/**
 * hooks/useArrowTap.ts — what a finger does to the board.
 *
 * Purpose:      Own every callback the board's gestures call, and the feedback
 *               that follows the tap they resolved.
 * Responsibilities:
 *               - Reject a repeat of the same arrow inside one animation frame.
 *               - Dispatch `tap` and `departed`.
 *               - Say what happened: pickup, empty tap, release, collision.
 *               - Turn `lastOutcome` into sound and haptics, and clear the blocked
 *                 highlight after it has been seen.
 * Notes:        **Callback identity reaches a live gesture object.** A callback
 *               rebuilt on every render has to be re-attached by gesture-handler
 *               mid-interaction, which is its own source of dropped touches — so
 *               everything returned here is wrapped in `useCallback` and depends
 *               on as little as it can. Extracted verbatim from
 *               `app/play/[id].tsx`; no logic changed when it moved.
 */

import { useCallback, useEffect, useRef, type Dispatch } from 'react';
import * as Haptics from 'expo-haptics';

import { playSfx, stopSfx } from '@services/audio';
import { triggerCollisionHaptic } from '@services/haptics';
import type { BuiltLevel, Result } from '@game';
import type { GameAction, GameState } from '@state';

/** Everything `useArrowTap` needs to answer a touch. */
export interface UseArrowTapArgs {
  /** The built level; a tap on an unbuilt board does nothing at all. */
  readonly built: Result<BuiltLevel> | undefined;
  /** The live reducer state — the feedback effect reads `taps` and `lastOutcome`. */
  readonly state: GameState;
  readonly dispatch: Dispatch<GameAction>;
  /** Whether to feel the tap as well as hear it. */
  readonly haptics: boolean;
  /**
   * Wipes the hint highlight, because tapping an arrow abandons the hint that was
   * pointing at a different one. Injected rather than owned: the hint state lives
   * in `useHintFlow`, and two owners for one value is how they drift apart.
   */
  readonly resetHint: () => void;
}

/** The board's tap surface, ready to hand to `SkiaBoard`. */
export interface ArrowTap {
  readonly onTapArrow: (index: number) => void;
  readonly onPressArrow: () => void;
  readonly onTapEmpty: () => void;
  readonly onDepartComplete: (arrowIndex: number) => void;
  readonly onCollisionHit: () => void;
}

export function useArrowTap({
  built,
  state,
  dispatch,
  haptics,
  resetHint,
}: UseArrowTapArgs): ArrowTap {
  /**
   * Rejects a repeat of the *same* arrow within one animation frame or two.
   *
   * Narrower than it used to be, and deliberately so. The old guard rejected any
   * tap within 120ms of any other, which stopped duplicate delivery and also
   * stopped a player tapping two different arrows in quick succession — the exact
   * complaint that "I have to tap more than once". Duplicate delivery is no longer
   * possible now that the board uses a single gesture-handler tap rather than
   * `Pressable`s nested inside a `GestureDetector`, so all this needs to catch is a
   * genuine double-fire on one arrow.
   */
  const lastTap = useRef<{ index: number; at: number }>({ index: -1, at: 0 });

  /**
   * Stable across renders, deliberately.
   *
   * Every arrow on the board receives this, and `ArrowSnake` is memoised. An inline
   * arrow function here would be a fresh identity on every render of this screen,
   * which defeats that memo for every snake — ninety needless re-renders per tap on
   * the largest boards, and nothing anywhere would report it.
   */
  const onDepartComplete = useCallback(
    (arrowIndex: number) => {
      stopSfx('arrowRelease');
      dispatch({ type: 'departed', arrowIndex });
    },
    [dispatch],
  );

  /**
   * A finger landing on an arrow, answered before the tap resolves.
   *
   * The pickup and the outcome are two different events and want two different
   * sounds: this one confirms *which* arrow is under the thumb, and `arrowRelease`
   * or `collision` says what happened to it. On a dense board that confirmation is
   * the difference between a mis-tap the player can correct and one they cannot.
   */
  const onPressArrow = useCallback(() => playSfx('arrowPickup'), []);

  /**
   * A completed tap that hit nothing.
   *
   * Distinct from `collision`, and deliberately so — this costs no heart and did
   * not touch the puzzle. It says "that was not on an arrow", which is a different
   * thing from "that arrow cannot leave".
   */
  const onTapEmpty = useCallback(() => playSfx('wrongMove'), []);

  /**
   * Tapping an arrow: reset the hint, then dispatch, and nothing else.
   *
   * Stable across renders, and that matters more than it looks. This reaches the
   * board's tap gesture, and a gesture object rebuilt on every tap has to be
   * re-attached by gesture-handler mid-interaction — its own source of dropped
   * touches. So it depends on the level, not on the board state.
   *
   * Sound and haptics are *not* fired here. They used to be, which forced this
   * callback to read the live board so it could ask `resolveTap` what had
   * happened. The reducer already records that as `lastOutcome`, so the feedback
   * is driven from there instead — see the effect below.
   */
  const onTapArrow = useCallback(
    (index: number) => {
      if (!built?.ok) return;

      const now = Date.now();
      if (lastTap.current.index === index && now - lastTap.current.at < 120) return;
      lastTap.current = { index, at: now };

      resetHint();
      dispatch({ type: 'tap', board: built.value.board, arrowIndex: index });
    },
    [built, resetHint, dispatch],
  );

  const onCollisionHit = useCallback(() => {
    playSfx('collision');
    triggerCollisionHaptic(haptics);
  }, [haptics]);

  /**
   * Sound and haptics for whatever the last tap did.
   *
   * Keyed on the tap counter rather than on the outcome, because two identical
   * blocked taps in a row produce equal outcomes and must still both be felt.
   * The `taps === 0` guard is what stops it firing on mount and on restart, which
   * would read as phantom noise.
   */
  useEffect(() => {
    if (state.taps === 0) return;
    const outcome = state.lastOutcome;
    if (outcome?.kind === 'blocked') {
      if (state.lastHeartDeducted) {
        playSfx('heartLost');
        if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      const clearTimer = setTimeout(() => {
        dispatch({ type: 'clearHighlight' });
      }, 260);
      return () => clearTimeout(clearTimer);
    } else if (outcome?.kind === 'escaped') {
      playSfx('arrowRelease');
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // `lastOutcome` is deliberately absent: the tap counter is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.taps, haptics]);

  return { onTapArrow, onPressArrow, onTapEmpty, onDepartComplete, onCollisionHit };
}

