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
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import {
  BoardCanvas,
  BoardViewport,
  Celebration,
  CoachCard,
  ConfirmDialog,
  FailOverlay,
  Hud,
  PauseMenu,
  PillButton,
  Screen,
  StuckOverlay,
  WinOverlay,
  computeBoardLayout,
  useTheme,
} from '@components';
import {
  buildLevel,
  emptyBoardState,
  findAllSafeMoves,
  findSafeMove,
  isDoomed,
  resolveTap,
} from '@game';
import { LEVEL_COUNT, levelById, tierOf } from '@data/levels';
import { TIER_LABELS } from '@game/codec';
import { WIN_OVERLAY_DELAY_MS } from '@config';
import { availability, preload, showRewarded } from '@services/ads';
import { playSfx } from '@services/audio';
import { gameReducer, initGameState } from '@state/gameReducer';
import { useHintStore } from '@state/hintStore';
import { useOnboardingStore, type CoachMoment } from '@state/onboardingStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';
import { radius, spacing, typography } from '@theme';

/** Chrome above and below the board that the board must not overlap. */
const CHROME_HEIGHT = 270;

/**
 * Smallest a cell may be drawn.
 *
 * Below roughly this an arrowhead stops being readable and a tap stops being
 * reliable, so an oversized board is drawn at this size and panned rather than
 * squeezed onto the screen. It is the number that turns "the board does not fit"
 * from a rendering problem into a gameplay feature.
 */
const MIN_CELL_SIZE = 26;

