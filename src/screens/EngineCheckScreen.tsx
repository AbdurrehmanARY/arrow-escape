/**
 * EngineCheckScreen.tsx — the Phase 1 deliverable, on your phone.
 *
 * Purpose:      Two jobs. Prove the rules engine runs correctly on the device,
 *               and let a human feel the difference between the two rule variants
 *               so the open design question can be settled by playing rather than
 *               by argument.
 * Responsibilities:
 *               - Render the engine self-check report.
 *               - Render one small interactive board with a variant switch.
 * Notes:        Deliberately plain React Native views. The real board renderer is
 *               Phase 2 (SVG glyphs + Reanimated release animation); building it
 *               here would be scope creep and would have to be thrown away. This
 *               screen exists to answer a question, not to look like the game.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  applyOutcome,
  buildLevel,
  type BoardState,
  colOf,
  ESCAPED,
  findAllSafeMoves,
  findSafeMove,
  getStatus,
  parseAscii,
  resolveTap,
  rowOf,
  type RuleVariant,
} from '@game';
import { runEngineSelfCheck } from '@game/diagnostics';
import { colors, MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme/index';

/**
 * The comparison board.
 *
 * Under `escape-only` every tap order clears it. Under `slide-and-stop` one of
 * the two opening taps loses immediately. Same arrows, same layout — the only
 * difference is the rule.
 */
const DEMO_BOARD = `
  . v <
  > > .
  . . ^
`;

const GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶' } as const;

const screenWidth = Dimensions.get('window').width;

