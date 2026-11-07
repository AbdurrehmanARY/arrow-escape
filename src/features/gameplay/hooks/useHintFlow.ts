/**
 * features/gameplay/hooks/useHintFlow.ts — the whole life of a hint.
 *
 * Purpose:      Own everything a hint is: spending one, earning one from a
 *               rewarded ad, pointing the camera at the answer, holding the
 *               highlight, and fading it out again.
 * Responsibilities:
 *               - `hintedArrow`, its fade state, and the notice line.
 *               - The two highlight timers and the pending-camera ref.
 *               - The camera focus a hint pans to.
 *               - The earn-a-hint ad flow, ad preloading, and the chime that says
 *                 an ad-funded hint has become available.
 *               - How many hints this session has spent.
 * Notes:        `spendHint` is called, never read from render: the value captured
 *               at render would still be zero inside the closure that runs after an
 *               ad, and the store is the only thing that can answer truthfully.
 *               Extracted verbatim from what is now
 *               `features/gameplay/screens/PlayScreen.tsx`; the timers, their
 *               durations and every dependency array are unchanged.
 */

import { Alert } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';

import { availability, isOnline, preload, showRewarded } from '@services/ads';
import { playSfx } from '@services/audio';
import { triggerHintHaptic } from '@services/haptics';
import {
  findSafeMove,
  type BoardState,
  type BuiltLevel,
  type GameStatus,
  type Result,
} from '@game';
import { useHintStore } from '@state';

/** How long a hint highlight stays visible before auto-fading, in ms. */
const HINT_DURATION_MS = 6000;
/** How long the hint glow fade-out takes, in ms. */
const HINT_FADE_MS = 500;

/** Everything `useHintFlow` needs to find and show an answer. */
export interface UseHintFlowArgs {
  readonly built: Result<BuiltLevel> | undefined;
  readonly status: GameStatus;
  /** The board the hint is searched on — `state.session.state`. */
  readonly boardState: BoardState;
  /** Cells of margin the theme draws around the board — `boardStyle.padCells`. */
  readonly padCells: number;
  /** Cell size of the current layout, which positions the camera focus. */
  readonly cellSize: number;
  /** Whether a hint should be felt as well as heard. */
  readonly haptics: boolean;
}

/** The hint's state, and the callbacks the screen hands to the HUD and the board. */
export interface HintFlow {
  /** The arrow currently highlighted, or `undefined` for none. */
  readonly hintedArrow: number | undefined;
  /** True while a rewarded ad for a hint is on screen. */
  readonly earning: boolean;
  /** Board-space point the camera should frame, and the nonce that fires it. */
  readonly focusX: number;
  readonly focusY: number;
  readonly focusNonce: number;
  /** Hints spent this session; read by the win effect when it records a result. */
  readonly hintsUsedRef: { current: number };
  readonly resetHint: () => void;
  readonly onCameraFocusComplete: () => void;
  readonly onHint: () => void;
  readonly onEarnHint: () => void;
}