export default function PlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const levelId = Math.max(1, Math.min(LEVEL_COUNT, Number(params.id) || 1));

  const { palette, arrow: arrowStyle, board: boardStyle } = useTheme();
  const { width, height } = useWindowDimensions();

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

  const level = levelById(levelId);
  // Read from the encoded pack rather than the decoded level: the tier is metadata
  // and `tierOf` does not pay to expand a 3,600-cell board to answer.
  const tierLabel = TIER_LABELS[tierOf(levelId) ?? 'medium'];
  const built = useMemo(() => (level ? buildLevel(level) : undefined), [level]);

  const hearts = level?.hearts ?? 5;
  const [state, dispatch] = useReducer(
    gameReducer,
    built?.ok ? initGameState(built.value.initial, hearts) : undefined,
    (initial) => initial ?? initGameState(emptyBoardState(), hearts),
  );

  const [hintedArrow, setHintedArrow] = useState<number | undefined>(undefined);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
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

  const status = state.session.status;

  // ---- First-run teaching -------------------------------------------------
  const shouldShowCoach = useOnboardingStore((s) => s.shouldShow);
  const markCoachSeen = useOnboardingStore((s) => s.markSeen);
  const onboardingHydrated = useOnboardingStore((s) => s.hydrated);

  /**
   * Which single piece of guidance, if any, applies right now.
   *
   * Deliberately one at a time and situation-driven: the welcome only on the very
   * first board, the block explanation only after a tap has actually failed, and
   * the reassurance only once hearts are genuinely low. Front-loading all three
   * would be the text wall the GDD rules out.
   */
  const coach: CoachMoment | undefined = useMemo(() => {
    if (!onboardingHydrated || status !== 'playing') return undefined;
    if (levelId === 1 && state.taps === 0 && shouldShowCoach('welcome')) return 'welcome';

    // The two gate cards come before the block and low-heart ones, and fire before
    // the first tap rather than after a mistake. Every other card explains
    // something that has already happened; these have to arrive first, because the
    // mistake they prevent is one the player would have no way to see coming.
    if (built?.ok && state.taps === 0) {
      if (built.value.board.hasShutters && shouldShowCoach('firstShutter')) return 'firstShutter';
      if (built.value.board.hasObstacles && shouldShowCoach('firstGate')) return 'firstGate';
    }

    if (state.session.mistakes > 0 && shouldShowCoach('firstBlock')) return 'firstBlock';
    if (state.session.heartsLeft <= 2 && shouldShowCoach('lowHearts')) return 'lowHearts';
    return undefined;
  }, [
    onboardingHydrated,
    status,
    levelId,
    built,
    state.taps,
    state.session.mistakes,
    state.session.heartsLeft,
    shouldShowCoach,
  ]);

  const COACH_COPY: Record<CoachMoment, { title: string; body: string; dismiss: string }> = {
    welcome: {
      title: 'Get every arrow off the board',
      body: 'An arrow can leave only if the straight line from its arrowhead to the edge is empty. The green ones can go right now — tap one and watch its whole body follow.',
      dismiss: 'Show me',
    },
    firstBlock: {
      title: "That one couldn't leave",
      body: 'Something was sitting on its path out, so it stayed put and cost you a heart. Follow each arrowhead straight to the edge before tapping — if anything crosses that line, it has to wait.',
      dismiss: 'Understood',
    },
    lowHearts: {
      title: 'The board is still fine',
      body: 'A blocked tap never changes anything, so this level is exactly as winnable as when you started. Only your hearts are running out — restart any time, it costs nothing.',
      dismiss: 'Keep going',
    },
    firstGate: {
      title: 'The coloured squares are doors',
      body: 'A filled one is shut, and nothing can pass through it. It opens by itself the moment every arrow of that colour has left the board — so clear the colour first, then the way through is free.',
      dismiss: 'Got it',
    },
    firstShutter: {
      title: 'This one works backwards',
      body: 'The doors on this board are open now and close for good once their colour is gone. Send anything that needs to cross one out first. Get the order wrong and the level is lost with every heart still in your hand.',
      dismiss: 'Careful, then',
    },
  };

  useEffect(() => {
    setLastPlayed(levelId);
  }, [levelId, setLastPlayed]);

  // Save the moment a level is cleared, not when the overlay is dismissed —
  // otherwise a player who closes the app on the win screen loses the level.
  useEffect(() => {
    if (status !== 'won') return;

    completeLevel(levelId, state.session.mistakes, state.session.heartsLeft);
    playSfx('win');
    if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Only the overlay is delayed, so the board clearing is visible before
    // anything covers it.
    const timer = setTimeout(() => setOverlayVisible(true), WIN_OVERLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, levelId, completeLevel, state.session.mistakes, state.session.heartsLeft, haptics]);

  useEffect(() => {
    if (status !== 'failed' && status !== 'stuck') return;
    playSfx('fail');
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
    // The welcome card says "the green ones can go" — so it has to make them green.
    // Words alone would leave a first-time player hunting for what the card means.
    const showAll = (assist || coach === 'welcome') && status === 'playing';
    if (showAll) return findAllSafeMoves(built.value.board, state.session.state);
    return hintedArrow !== undefined ? [hintedArrow] : [];
  }, [assist, coach, built, hintedArrow, state.session.state, status]);

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

  const onTapArrow = useCallback(
    (index: number) => {
      if (!built?.ok) return;

      const now = Date.now();
      if (lastTap.current.index === index && now - lastTap.current.at < 60) return;
      lastTap.current = { index, at: now };

      setHintedArrow(undefined);
      setHintNotice(undefined);

      // Ask the rules what this tap does, rather than guessing from the safe-move
      // set. `findAllSafeMoves` answers a different question (is this move safe,
      // not is it legal), returns nothing at all on an unsolvable board, and costs
      // a solve per tap for information `resolveTap` already has.
      const board = built.value.board;
      const outcome = resolveTap(board, state.session.state, index);

      dispatch({ type: 'tap', board, arrowIndex: index });

      // Fired here rather than from an effect, because an effect would also fire
      // on mount and on restart, which reads as phantom noise.
      if (outcome.kind === 'blocked') {
        playSfx('blocked');
        if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else if (outcome.kind === 'escaped') {
        playSfx('release');
        if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [built, state.session.state, haptics],
  );

  const doRestart = useCallback(() => {
    if (!built?.ok) return;
    setShowRestartConfirm(false);
    setHintedArrow(undefined);
    setHintNotice(undefined);
    setOverlayVisible(false);
    dispatch({ type: 'restart', initial: built.value.initial, hearts });
  }, [built, hearts]);

  const onRestartPressed = useCallback(() => {
    const untouched = state.taps === 0;
    if (!confirmRestart || untouched || status !== 'playing') doRestart();
    else setShowRestartConfirm(true);
  }, [confirmRestart, doRestart, state.taps, status]);

  const onHint = useCallback(() => {
    if (!built?.ok || status !== 'playing') return;

    if (hintsAvailable <= 0) {
      setHintNotice(
        availability() === 'ready'
          ? 'Out of hints. Watch a short ad to earn one.'
          : 'Out of hints. Connect to earn one — or restart, which is always free.',
      );
      return;
    }

    const hint = findSafeMove(built.value.board, state.session.state);
    if (hint.kind !== 'move') {
      setHintNotice(hint.kind === 'already-won' ? 'Already cleared.' : hint.reason);
      return;
    }

    if (!spendHint()) return;
    setHintedArrow(hint.arrowIndex);
    setHintNotice(`This one can reach the edge.`);
    playSfx('tap');
  }, [built, hintsAvailable, spendHint, state.session.state, status]);

  const onEarnHint = useCallback(async () => {
    setEarning(true);
    const outcome = await showRewarded();
    setEarning(false);

    if (outcome.kind === 'earned') {
      grantHints();
      setHintNotice('Hint earned.');
    } else if (outcome.kind === 'dismissed') {
      setHintNotice('No hint earned — the ad was closed early.');
    } else {
      setHintNotice(outcome.reason);
    }
  }, [grantHints]);

  useEffect(() => {
    if (hintsAvailable === 0) preload();
  }, [hintsAvailable]);

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

  const viewportWidth = width - spacing.lg * 2;
  const viewportHeight = Math.max(220, height - CHROME_HEIGHT);
  const layout = computeBoardLayout(
    built.value.board.rows,
    built.value.board.cols,
    boardStyle.padCells,
    viewportWidth,
    viewportHeight,
    MIN_CELL_SIZE,
  );
  const adReady = availability() === 'ready';

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
        onPause={() => setPaused(true)}
      />

      <View style={styles.boardWrap}>
        <BoardViewport
          contentWidth={layout.width}
          contentHeight={layout.height}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          fitNonce={fitNonce}
        >
          <BoardCanvas
            board={built.value.board}
            state={state.session.state}
            cellSize={layout.cellSize}
            width={layout.width}
            height={layout.height}
            originX={layout.originX}
            originY={layout.originY}
            palette={palette}
            arrowStyle={arrowStyle}
            boardStyle={boardStyle}
            safeArrows={safeArrows}
            blockedArrow={state.highlight?.blocked}
            blockerArrow={state.highlight?.blocker}
            shakeNonce={state.highlight?.nonce ?? 0}
            departingArrows={state.departing}
            onDepartComplete={onDepartComplete}
            reducedMotion={reducedMotion}
            onTapArrow={onTapArrow}
            disabled={status !== 'playing'}
          />
        </BoardViewport>

        {layout.oversized ? (
          <View style={styles.panRow}>
            <Text style={[styles.panHint, { color: palette.textFaint }]}>
              {built.value.board.rows}×{built.value.board.cols} — drag to pan, pinch to zoom
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fit board to screen"
              onPress={() => setFitNonce((n) => n + 1)}
              style={({ pressed }) => [
                styles.fitButton,
                { borderColor: palette.border, backgroundColor: palette.surfaceRaised },
                pressed && styles.fitPressed,
              ]}
            >
              <Text style={[styles.fitLabel, { color: palette.textMuted }]}>Fit</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {coach ? (
        <CoachCard
          palette={palette}
          title={COACH_COPY[coach].title}
          body={COACH_COPY[coach].body}
          dismissLabel={COACH_COPY[coach].dismiss}
          onDismiss={() => markCoachSeen(coach)}
        />
      ) : (
        <Text style={[styles.message, { color: palette.textMuted }]} numberOfLines={2}>
          {hintNotice ?? state.message}
        </Text>
      )}

      <View style={styles.actions}>
        <PillButton palette={palette} label="Restart" icon="↺" onPress={onRestartPressed} />
        {hintsAvailable > 0 ? (
          <PillButton
            palette={palette}
            label={`Hint (${hintsAvailable})`}
            icon="💡"
            onPress={onHint}
            primary
          />
        ) : (
          <PillButton
            palette={palette}
            label={earning ? 'Loading…' : adReady ? 'Watch ad · +1 hint' : 'Hint'}
            icon="💡"
            onPress={adReady && !earning ? () => void onEarnHint() : onHint}
            primary
          />
        )}
      </View>

      {hintsAvailable === 0 && !adReady ? (
        <Pressable accessibilityRole="button" onPress={doRestart} style={styles.freeAlternative}>
          <Text style={[styles.freeAlternativeLabel, { color: palette.textFaint }]}>
            Restarting is always free.
          </Text>
        </Pressable>
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
        onResume={() => setPaused(false)}
        onRestart={() => {
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

  message: {
    ...typography.small,
    textAlign: 'center',
    minHeight: 36,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },

  freeAlternative: { alignSelf: 'center', padding: spacing.sm },
  freeAlternativeLabel: { ...typography.tiny },

  error: { ...typography.body, textAlign: 'center', marginBottom: spacing.lg },
  chip: { borderRadius: radius.md },
});
