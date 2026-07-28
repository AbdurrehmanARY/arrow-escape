/**
 * EngineCheckScreen.tsx — the Phase 1 deliverable, on your phone.
 *
 * Purpose:      Two jobs. Prove the rules engine runs correctly on the device,
 *               and let you play the real mechanic — tangled snakes, five hearts,
 *               a heart lost for every misread tap.
 * Responsibilities:
 *               - Render the engine self-check report.
 *               - Render one playable tangle with the hearts HUD.
 * Notes:        Deliberately plain React Native views. The production board
 *               renderer is Phase 2 (SVG paths with rounded joins, Reanimated
 *               thread-out animation); building it here would be scope creep and
 *               would have to be thrown away. This screen exists to prove the
 *               engine and to let you feel the mechanic, not to look finished.
 */

import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';

import {
  buildLevel,
  DIR_GLYPH,
  EMPTY,
  findAllSafeMoves,
  findSafeMove,
  parseAscii,
  type PlaySession,
  startSession,
  tapArrow,
} from '@game';
import { runEngineSelfCheck } from '@game/diagnostics';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/index';

/**
 * The demo tangle: 7 snakes on an 8x8 board, 3 of them free at the start.
 *
 * Found by searching generated candidates and verified by the solver — it is
 * solvable in the order a, c, d, g, f, b, e. Its measured
 * `expectedBlindMistakes` is 10.8 against 5 hearts, which means a player who taps
 * without reading the board will reliably fail, while a player who traces each
 * head to the edge clears it without losing a single heart. That gap is the game.
 */
const DEMO_BOARD = `
  C G g g F f f .
  c c a g . e f .
  . c a . . e f f
  c c a a e e . f
  c . . a e . . .
  . d . a e . . B
  d d . A E . b b
  D . . . b b b .
`;

/** Distinct hues for trace mode. Never used to convey direction — that is the glyph's job. */
const TRACE_COLORS = [
  '#5b8dee',
  '#e0a33f',
  '#3fbf87',
  '#c678dd',
  '#e2606a',
  '#4dc4d6',
  '#d68f5b',
] as const;

const screenWidth = Dimensions.get('window').width;