export function useHintFlow({
  built,
  status,
  boardState,
  padCells,
  cellSize,
  haptics,
}: UseHintFlowArgs): HintFlow {
  const hintsAvailable = useHintStore((state) => state.available);
  const spendHint = useHintStore((state) => state.spendHint);
  const grantHints = useHintStore((state) => state.grantHints);

  const [hintedArrow, setHintedArrow] = useState<number | undefined>(undefined);
  // Kept for the fade *sequencing* — the timers below use it to hold the hint
  // visible, then clear `hintedArrow` once the glow has faded. The renderer no
  // longer needs to be told: under Skia the hinted arrow fades its own glow when it
  // stops being hinted, so nothing reads this value directly.
  const [_hintFading, setHintFading] = useState(false);
  /**
   * Why a hint could not be given, shown under the buttons.
   *
   * This was being *set* and never rendered, which meant tapping Hint with none
   * left did nothing visible at all — indistinguishable from a dead button. It is
   * on screen now, and `notify` is the only way it gets set, so a message can
   * never appear silently.
   */
  const [_hintNotice, setHintNotice] = useState<string | undefined>(undefined);
  const [earning, setEarning] = useState(false);
  /** Camera focus for hint navigation. */
  const [focusX, setFocusX] = useState(0);
  const [focusY, setFocusY] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  /** Timer ref for the hint auto-expire. */
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hints spent this session. Counted here because the store is global. */
  const hintsUsedRef = useRef(0);

  /**
   * Clear the hint outright.
   *
   * The two places that wipe it — a tap on another arrow, and a restart — wipe
   * exactly the same three values, so they share one function rather than being
   * free to grow apart.
   */
  const resetHint = useCallback(() => {
    setHintedArrow(undefined);
    setHintFading(false);
    setHintNotice(undefined);
  }, []);

  /**
   * Show a message, and make a sound saying one arrived.
   *
   * The pairing is the point: a notice that appears silently while the player is
   * looking at the board is a notice they will not see.
   */
  const notify = useCallback((message: string) => {
    setHintNotice(message);
    playSfx('notification');
  }, []);

  /**
   * Ref tracking which arrow is waiting for the camera to arrive before the
   * hint highlight starts. `null` when no camera transit is in progress.
   */
  const pendingHintArrowRef = useRef<number | null>(null);

  /**
   * Start the hint highlight and its auto-expire timer.
   *
   * Extracted so it can be called either immediately (arrow already visible) or
   * after the camera arrives at the target (arrow was off-screen).
   */
  const activateHintHighlight = useCallback((arrowIndex: number) => {
    setHintedArrow(arrowIndex);
    setHintFading(false);
    playSfx('hintUsed');
    triggerHintHaptic(haptics);

    // Clear any existing hint timers.
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    if (hintFadeTimerRef.current) clearTimeout(hintFadeTimerRef.current);

    // Auto-expire the hint after HINT_DURATION_MS.
    hintTimerRef.current = setTimeout(() => {
      setHintFading(true);
      hintFadeTimerRef.current = setTimeout(() => {
        setHintedArrow(undefined);
        setHintFading(false);
      }, HINT_FADE_MS);
    }, HINT_DURATION_MS);
  }, [haptics]);

  /**
   * Called when the camera arrives at the hinted arrow's position.
   * Now safe to start the highlight animation.
   */
  const onCameraFocusComplete = useCallback(() => {
    const pending = pendingHintArrowRef.current;
    if (pending !== null) {
      pendingHintArrowRef.current = null;
      activateHintHighlight(pending);
    }
  }, [activateHintHighlight]);

  /**
   * Spend a hint and point the camera at the answer.
   *
   * Split out from `onHint` so the *earning* path can end in the same place. It
   * deliberately does not read `hintsAvailable` — that value is captured at render
   * and would still be zero in the closure that runs after an ad. `spendHint`
   * consults the live store and returns false if there is nothing to spend, which
   * is the only check that can be trusted here.
   */
  const applyHint = useCallback(() => {
    if (!built?.ok || status !== 'playing') return;

    const hint = findSafeMove(built.value.board, boardState);
    if (hint.kind !== 'move') {
      notify(hint.kind === 'already-won' ? 'Already cleared.' : hint.reason);
      return;
    }

    if (!spendHint()) return;
    hintsUsedRef.current += 1;

    // Pan camera smoothly to the hinted arrow's head position:
    const arrow = built.value.board.arrows[hint.arrowIndex];
    if (arrow && arrow.body[0] !== undefined) {
      const headCell = arrow.body[0];
      const col = headCell % built.value.board.cols;
      const row = Math.floor(headCell / built.value.board.cols);
      const fx = (col + 0.5 + padCells) * cellSize;
      const fy = (row + 0.5 + padCells) * cellSize;
      setFocusX(fx);
      setFocusY(fy);
      setFocusNonce((n) => n + 1);
    }

    pendingHintArrowRef.current = null;
    activateHintHighlight(hint.arrowIndex);
  }, [built, spendHint, boardState, status, activateHintHighlight, notify, padCells, cellSize]);

  const onEarnHint = useCallback(async () => {
    setEarning(true);
    const online = await isOnline();
    if (online === false) {
      Alert.alert('No Internet', 'Please check your connection and try again.');
      setEarning(false);
      return;
    }
    void showRewarded()
      .then((outcome) => {
        if (outcome.kind === 'earned') {
          grantHints();
          playSfx('rewardCollected');
          applyHint();
        } else if (outcome.kind === 'dismissed') {
          notify('No hint earned — the ad was closed early.');
        } else if (outcome.kind === 'failed') {
          notify(outcome.reason);
        }
      })
      .finally(() => {
        setEarning(false);
      });
  }, [grantHints, applyHint, notify]);

  const onHint = useCallback(() => {
    if (!built?.ok || status !== 'playing') return;

    if (useHintStore.getState().available > 0) {
      applyHint();
      return;
    }

    onEarnHint();
  }, [built, status, applyHint, onEarnHint]);

  useEffect(() => {
    if (hintsAvailable === 0) preload();
  }, [hintsAvailable]);

  const adReady = availability() === 'ready';

  /**
   * One chime when there is suddenly a way to get a hint back.
   *
   * Fires on the *transition* into that state, so it says "this is available now"
   * once rather than on every render that happens to find it true. It re-arms when
   * the state goes away — spending the earned hint puts the offer back, and that is
   * a genuinely new offer.
   */
  const offerRef = useRef(false);
  useEffect(() => {
    const offered = hintsAvailable === 0 && adReady;
    if (offered && !offerRef.current) playSfx('rewardReady');
    offerRef.current = offered;
  }, [hintsAvailable, adReady]);

  return {
    hintedArrow,
    earning,
    focusX,
    focusY,
    focusNonce,
    hintsUsedRef,
    resetHint,
    onCameraFocusComplete,
    onHint,
    onEarnHint,
  };
}


