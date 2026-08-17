/**
 * app/play/[id].tsx — the game screen.
 *
 * Purpose:      Play one level, end to end.
 * Responsibilities:
 *               - Load the level, run the reducer, and render the board.
 *               - Hints, including the earn-a-hint flow.
 *               - Win and out-of-hearts handling, and saving progress.
 * Notes:        The board must never scroll or resize mid-level. A board that
 *               shifts under a finger turns a correct read into a mis-tap, and the
 *               player will blame themselves. So the layout is measured once and
 *               the board is fitted into whatever is left after the fixed chrome.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { SkiaBoard } from '@render/SkiaBoard';
import { Celebration, computeBoardLayout, ConfirmDialog, FailOverlay, Hud, initialScaleForTier, PauseMenu, PillButton, Screen, Springy, StuckOverlay, useTheme, WinOverlay, withClick } from '@components';
import { earnedCount, today } from '@challenge';
import {
  buildLevel,
  colOf,
  emptyBoardState,
  findAllSafeMoves,
  findSafeMove,
  isDoomed,
  rowOf,
} from '@game';
import { LEVEL_COUNT, levelById, tierOf } from '@data/levels';
import { TIER_LABELS } from '@game/codec';
import { WIN_OVERLAY_DELAY_MS } from '@config';
import { availability, preload, showRewarded } from '@services/ads';
import { playMusic, playSfx, playSting, type SfxName } from '@services/audio';
import { gameReducer, initGameState } from '@state/gameReducer';
import { useHintStore } from '@state/hintStore';

import { statsOf, useChallengeStore } from '@state/challengeStore';
import { useLeagueStore } from '@state/leagueStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';
import { radius, spacing, typography } from '@theme';
import type { DifficultyTier } from '@game/codec';

/** How long a hint highlight stays visible before auto-fading, in ms. */
const HINT_DURATION_MS = 6000;
/** How long the hint glow fade-out takes, in ms. */
const HINT_FADE_MS = 500;

/**
 * Chrome above and below the board that the board must not overlap.
 *
 * Raised from 210, and it was measurably too small: the pan-hint row under the
 * board was being covered by the Restart/Hint buttons, leaving a sliver of text
 * visible between them. The board is fitted into whatever is left after this, so
 * an under-estimate does not shrink the chrome — it pushes the board on top of it.
 *
 * The safe-area inset is added separately at the call site, because it is a
 * property of the device rather than of the layout.
 */
const CHROME_HEIGHT = 268;

/**
 * Smallest a cell may be drawn.
 *
 * Below roughly this an arrowhead stops being readable and a tap stops being
 * reliable, so an oversized board is drawn at this size and panned rather than
 * squeezed onto the screen. It is the number that turns "the board does not fit"
 * from a rendering problem into a gameplay feature.
 *
 * **Raised from 26 to make arrows bigger while panning**, and it is worth writing
 * down why this works, because at first glance it should not: making cells larger
 * also lowers `fitScale` by the same proportion, so a board that fits the screen
 * looks identical either way. A 10x10 level went from 27dp cells at 1.0x to 34dp
 * cells at 0.80x — the same 27dp on glass. Nothing changes for small boards.
 *
 * What breaks the symmetry is the **absolute floor** in `initialScaleForTier`:
 * exploration tiers start at `max(fitScale * 3, 0.9)`, and on a large board the
 * 0.9 wins. That floor is in scale units, not board units, so a bigger cell passes
 * straight through it. On a 50x54 board an arrow cell goes from 26 x 0.9 = 23dp to
 * 34 x 0.9 = 31dp — about a third larger, and the board needs about a third more
 * panning to cross, which is the intent.
 *
 * The cost is that fully zoomed out shows a smaller overview. That is the trade:
 * legibility while exploring, against the value of the bird's-eye view.
 */
const MIN_CELL_SIZE = 34;

