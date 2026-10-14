/**
 * src/features/gameplay/screens/PlayScreen.tsx — the game screen.
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
 *
 *               **This screen knows nothing about routes.** `app/play/[id].tsx`
 *               reads the route parameters and hands them over as props, so the
 *               screen is a plain function of its inputs and can be rendered
 *               without a navigator around it. The level-id clamp lives here
 *               rather than in the route on purpose: validating a parameter is
 *               domain behaviour, and a wrapper that quietly coerced `-3` to `1`
 *               would hide the difference between a deep link and a typed value.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { SkiaBoard } from '@render/SkiaBoard';
import { Celebration, ConfirmDialog, FailOverlay, Hud, PauseMenu, PillButton, Screen, StuckOverlay, useTheme, WinOverlay } from '@components';
import { earnedCount, today } from '@challenge';
import {
  buildLevel,
  emptyBoardState,
  findAllSafeMoves,
  isDoomed,
} from '@game';
import { LEVEL_COUNT, levelById, tierOf } from '@data';
import { TIER_LABELS } from '@game/codec';
import { WIN_OVERLAY_DELAY_MS } from '@config';
import { bannerHeight, getBannerComponent, recordLevelCompleteAndCheckInterstitial, showRewarded } from '@services/ads';
import { playMusic, playSfx, playSting, stopAllSfx, type SfxName } from '@services/audio';
import { gameReducer, initGameState , statsOf, useChallengeStore , useLeagueStore , useProgressStore , useSettingsStore } from '@state';





import { radius, spacing, typography } from '@theme';
import type { DifficultyTier } from '@game/codec';

import { useArrowTap } from '../hooks/useArrowTap';
import { useBoardViewport } from '../hooks/useBoardViewport';
import { useHintFlow } from '../hooks/useHintFlow';

/**
 * Banner ad component, resolved once at module scope.
 *
 * `getBannerComponent()` returns a function component created from the native
 * SDK wrapper — calling it during render trips ESLint's
 * `react-hooks/static-components` rule, so it is resolved here instead.
 */
const BannerAd = getBannerComponent();
const bannerSpace = bannerHeight();



/**
 * Props for {@link PlayScreen}, forwarded from `app/play/[id].tsx`.
 *
 * Purpose:      Keep the route parameters out of the feature so the screen does
 *               not depend on `expo-router`'s search-params hook, which would tie
 *               gameplay to one navigation scheme and make the screen
 *               unrenderable without a navigator above it.
 * Notes:        Both values are the raw strings the route hands over,
 *               deliberately unvalidated. Clamping a level number is domain
 *               behaviour and belongs to the feature; a wrapper that coerced `-3`
 *               to `1` would erase the difference between a deep link and a typed
 *               value, and there is nowhere left to report it.
 */
export interface PlayScreenProps {
  /** The `[id]` route segment, e.g. `'42'`. Clamped to `1..LEVEL_COUNT` on entry. */
  levelId: string;
  /**
   * The day this session is playing, when it was opened from Challenge Mode.
   *
   * A route parameter rather than a store flag, so a challenge is a deep link and
   * the play screen stays a pure function of its inputs. `undefined` for ordinary
   * levels, which is every existing entry point — nothing about normal play
   * changes.
   *
   * The explicit `| undefined` is load-bearing, not decoration: the repository
   * compiles with `exactOptionalPropertyTypes`, so a bare `challengeDay?: string`
   * would forbid the route from passing the `undefined` it genuinely holds for an
   * ordinary level. Leaving it off would force every wrapper to invent a
   * conditional for a value that is optional by design.
   */
  challengeDay?: string | undefined;
}

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