export default function EngineCheckScreen() {
  const report = useMemo(() => runEngineSelfCheck(), []);
  const [variant, setVariant] = useState<RuleVariant>('escape-only');
  const [showSafe, setShowSafe] = useState(true);

  const built = useMemo(() => {
    const result = buildLevel(parseAscii(DEMO_BOARD, { variant, name: 'Demo' }));
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, [variant]);

  const [state, setState] = useState<BoardState>(built.initial);
  const [lastMessage, setLastMessage] = useState<string>('Tap an arrow.');

  // Switching variant rebuilds the board, so reset play state alongside it.
  const [builtRef, setBuiltRef] = useState(built);
  if (builtRef !== built) {
    setBuiltRef(built);
    setState(built.initial);
    setLastMessage('Tap an arrow.');
  }

  const { board } = built;
  const status = getStatus(board, state);
  const safeMoves = useMemo(
    () => (showSafe && status === 'playing' ? findAllSafeMoves(board, state) : []),
    [board, state, showSafe, status],
  );

  const onTapArrow = useCallback(
    (index: number) => {
      const outcome = resolveTap(board, state, index);
      switch (outcome.kind) {
        case 'escaped':
          setLastMessage(`${board.arrows[index]!.id} escaped.`);
          break;
        case 'moved':
          setLastMessage(`${board.arrows[index]!.id} slid forward and stopped.`);
          break;
        case 'blocked':
          setLastMessage(
            `${board.arrows[index]!.id} is blocked by ${board.arrows[outcome.blockerIndex]!.id}.`,
          );
          break;
        case 'invalid':
          setLastMessage(`Ignored: ${outcome.reason}.`);
          break;
      }
      setState((current) => applyOutcome(current, outcome));
    },
    [board, state],
  );

  const onRestart = useCallback(() => {
    setState(built.initial);
    setLastMessage('Board reset.');
  }, [built]);

  const onHint = useCallback(() => {
    const hint = findSafeMove(board, state);
    if (hint.kind === 'move') setLastMessage(`Hint: tap ${hint.arrowId}.`);
    else if (hint.kind === 'already-won') setLastMessage('Already cleared.');
    else setLastMessage(hint.reason);
  }, [board, state]);

  const cellSize = Math.floor(Math.min(screenWidth - spacing.xl * 2, 264) / board.cols);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>ArrowPath</Text>
        <Text style={styles.subtitle}>Phase 1 — rules engine</Text>

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

        {/* ---------------- Variant comparison ---------------- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Which rule should ArrowPath ship?</Text>
          <Text style={styles.caption}>
            Same board, same arrows. Play it under both rules — the difference is the whole game.
          </Text>

          <View style={styles.toggleRow}>
            <VariantButton
              label="escape-only"
              hint="The GDD rule"
              active={variant === 'escape-only'}
              onPress={() => setVariant('escape-only')}
            />
            <VariantButton
              label="slide-and-stop"
              hint="Blocked arrows move"
              active={variant === 'slide-and-stop'}
              onPress={() => setVariant('slide-and-stop')}
            />
          </View>

          <Text style={styles.variantBlurb}>
            {variant === 'escape-only'
              ? 'A blocked arrow does nothing. Try to lose this board — you cannot. Every tap order clears it.'
              : 'A blocked arrow slides up against whatever stopped it. Tap the bottom-right arrow first and the board is unwinnable.'}
          </Text>

          <View style={[styles.board, { width: cellSize * board.cols }]}>
            {Array.from({ length: board.rows * board.cols }, (_, cell) => {
              const arrowIndex = state.occupancy[cell] ?? ESCAPED;
              const isSafe = safeMoves.includes(arrowIndex);
              const isTrap =
                showSafe &&
                status === 'playing' &&
                arrowIndex !== ESCAPED &&
                !isSafe &&
                resolveTap(board, state, arrowIndex).kind !== 'blocked';

              return (
                <View
                  key={cell}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    {
                      left: colOf(cell, board.cols) * cellSize,
                      top: rowOf(cell, board.cols) * cellSize,
                    },
                  ]}
                >
                  {arrowIndex === ESCAPED ? (
                    <View style={styles.cellEmpty} />
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Arrow ${board.arrows[arrowIndex]!.id} pointing ${board.arrows[arrowIndex]!.dir}`}
                      onPress={() => onTapArrow(arrowIndex)}
                      style={({ pressed }) => [
                        styles.arrowCell,
                        isSafe && styles.arrowCellSafe,
                        isTrap && styles.arrowCellTrap,
                        pressed && styles.arrowCellPressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.arrowGlyph,
                          { fontSize: cellSize * 0.42 },
                          isSafe && styles.arrowGlyphSafe,
                          isTrap && styles.arrowGlyphTrap,
                        ]}
                      >
                        {GLYPH[board.arrows[arrowIndex]!.dir]}
                      </Text>
                      <Text style={styles.arrowId}>{board.arrows[arrowIndex]!.id}</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>

          <View
            style={[
              styles.statusBar,
              status === 'won' && styles.statusWon,
              status === 'deadlocked' && styles.statusDead,
            ]}
          >
            <Text style={styles.statusText}>
              {status === 'won'
                ? 'Cleared — board empty.'
                : status === 'deadlocked'
                  ? 'Deadlocked. Nothing can move. Restart.'
                  : `Playing — ${state.remaining} arrow${state.remaining === 1 ? '' : 's'} left.`}
            </Text>
            <Text style={styles.statusDetail}>{lastMessage}</Text>
          </View>

          <View style={styles.actionRow}>
            <ActionButton label="Restart" onPress={onRestart} />
            <ActionButton label="Hint" onPress={onHint} />
            <ActionButton
              label={showSafe ? 'Hide safe' : 'Show safe'}
              onPress={() => setShowSafe((v) => !v)}
            />
          </View>

          {showSafe ? (
            <Text style={styles.legend}>
              Green = safe to tap. Red = legal, but loses the level. Under escape-only nothing is
              ever red — that is the finding.
            </Text>
          ) : null}
        </View>

        <Text style={styles.footer}>
          Phase 1 of 9. Next: the real board renderer with SVG arrows and release animation.
        </Text>
      </ScrollView>
    </View>
  );
}

function VariantButton({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.variantButton, active && styles.variantButtonActive]}
    >
      <Text style={[styles.variantLabel, active && styles.variantLabelActive]}>{label}</Text>
      <Text style={styles.variantHint}>{hint}</Text>
    </Pressable>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
    >
      <Text style={styles.actionLabel}>{label}</Text>
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
  caption: { ...typography.small, color: colors.textMuted, marginTop: spacing.xs },

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

  toggleRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  variantButton: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  variantButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  variantLabel: { ...typography.body, color: colors.textMuted, fontWeight: '600' },
  variantLabelActive: { color: colors.text },
  variantHint: { ...typography.small, color: colors.textFaint, marginTop: 2 },

  variantBlurb: { ...typography.small, color: colors.textMuted, marginTop: spacing.md, lineHeight: 19 },

  board: { alignSelf: 'center', marginTop: spacing.lg, aspectRatio: 1 },
  cell: { position: 'absolute', padding: 3 },
  cellEmpty: { flex: 1, borderRadius: radius.sm, backgroundColor: colors.boardCellEmpty },
  arrowCell: {
    flex: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.boardCell,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCellSafe: { borderColor: colors.arrowSafe, backgroundColor: colors.successMuted },
  arrowCellTrap: { borderColor: colors.arrowTrap, backgroundColor: colors.dangerMuted },
  arrowCellPressed: { opacity: 0.6 },
  arrowGlyph: { color: colors.arrow },
  arrowGlyphSafe: { color: colors.arrowSafe },
  arrowGlyphTrap: { color: colors.arrowTrap },
  arrowId: { ...typography.small, fontSize: 10, color: colors.textFaint, marginTop: 1 },

  statusBar: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusWon: { borderColor: colors.success, backgroundColor: colors.successMuted },
  statusDead: { borderColor: colors.danger, backgroundColor: colors.dangerMuted },
  statusText: { ...typography.body, color: colors.text, fontWeight: '600' },
  statusDetail: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
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
  actionButtonPressed: { opacity: 0.6 },
  actionLabel: { ...typography.body, color: colors.text, fontWeight: '600' },

  legend: { ...typography.small, color: colors.textFaint, marginTop: spacing.md, lineHeight: 18 },

  footer: { ...typography.small, color: colors.textFaint, textAlign: 'center' },
});
