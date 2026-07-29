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

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
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
  IconButton,
  PillButton,
  Screen,
  WinOverlay,
  computeBoardLayout,
  useTheme,
} from '@components';
import { buildLevel, findAllSafeMoves, findSafeMove } from '@game';
import { LEVEL_COUNT, levelById } from '@data/levels';
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
  const built = useMemo(() => (level ? buildLevel(level) : undefined), [level]);

  const hearts = level?.hearts ?? 5;
  const [state, dispatch] = useReducer(
    gameReducer,
    built?.ok ? initGameState(built.value.initial, hearts) : undefined,
    (initial) => initial ?? initGameState({ alive: new Uint8Array(), occupancy: new Int32Array(), remaining: 0 }, hearts),
  );

  const [hintedArrow, setHintedArrow] = useState<number | undefined>(undefined);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [hintNotice, setHintNotice] = useState<string | undefined>(undefined);
  const [earning, setEarning] = useState(false);
  /**
   * The overlay waits a beat after the win so the board clearing is visible.
   *
   * This is the only piece of win presentation that needs its own state — the
   * celebration is simply "has this level been won", derived below.
   */
  const [overlayVisible, setOverlayVisible] = useState(false);

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
    if (state.session.mistakes > 0 && shouldShowCoach('firstBlock')) return 'firstBlock';
    if (state.session.heartsLeft <= 2 && shouldShowCoach('lowHearts')) return 'lowHearts';
    return undefined;
  }, [
    onboardingHydrated,
    status,
    levelId,
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

    // The celebration fires from the win itself. Only the overlay is delayed, so
    // the board clearing is visible before anything covers it.
    const timer = setTimeout(() => setOverlayVisible(true), WIN_OVERLAY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, levelId, completeLevel, state.session.mistakes, state.session.heartsLeft, haptics]);

  useEffect(() => {
    if (status !== 'failed') return;
    playSfx('fail');
    if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [status, haptics]);

  const safeArrows = useMemo(() => {
    if (!built?.ok) return [];
    // The welcome card says "the green ones can go" — so it has to make them green.
    // Words alone would leave a first-time player hunting for what the card means.
    const showAll = (assist || coach === 'welcome') && status === 'playing';
    if (showAll) return findAllSafeMoves(built.value.board, state.session.state);
    return hintedArrow !== undefined ? [hintedArrow] : [];
  }, [assist, coach, built, hintedArrow, state.session.state, status]);

  const onTapArrow = useCallback(
    (index: number) => {
      if (!built?.ok) return;
      setHintedArrow(undefined);
      setHintNotice(undefined);

      const board = built.value.board;
      const willBlock =
        state.session.status === 'playing' &&
        findAllSafeMoves(board, state.session.state).indexOf(index) === -1 &&
        !safeArrows.includes(index);

      dispatch({ type: 'tap', board, arrowIndex: index });

      // Feedback fires from the tap, not from a state effect: an effect would also
      // fire on restart and on mount, which reads as phantom noise.
      const outcome = state.departing === undefined ? willBlock : false;
      if (outcome) {
        playSfx('blocked');
        if (haptics) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        playSfx('release');
        if (haptics) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    },
    [built, state.session, state.departing, safeArrows, haptics],
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
        <PillButton palette={palette} label="Back to levels" onPress={() => router.replace('/levels')} />
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
      <View style={styles.header}>
        <IconButton palette={palette} glyph="←" label="Back to levels" onPress={() => router.replace('/levels')} />
        <View style={styles.headerRight}>
          <View style={styles.hintChip}>
            <Text style={[styles.hintGlyph, { color: palette.accent }]}>💡</Text>
            <Text style={[styles.hintCount, { color: palette.text }]}>{hintsAvailable}</Text>
          </View>
          <IconButton palette={palette} glyph="⚙" label="Settings" onPress={() => router.push('/settings')} />
        </View>
      </View>

      <Hud
        palette={palette}
        levelName={level.name}
        levelNumber={level.id}
        heartsLeft={state.session.heartsLeft}
        maxHearts={state.session.maxHearts}
        arrowsLeft={state.session.state.remaining}
      />

      <View style={styles.boardWrap}>
        <BoardViewport
          contentWidth={layout.width}
          contentHeight={layout.height}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
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
            departingArrow={state.departing}
            onDepartComplete={() => dispatch({ type: 'departed' })}
            reducedMotion={reducedMotion}
            onTapArrow={onTapArrow}
            disabled={status !== 'playing'}
          />
        </BoardViewport>

        {layout.oversized ? (
          <Text style={[styles.panHint, { color: palette.textFaint }]}>
            {built.value.board.rows}x{built.value.board.cols} — drag to pan, pinch to zoom,
            double-tap to fit
          </Text>
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
          <PillButton palette={palette} label={`Hint (${hintsAvailable})`} icon="💡" onPress={onHint} primary />
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

      <Celebration
        active={status === 'won'}
        intensity={state.session.mistakes === 0 ? 'perfect' : 'normal'}
        palette={palette}
        reducedMotion={reducedMotion}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  hintChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hintGlyph: { fontSize: 15 },
  hintCount: { ...typography.heading },

  boardWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panHint: { ...typography.tiny, marginTop: spacing.xs, textAlign: 'center' },

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