/**
 * Gap between the sounds of a single win, in ms.
 *
 * A clean first clear of the last level in a tier that also earns an award has
 * four things to say at once. Said simultaneously they are not four events, they
 * are one loud noise — so they are spaced far enough apart to be counted, and
 * close enough to still read as one moment.
 */
const FANFARE_GAP_MS = 420;

/**
 * Play a short sequence of effects, one after another.
 *
 * Returns a cancel function, because a player who taps Next before the sequence
 * finishes should not hear the rest of it arrive over the following level.
 */
function fanfare(names: readonly SfxName[]): () => void {
  const [first, ...rest] = names;
  if (first) playSfx(first);

  const timers = rest.map((name, index) =>
    setTimeout(() => playSfx(name), (index + 1) * FANFARE_GAP_MS),
  );
  return () => timers.forEach(clearTimeout);
}

export default function PlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; challenge?: string }>();
  /**
   * The day this session is playing, when it was opened from Challenge Mode.
   *
   * A route parameter rather than a store flag, so a challenge is a deep link and
   * the play screen stays a pure function of its route. `undefined` for ordinary
   * levels, which is every existing entry point — nothing about normal play
   * changes.
   */
  const challengeDay = params.challenge;
  const levelId = Math.max(1, Math.min(LEVEL_COUNT, Number(params.id) || 1));

  const { palette, arrow: arrowStyle, board: boardStyle } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const haptics = useSettingsStore((state) => state.haptics);
  const confirmRestart = useSettingsStore((state) => state.confirmRestart);
  const assist = useSettingsStore((state) => state.assist);

  const hintsAvailable = useHintStore((state) => state.available);
  const spendHint = useHintStore((state) => state.spendHint);
  const grantHints = useHintStore((state) => state.grantHints);

  const completeLevel = useProgressStore((state) => state.completeLevel);
  const perfectStreak = useProgressStore((state) => state.perfectStreak);
  const setLastPlayed = useProgressStore((state) => state.setLastPlayed);
  const recordResult = useChallengeStore((state) => state.recordResult);
  const addClear = useLeagueStore((state) => state.addClear);
  const addChallengeWin = useLeagueStore((state) => state.addChallengeWin);

  const level = levelById(levelId);
  // Read from the encoded pack rather than the decoded level: the tier is metadata
  // and `tierOf` does not pay to expand a 3,600-cell board to answer.
  const tierLabel = TIER_LABELS[tierOf(levelId) ?? 'medium'];
  const tier: DifficultyTier = tierOf(levelId) ?? 'medium';
  const built = useMemo(() => (level ? buildLevel(level) : undefined), [level]);

  const hearts = level?.hearts ?? 5;
  const [state, dispatch] = useReducer(
    gameReducer,
    built?.ok ? initGameState(built.value.initial, hearts) : undefined,
    (initial) => initial ?? initGameState(emptyBoardState(), hearts),
  );

  const [hintedArrow, setHintedArrow] = useState<number | undefined>(undefined);
  // Kept for the fade *sequencing* — the timers below use it to hold the hint
  // visible, then clear `hintedArrow` once the glow has faded. The renderer no
  // longer needs to be told: under Skia the hinted arrow fades its own glow when it
  // stops being hinted, so nothing reads this value directly.
  const [_hintFading, setHintFading] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  /**
   * Why a hint could not be given, shown under the buttons.
   *
   * This was being *set* and never rendered, which meant tapping Hint with none
   * left did nothing visible at all — indistinguishable from a dead button. It is
   * on screen now, and `notify` is the only way it gets set, so a message can
   * never appear silently.
   */
  const [hintNotice, setHintNotice] = useState<string | undefined>(undefined);
  const [earning, setEarning] = useState(false);
  /**
   * The overlay waits a beat after the win so the board clearing is visible.
   *
   * The confetti and the banner run inside this window; the overlay waits for it
   * to finish. Both halves matter and they are not the same thing — the burst marks
   * the moment, and the delay is what stops a modal landing on top of the last
   * snake threading out, which is the best thing in the game to watch.
   */
  const [overlayVisible, setOverlayVisible] = useState(false);
  /** Bumped to send the board back to fit-to-screen. */
  const [fitNonce, setFitNonce] = useState(0);
  const [paused, setPaused] = useState(false);
  /** Camera focus for hint navigation. */
  const [focusX, setFocusX] = useState(0);
  const [focusY, setFocusY] = useState(0);
  const [focusNonce, setFocusNonce] = useState(0);
  /** Timer ref for the hint auto-expire. */
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status = state.session.status;

  // Coach cards removed — gameplay starts immediately with no instructional popups.
  // The CoachCard component and onboardingStore remain in the codebase for
  // potential future use in dedicated tutorial levels.

  useEffect(() => {
    setLastPlayed(levelId);
    playMusic('gameplay');
  }, [levelId, setLastPlayed]);

  /**
   * One warning when the last heart is reached, and only one.
   *
   * Keyed on the count rather than fired from the tap, so it cannot double up when
   * a tap is delivered twice — and so restarting back to five and losing four again
   * genuinely re-arms it.
   */
  /**
   * When the player's first tap landed, for the challenge timer.
   *
   * Timed from the first tap rather than from mount, because a player who opens a
   * board and studies it for a minute has not spent that minute *solving*. Zero
   * until the first tap, which is why the win handler guards on it.
   */
  const startedAtRef = useRef(0);
  /** Hints spent this session. Counted here because the store is global. */
  const hintsUsedRef = useRef(0);

  useEffect(() => {
    if (state.taps > 0 && startedAtRef.current === 0) startedAtRef.current = Date.now();
  }, [state.taps]);

  const warnedRef = useRef(false);
  useEffect(() => {
    if (state.session.heartsLeft === 1 && !warnedRef.current) {
      warnedRef.current = true;
      playSfx('lastHeartWarning');
    } else if (state.session.heartsLeft > 1) {
      warnedRef.current = false;
    }
  }, [state.session.heartsLeft]);

  // Save the moment a level is cleared, not when the overlay is dismissed —
  // otherwise a player who closes the app on the win screen loses the level.
  useEffect(() => {
    if (status !== 'won') return;

    // Read before recording, so "was this the first time?" is answerable. Replaying
    // a cleared level must not re-announce a tier the player opened weeks ago.
    const firstClear =
      (useProgressStore.getState().records[levelId]?.timesCleared ?? 0) === 0;

    completeLevel(levelId, state.session.mistakes, state.session.heartsLeft);

    // League score. One arrow per arrow actually cleared, counted once per level —
    // `addClear` ignores a repeat, so replaying a board cannot farm the ladder.
    // The board is known good here: `status` only reaches 'won' from a built level.
    if (built?.ok) {
      addClear(levelId, built.value.board.arrows.length, Date.now());
      if (challengeDay) addChallengeWin(Date.now());
    }

    // A challenge session also writes a dated record. `recordResult` keeps only the
    // better of the two, so replaying a day can improve it but never spoil it.
    //
    // Awards are *derived* from those records rather than stored, so the only
    // honest way to ask "did this win earn one?" is to count them either side of
    // the write. Cheap — the ladder is a handful of entries — and it cannot drift
    // out of step with the ladder the way a duplicated counter would.
    let awardEarned = false;
    if (challengeDay) {
      const day = today();
      const before = earnedCount(
        statsOf({ records: useChallengeStore.getState().records }, day),
      );

      recordResult({
        id: challengeDay,
        levelId,
        tier,
        outcome: 'won',
        timeMs: startedAtRef.current > 0 ? Date.now() - startedAtRef.current : 0,
        moves: state.taps,
        heartsLeft: state.session.heartsLeft,
        hintsUsed: hintsUsedRef.current,
        completedAt: Date.now(),
        syncedAt: null,
      });

      awardEarned =
        earnedCount(statsOf({ records: useChallengeStore.getState().records }, day)) >
        before;
    }

    // Did clearing this open a tier the player has not seen? `tierOf` is metadata,
    // so this costs nothing — and it is deliberately keyed on the *next* level,
    // because a tier is entered by finishing the one before it.
    const tierUp =
      firstClear && levelId < LEVEL_COUNT && tierOf(levelId + 1) !== tier;

    playSting('victory');
    const cancelFanfare = fanfare([
      'levelComplete',
      ...(state.session.mistakes === 0 ? (['starCollect'] as const) : []),
      ...(awardEarned ? (['achievement'] as const) : []),
      ...(tierUp ? (['difficultyUnlocked'] as const) : []),
    ]);

    if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Only the overlay is delayed, so the board clearing is visible before
    // anything covers it.
    const timer = setTimeout(() => setOverlayVisible(true), WIN_OVERLAY_DELAY_MS);
    return () => {
      clearTimeout(timer);
      cancelFanfare();
    };
  }, [
    status,
    levelId,
    completeLevel,
    state.session.mistakes,
    state.session.heartsLeft,
    state.taps,
    haptics,
    challengeDay,
    tier,
    recordResult,
    addClear,
    addChallengeWin,
    built,
  ]);

  useEffect(() => {
    if (status !== 'failed' && status !== 'stuck') return;
    playSfx(status === 'stuck' ? 'gameOver' : 'outOfHearts');
    playSting('failure');
    if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [status, haptics]);

  /**
   * Has a shutter already cost the player the level, before the board looks lost?
   *
   * `PlaySession.status` catches the blunt case — nothing left that can be tapped —
   * but a gate can seal on one arrow while several others are still free, so the
   * board stays playable for a few taps after it stopped being winnable. Letting
   * someone keep playing a level they have already lost is the worst version of
   * this mechanic, so the check runs after every move.
   *
   * It costs nothing on the levels that have no shutter: `isDoomed` returns false
   * without looking at the board.
   */
  const doomed = useMemo(
    () => (built?.ok ? isDoomed(built.value.board, state.session.state) : false),
    [built, state.session.state],
  );

  const safeArrows = useMemo(() => {
    if (!built?.ok) return [];
    const showAll = assist && status === 'playing';
    if (showAll) return findAllSafeMoves(built.value.board, state.session.state);
    return hintedArrow !== undefined ? [hintedArrow] : [];
  }, [assist, built, hintedArrow, state.session.state, status]);

  const viewportWidth = width - spacing.lg * 2;
  // Insets are part of the chrome the board must not sit under — the status bar
  // at the top and the gesture pill at the bottom both eat real height.
  const viewportHeight = Math.max(220, height - CHROME_HEIGHT - insets.top - insets.bottom);
  const layout = useMemo(
    () =>
      built?.ok
        ? computeBoardLayout(
          built.value.board.rows,
          built.value.board.cols,
          boardStyle.padCells,
          viewportWidth,
          viewportHeight,
          MIN_CELL_SIZE,
        )
        : computeBoardLayout(8, 8, boardStyle.padCells, viewportWidth, viewportHeight, MIN_CELL_SIZE),
    [built, boardStyle.padCells, viewportWidth, viewportHeight],
  );

  const computedInitialScale = useMemo(
    () => {
      const fit = Math.min(
        viewportWidth / layout.width,
        viewportHeight / layout.height,
        1,
      );
      return initialScaleForTier(tier, fit);
    },
    [tier, layout.width, layout.height, viewportWidth, viewportHeight],
  );

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
    (arrowIndex: number) => dispatch({ type: 'departed', arrowIndex }),
    [],
  );

  /**
   * Tapping an arrow: dispatch, and nothing else.
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

  const onTapArrow = useCallback(
    (index: number) => {
      if (!built?.ok) return;

      const now = Date.now();
      if (lastTap.current.index === index && now - lastTap.current.at < 60) return;
      lastTap.current = { index, at: now };

      setHintedArrow(undefined);
      setHintFading(false);
      setHintNotice(undefined);
      dispatch({ type: 'tap', board: built.value.board, arrowIndex: index });
    },
    [built],
  );

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
      playSfx('collision');
      playSfx('heartLost');
      if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (outcome?.kind === 'escaped') {
      playSfx('arrowRelease');
      if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // `lastOutcome` is deliberately absent: the tap counter is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.taps, haptics]);

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

  const doRestart = useCallback(() => {
    if (!built?.ok) return;
    playSfx('levelRestart');
    setShowRestartConfirm(false);
    setHintedArrow(undefined);
    setHintFading(false);
    setHintNotice(undefined);
    setOverlayVisible(false);
    dispatch({ type: 'restart', initial: built.value.initial, hearts });
  }, [built, hearts]);

  const onRestartPressed = useCallback(() => {
    const untouched = state.taps === 0;
    if (!confirmRestart || untouched || status !== 'playing') doRestart();
    else setShowRestartConfirm(true);
  }, [confirmRestart, doRestart, state.taps, status]);

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
    if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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

    const hint = findSafeMove(built.value.board, state.session.state);
    if (hint.kind !== 'move') {
      notify(hint.kind === 'already-won' ? 'Already cleared.' : hint.reason);
      return;
    }

    if (!spendHint()) return;
    // Counted for the challenge record. A challenge cleared with hints is still a
    // win, but it is not a perfect one — see `challengeStats`.
    hintsUsedRef.current += 1;

    // Navigate the camera to the hinted arrow if it might be off-screen.
    // The highlight starts only after the camera arrives, so the player sees
    // the glow on the arrow rather than during transit.
    const arrow = built.value.board.arrows[hint.arrowIndex];
    if (arrow && layout) {
      const headCell = arrow.body[0]!;
      const headX = layout.originX + colOf(headCell, built.value.board.cols) * layout.cellSize + layout.cellSize / 2;
      const headY = layout.originY + rowOf(headCell, built.value.board.cols) * layout.cellSize + layout.cellSize / 2;

      // Store the pending arrow and kick off the camera move.
      pendingHintArrowRef.current = hint.arrowIndex;
      setFocusX(headX);
      setFocusY(headY);
      setFocusNonce((n) => n + 1);
    } else {
      // No camera move needed — activate immediately.
      activateHintHighlight(hint.arrowIndex);
    }
  }, [built, spendHint, state.session.state, status, layout, activateHintHighlight, notify]);

  /**
   * Watch an ad, then give the hint it earned — without a second tap.
   *
   * The old flow granted a hint credit and stopped, leaving the player looking at
   * a button that now said something different and had to be pressed again. They
   * asked for a hint, sat through an advertisement for it, and were asked to ask
   * again. The ad is the price; the hint is the thing bought, so it arrives.
   */
  const onEarnHint = useCallback(async () => {
    setEarning(true);
    const outcome = await showRewarded();
    setEarning(false);

    if (outcome.kind === 'earned') {
      grantHints();
      playSfx('rewardCollected');
      applyHint();
    } else if (outcome.kind === 'dismissed') {
      notify('No hint earned — the ad was closed early.');
    } else {
      notify(outcome.reason);
    }
  }, [grantHints, notify, applyHint]);

  /**
   * The Hint button, whatever state the player is in.
   *
   * One entry point for all three cases, so the button never has to be pressed
   * twice to do the thing it is named after: spend a hint if there is one, earn
   * one first if an ad is ready, and otherwise say plainly why not.
   */
  const onHint = useCallback(() => {
    if (!built?.ok || status !== 'playing') return;

    if (useHintStore.getState().available > 0) {
      applyHint();
      return;
    }

    if (availability() === 'ready') {
      void onEarnHint();
      return;
    }

    notify('Out of hints. Connect to earn one — or restart, which is always free.');
  }, [built, status, applyHint, onEarnHint, notify]);

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

  if (!level || !built?.ok) {
    return (
      <Screen>
        <Text style={[styles.error, { color: palette.text }]}>
          Level {levelId} could not be loaded.
        </Text>
        <PillButton
          palette={palette}
          label="Back to levels"
          onPress={() => router.replace('/levels')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {/*
        One row of chrome above the board, not two.

        Everything that led away from the level — back, settings — is behind the
        pause button now. Those were three tap targets along the top edge of a
        screen whose only verb is "tap an arrow", and none of them was ever wanted
        mid-move.
      */}
      <Hud
        palette={palette}
        levelName={level.name}
        levelNumber={level.id}
        tierLabel={tierLabel}
        heartsLeft={state.session.heartsLeft}
        maxHearts={state.session.maxHearts}
        arrowsLeft={state.session.state.remaining}
        arrowsTotal={built.value.board.arrows.length}
        onPause={() => {
          playSfx('pause');
          setPaused(true);
        }}
      />

      <View style={styles.boardWrap}>
        {/*
          One Skia canvas, replacing the SVG board and the view that used to
          transform it. The camera is a matrix inside the canvas rather than a
          transform on a view the size of the whole level, and every arrow at rest
          is recorded into a single picture — see `src/render/SkiaBoard.tsx`.
        */}
        <SkiaBoard
          board={built.value.board}
          state={state.session.state}
          cellSize={layout.cellSize}
          width={layout.width}
          height={layout.height}
          originX={layout.originX}
          originY={layout.originY}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          palette={palette}
          arrowStyle={arrowStyle}
          boardStyle={boardStyle}
          initialScale={computedInitialScale}
          fitNonce={fitNonce}
          focusX={focusX}
          focusY={focusY}
          focusNonce={focusNonce}
          onFocusComplete={onCameraFocusComplete}
          safeArrows={safeArrows}
          blockedArrows={state.blockedArrows}
          blockerArrows={state.blockerArrows}
          shakeArrow={state.highlight?.blocked}
          shakeNonce={state.highlight?.nonce ?? 0}
          departingArrows={state.departing}
          onDepartComplete={onDepartComplete}
          reducedMotion={reducedMotion}
          onTapArrow={onTapArrow}
          onPressArrow={onPressArrow}
          onTapEmpty={onTapEmpty}
          disabled={status !== 'playing'}
          hintedArrow={hintedArrow}
        />

        {layout.oversized ? (
          <View style={styles.panRow}>
            <Text style={[styles.panHint, { color: palette.textFaint }]}>
              {built.value.board.rows}×{built.value.board.cols} — drag to pan, pinch to zoom
            </Text>
            <Springy
              accessibilityRole="button"
              accessibilityLabel="Fit board to screen"
              onPress={withClick(() => setFitNonce((n) => n + 1))}
              style={[
                styles.fitButton,
                { borderColor: palette.border, backgroundColor: palette.surfaceRaised },
              ]}
            >
              <Text style={[styles.fitLabel, { color: palette.textMuted }]}>Fit</Text>
            </Springy>
          </View>
        ) : null}
      </View>



      <View style={styles.actions}>
        <PillButton palette={palette} label="Restart" icon="↺" onPress={onRestartPressed} />
        {/*
          One button, one handler, whatever the hint situation is.

          It used to be two buttons with two handlers and a condition deciding
          which one you got — which is how "watch an ad" ended up being a
          different action from "get a hint" rather than the price of one. The
          label still tells the truth about what pressing it will cost.
        */}
        <PillButton
          palette={palette}
          label={
            earning
              ? 'Loading…'
              : hintsAvailable > 0
                ? `Hint (${hintsAvailable})`
                : adReady
                  ? 'Watch ad · Hint'
                  : 'Hint'
          }
          icon="💡"
          onPress={earning ? () => undefined : onHint}
          primary
        />
      </View>

      {hintNotice ? (
        <Text style={[styles.notice, { color: palette.textMuted }]}>{hintNotice}</Text>
      ) : null}

      {hintsAvailable === 0 && !adReady ? (
        <Springy
          accessibilityRole="button"
          onPress={withClick(doRestart)}
          style={styles.freeAlternative}
        >
          <Text style={[styles.freeAlternativeLabel, { color: palette.textFaint }]}>
            Restarting is always free.
          </Text>
        </Springy>
      ) : null}

      {/*
        Fires from the win itself rather than from its own state flag.

        Replaying a level takes `status` false and true again, which re-triggers the
        burst for free — a separate nonce would be a second signal meaning the same
        thing, and a second thing to get out of step.
      */}
      <Celebration
        active={status === 'won'}
        intensity={state.session.mistakes === 0 ? 'perfect' : 'normal'}
        palette={palette}
        reducedMotion={reducedMotion}
      />

      <PauseMenu
        palette={palette}
        visible={paused && status === 'playing'}
        levelNumber={level.id}
        levelName={level.name}
        tierLabel={tierLabel}
        boardRows={built.value.board.rows}
        boardCols={built.value.board.cols}
        arrowsLeft={state.session.state.remaining}
        arrowsTotal={built.value.board.arrows.length}
        heartsLeft={state.session.heartsLeft}
        maxHearts={state.session.maxHearts}
        onResume={() => {
          playSfx('resume');
          setPaused(false);
        }}
        onRestart={() => {
          // No `levelRestart` here any more: the sound belongs to the restart
          // itself, which lives in `doRestart`. Four different buttons can cause
          // one, and only this one was making the noise.
          setPaused(false);
          onRestartPressed();
        }}
        onSettings={() => {
          setPaused(false);
          router.push('/settings');
        }}
        onLevels={() => router.replace('/levels')}
      />

      <WinOverlay
        palette={palette}
        visible={status === 'won' && overlayVisible}
        levelName={level.name}
        heartsLeft={state.session.heartsLeft}
        maxHearts={state.session.maxHearts}
        mistakes={state.session.mistakes}
        perfectStreak={perfectStreak}
        onNext={levelId < LEVEL_COUNT ? () => router.replace(`/play/${levelId + 1}`) : undefined}
        onReplay={doRestart}
        onLevels={() => router.replace('/levels')}
      />

      <FailOverlay
        palette={palette}
        visible={status === 'failed'}
        stillWinnable={!doomed}
        onRetry={doRestart}
        onLevels={() => router.replace('/levels')}
      />

      <StuckOverlay
        palette={palette}
        visible={status === 'stuck' || (status === 'playing' && doomed)}
        quietly={status === 'playing'}
        onRetry={doRestart}
        onLevels={() => router.replace('/levels')}
      />

      <ConfirmDialog
        palette={palette}
        visible={showRestartConfirm}
        title="Restart level?"
        message="The board goes back to the start and your hearts are restored."
        confirmLabel="Restart"
        onConfirm={doRestart}
        onCancel={() => setShowRestartConfirm(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  panHint: { ...typography.tiny, textAlign: 'center' },
  fitButton: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  fitPressed: { opacity: 0.6 },
  fitLabel: { ...typography.tiny, fontWeight: '700' },


  actions: { flexDirection: 'row', gap: spacing.sm },

  notice: { ...typography.small, textAlign: 'center', marginTop: spacing.sm },
  freeAlternative: { alignSelf: 'center', padding: spacing.sm },
  freeAlternativeLabel: { ...typography.tiny },

  error: { ...typography.body, textAlign: 'center', marginBottom: spacing.lg },
  chip: { borderRadius: radius.md },
});