export default function EngineCheckScreen() {
  const report = useMemo(() => runEngineSelfCheck(), []);

  const built = useMemo(() => {
    const result = buildLevel(parseAscii(DEMO_BOARD, { id: 1, name: 'Tangle', hearts: 5 }));
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, []);

  const { board, initial } = built;
  const [session, setSession] = useState<PlaySession>(() => startSession(initial, 5));
  const [message, setMessage] = useState('Trace a head to the edge, then tap it.');
  const [trace, setTrace] = useState(false);
  const [showSafe, setShowSafe] = useState(false);

  const safeMoves = useMemo(
    () => (showSafe && session.status === 'playing' ? findAllSafeMoves(board, session.state) : []),
    [board, session.state, session.status, showSafe],
  );

  const onTapArrow = useCallback(
    (index: number) => {
      const { session: next, outcome } = tapArrow(board, session, index);
      const id = board.arrows[index]?.id ?? '?';

      if (outcome.kind === 'escaped') {
        setMessage(`"${id}" had a clear run — the whole snake threaded out.`);
      } else if (outcome.kind === 'blocked') {
        const blocker = board.arrows[outcome.blockerIndex]?.id ?? '?';
        setMessage(`"${id}" is blocked by "${blocker}". That cost you a heart.`);
      }
      setSession(next);
    },
    [board, session],
  );

  const onRestart = useCallback(() => {
    setSession(startSession(initial, 5));
    setMessage('Board reset, hearts restored.');
  }, [initial]);

  const onHint = useCallback(() => {
    const hint = findSafeMove(board, session.state);
    if (hint.kind === 'move') setMessage(`Hint: "${hint.arrowId}" can reach the edge.`);
    else if (hint.kind === 'already-won') setMessage('Already cleared.');
    else setMessage(hint.reason);
  }, [board, session.state]);

  const cellSize = Math.floor(Math.min(screenWidth - spacing.lg * 4, 320) / board.cols);
  const boardSize = cellSize * board.cols;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>ArrowPath</Text>
        <Text style={styles.subtitle}>Phase 1 — rules engine</Text>

        {/* ---------------- The game ---------------- */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Tangle</Text>
            <View style={styles.hearts}>
              {Array.from({ length: session.maxHearts }, (_, i) => (
                <Text
                  key={i}
                  style={[styles.heart, i >= session.heartsLeft && styles.heartSpent]}
                >
                  ♥
                </Text>
              ))}
            </View>
          </View>
          <Text style={styles.caption}>
            Every snake wants to leave through its own arrowhead. Tap one whose head has a clear
            straight run to the edge — the body threads out behind it. Tap a blocked one and it
            costs a heart.
          </Text>

          <View style={[styles.board, { width: boardSize, height: boardSize }]}>
            {Array.from({ length: board.cellCount }, (_, cell) => {
              const arrowIndex = session.state.occupancy[cell] ?? EMPTY;
              const left = (cell % board.cols) * cellSize;
              const top = Math.floor(cell / board.cols) * cellSize;

              if (arrowIndex === EMPTY) {
                return (
                  <View
                    key={cell}
                    style={[styles.emptyCell, { left, top, width: cellSize, height: cellSize }]}
                  />
                );
              }

              const arrow = board.arrows[arrowIndex]!;
              const isHead = arrow.body[0] === cell;
              const isSafe = safeMoves.includes(arrowIndex);
              const bodyColor = trace
                ? TRACE_COLORS[arrowIndex % TRACE_COLORS.length]!
                : colors.arrow;

              return (
                <Pressable
                  key={cell}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isHead
                      ? `Head of arrow ${arrow.id}, pointing ${arrow.dir}`
                      : `Body of arrow ${arrow.id}`
                  }
                  onPress={() => onTapArrow(arrowIndex)}
                  style={({ pressed }) => [
                    styles.bodyCell,
                    {
                      left,
                      top,
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: bodyColor,
                    },
                    isSafe && styles.bodyCellSafe,
                    pressed && styles.bodyCellPressed,
                  ]}
                >
                  {isHead ? (
                    <Text style={[styles.headGlyph, { fontSize: cellSize * 0.72 }]}>
                      {DIR_GLYPH[arrow.dir]}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.statusBar,
              session.status === 'won' && styles.statusWon,
              session.status === 'failed' && styles.statusFailed,
            ]}
          >
            <Text style={styles.statusText}>
              {session.status === 'won'
                ? `Cleared with ${session.heartsLeft} heart${session.heartsLeft === 1 ? '' : 's'} left.`
                : session.status === 'failed'
                  ? 'Out of hearts. The board was still winnable — Restart.'
                  : `${session.state.remaining} snake${session.state.remaining === 1 ? '' : 's'} left · ${session.mistakes} mistake${session.mistakes === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.statusDetail}>{message}</Text>
          </View>

          <View style={styles.actionRow}>
            <ActionButton label="Restart" onPress={onRestart} />
            <ActionButton label="Hint" onPress={onHint} />
          </View>
          <View style={styles.actionRow}>
            <ActionButton
              label={trace ? 'Hide colours' : 'Colour snakes'}
              active={trace}
              onPress={() => setTrace((v) => !v)}
            />
            <ActionButton
              label={showSafe ? 'Hide safe' : 'Show safe'}
              active={showSafe}
              onPress={() => setShowSafe((v) => !v)}
            />
          </View>

          <Text style={styles.legend}>
            {trace
              ? 'Colours are a debug aid only — the real game draws every snake the same, which is exactly what makes tracing hard.'
              : 'All snakes look alike, as in the real game. Turn on colours if you want to see the answer.'}
          </Text>
        </View>

        {/* ---------------- Self-check ---------------- */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Engine self-check</Text>
            <View style={[styles.pill, report.failed === 0 ? styles.pillOk : styles.pillBad]}>
              <Text style={styles.pillText}>
                {report.failed === 0 ? `${report.passed} passed` : `${report.failed} failed`}
              </Text>
            </View>
          </View>
          <Text style={styles.caption}>Ran on this device in {report.durationMs} ms.</Text>

          {report.results.map((result) => (
            <View key={result.name} style={styles.checkRow}>
              <Text style={[styles.checkMark, result.passed ? styles.ok : styles.bad]}>
                {result.passed ? '✓' : '✗'}
              </Text>
              <View style={styles.checkBody}>
                <Text style={styles.checkName}>{result.name}</Text>
                <Text style={styles.checkDetail}>{result.detail}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Phase 1 of 9. Next: SVG snakes with rounded joins, the thread-out animation, and shaped
          levels.
        </Text>
      </ScrollView>
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  active = false,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        active && styles.actionButtonActive,
        pressed && styles.actionButtonPressed,
      ]}
    >
      <Text style={[styles.actionLabel, active && styles.actionLabelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl + spacing.lg, paddingBottom: spacing.xxl },

  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted, marginBottom: spacing.lg },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { ...typography.heading, color: colors.text },
  caption: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 },

  hearts: { flexDirection: 'row', gap: 2 },
  heart: { fontSize: 18, color: colors.danger },
  heartSpent: { color: colors.border },

  board: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    backgroundColor: colors.boardCellEmpty,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  emptyCell: { position: 'absolute', backgroundColor: colors.boardCellEmpty },
  bodyCell: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  bodyCellSafe: { borderWidth: 2, borderColor: colors.success },
  bodyCellPressed: { opacity: 0.55 },
  headGlyph: { color: colors.background, fontWeight: '700' },

  statusBar: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusWon: { borderColor: colors.success, backgroundColor: colors.successMuted },
  statusFailed: { borderColor: colors.danger, backgroundColor: colors.dangerMuted },
  statusText: { ...typography.body, color: colors.text, fontWeight: '600' },
  statusDetail: { ...typography.small, color: colors.textMuted, marginTop: 2, lineHeight: 18 },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  actionButtonPressed: { opacity: 0.6 },
  actionLabel: { ...typography.body, color: colors.textMuted, fontWeight: '600' },
  actionLabelActive: { color: colors.text },

  legend: { ...typography.small, color: colors.textFaint, marginTop: spacing.md, lineHeight: 18 },

  pill: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  pillOk: { backgroundColor: colors.successMuted },
  pillBad: { backgroundColor: colors.dangerMuted },
  pillText: { ...typography.small, color: colors.text, fontWeight: '600' },

  checkRow: { flexDirection: 'row', marginTop: spacing.md },
  checkMark: { width: 22, ...typography.body, fontWeight: '700' },
  ok: { color: colors.success },
  bad: { color: colors.danger },
  checkBody: { flex: 1 },
  checkName: { ...typography.body, color: colors.text },
  checkDetail: { ...typography.small, color: colors.textFaint, marginTop: 2 },

  footer: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});