export function PlayScreen({ levelId: levelIdParam, challengeDay }: PlayScreenProps) {
  const router = useRouter();
  const levelId = Math.max(1, Math.min(LEVEL_COUNT, Number(levelIdParam) || 1));

  const { palette, arrow: arrowStyle, board: boardStyle } = useTheme();

  const reducedMotion = useSettingsStore((state) => state.reducedMotion);
  const haptics = useSettingsStore((state) => state.haptics);
  const confirmRestart = useSettingsStore((state) => state.confirmRestart);
  const assist = useSettingsStore((state) => state.assist);

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

  const { viewportWidth, viewportHeight, layout, computedInitialScale } = useBoardViewport({
    built,
    padCells: boardStyle.padCells,
    tier,
  });

  const hearts = 3;
  const [state, dispatch] = useReducer(
    gameReducer,
    built?.ok ? initGameState(built.value.initial, hearts) : undefined,
    (initial) => initial ?? initGameState(emptyBoardState(), hearts),
  );

  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  /** Bumped to send the board back to fit-to-screen. */
  const [fitNonce] = useState(0);
  const [paused, setPaused] = useState(false);

  const status = state.session.status;

  const {
    hintedArrow,
    earning,
    focusX,
    focusY,
    focusNonce,
    hintsUsedRef,
    onCameraFocusComplete,
    onHint,
    resetHint,
  } = useHintFlow({
    built,
    status,
    boardState: state.session.state,
    padCells: boardStyle.padCells,
    cellSize: layout.cellSize,
    haptics,
  });

  const { onCollisionHit, onDepartComplete, onPressArrow, onTapArrow, onTapEmpty } = useArrowTap({
    built,
    state,
    dispatch,
    haptics,
    resetHint,
  });

  // No instructional popups: gameplay starts immediately. The one-time coach
  // cards that used to explain the arrowhead were removed and their component
  // deleted with it — a rule the player can infer from watching does not earn a
  // modal, and one that cannot should be taught by the level, not by a card.

  useEffect(() => {
    setLastPlayed(levelId);
    playMusic('gameplay');
    return () => {
      stopAllSfx();
    };
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

    // Evaluate ad monetization policy (grace period & cadence)
    void recordLevelCompleteAndCheckInterstitial();

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
    hintsUsedRef,
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

  const doRestart = useCallback(() => {
    if (!built?.ok) return;
    stopAllSfx();
    playSfx('levelRestart');
    setShowRestartConfirm(false);
    resetHint();
    setOverlayVisible(false);
    dispatch({ type: 'restart', initial: built.value.initial, hearts });
  }, [built, hearts, resetHint]);

  const onRestartPressed = useCallback(() => {
    const untouched = state.taps === 0;
    if (!confirmRestart || untouched || status !== 'playing') doRestart();
    else setShowRestartConfirm(true);
  }, [confirmRestart, doRestart, state.taps, status]);

  if (!level || !built?.ok) {
    return (
      <Screen palette={palette}>
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
      <Screen palette={palette}>
        {/* ---- Top Header Bar (5% of whole screen) ------------------------- */}
        <View style={styles.headerWrap}>
          <Hud
            palette={palette}
            tierLabel={tierLabel}
            heartsLeft={state.session.heartsLeft}
            maxHearts={3}
            onBack={() => router.back()}
            onRestart={onRestartPressed}
            onHint={earning ? () => undefined : onHint}
            earning={earning}
          />
        </View>

        {/* ---- Arrow Board Section (95% of whole screen) ------------------- */}
        <View style={styles.boardWrap}>
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
            freeCells={state.highlight?.freeCells ?? 0}
            onCollisionHit={onCollisionHit}
            departingArrows={state.departing}
            onDepartComplete={onDepartComplete}
            reducedMotion={reducedMotion}
            onTapArrow={onTapArrow}
            onPressArrow={onPressArrow}
            onTapEmpty={onTapEmpty}
            disabled={status !== 'playing'}
            hintedArrow={hintedArrow}
          />
        </View>

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
        remainingArrows={state.session.state.remaining}
        onRetry={doRestart}
        onLevels={() => router.replace('/levels')}
        onNearMiss={() => {
          showRewarded().then((outcome) => {
            if (outcome.kind === 'earned') {
              dispatch({ type: 'addHearts', count: 2 });
              if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          });
        }}
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

      { /* ---- Banner Ad at bottom ------------------------------------------- */ }
      {BannerAd && bannerSpace > 0 ? <BannerAd style={{ height: bannerSpace }} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerWrap: { width: '100%', flexShrink: 0, justifyContent: 'center' },
  boardWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
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
