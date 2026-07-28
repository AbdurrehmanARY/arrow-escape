/**
 * GameScreen.tsx — the Phase 1 deliverable, on your phone.
 *
 * Purpose:      Play the real mechanic on a properly drawn board, and switch
 *               skins live so the theme system can be judged rather than
 *               described.
 * Responsibilities:
 *               - Own the live `PlaySession` and the transient "that tap failed"
 *                 highlight.
 *               - Wire the board, HUD, and theme picker together.
 * Notes:        The `gameReducer` proper arrives in Phase 2 along with the
 *               animations; `useState` is honest here because there is exactly
 *               one level and no transitions to sequence yet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  buildLevel,
  findAllSafeMoves,
  findSafeMove,
  parseAscii,
  type PlaySession,
  startSession,
  tapArrow,
} from '@game';
import { BoardCanvas } from '@components/BoardCanvas';
import { Hud, PillButton } from '@components/Hud';
import {
  DEFAULT_THEME_ID,
  radius,
  spacing,
  themeById,
  THEMES,
  typography,
} from '@theme';

/**
 * The demo tangle: 7 snakes on an 8x8 board, 3 of them free at the start.
 *
 * Generated and solver-verified rather than hand-authored — it clears in the
 * order a, c, d, g, f, b, e. Its measured `expectedBlindMistakes` is 10.8 against
 * 5 hearts, so a player who taps without reading fails, while a player who traces
 * each head to the edge clears it without losing one. That gap is the game.
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

/** How long a failed tap stays highlighted before the board goes quiet again. */
const BLOCK_FLASH_MS = 1400;

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function GameScreen() {
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID);
  const theme = useMemo(() => themeById(themeId), [themeId]);
  const { palette } = theme;

  const built = useMemo(() => {
    const result = buildLevel(parseAscii(DEMO_BOARD, { id: 1, name: 'Tangle', hearts: 5 }));
    if (!result.ok) throw new Error(result.error);
    return result.value;
  }, []);

  const { board, initial } = built;
  const [session, setSession] = useState<PlaySession>(() => startSession(initial, 5));
  const [message, setMessage] = useState('Find a head with a clear run to the edge.');
  const [assist, setAssist] = useState(false);
  const [flash, setFlash] = useState<{ blocked: number; blocker: number } | undefined>(undefined);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const safeArrows = useMemo(
    () => (assist && session.status === 'playing' ? findAllSafeMoves(board, session.state) : []),
    [assist, board, session.state, session.status],
  );

  const onTapArrow = useCallback(
    (index: number) => {
      const { session: next, outcome } = tapArrow(board, session, index);
      const id = board.arrows[index]?.id ?? '?';

      clearTimeout(flashTimer.current);

      if (outcome.kind === 'escaped') {
        setFlash(undefined);
        setMessage(`"${id}" had a clear run — the whole snake threaded out.`);
      } else if (outcome.kind === 'blocked') {
        const blocker = board.arrows[outcome.blockerIndex]?.id ?? '?';
        setFlash({ blocked: index, blocker: outcome.blockerIndex });
        setMessage(`"${id}" is blocked by "${blocker}" — shown in orange. That cost a heart.`);
        flashTimer.current = setTimeout(() => setFlash(undefined), BLOCK_FLASH_MS);
      }

      setSession(next);
    },
    [board, session],
  );

  const onRestart = useCallback(() => {
    clearTimeout(flashTimer.current);
    setFlash(undefined);
    setSession(startSession(initial, 5));
    setMessage('Board reset, hearts restored.');
  }, [initial]);

  const onHint = useCallback(() => {
    const hint = findSafeMove(board, session.state);
    if (hint.kind === 'move') setMessage(`Hint: "${hint.arrowId}" can reach the edge.`);
    else if (hint.kind === 'already-won') setMessage('Already cleared.');
    else setMessage(hint.reason);
  }, [board, session.state]);

  const boardWidth = screenWidth - spacing.lg * 2;
  const boardHeight = Math.min(screenHeight * 0.52, boardWidth);

  const banner =
    session.status === 'won'
      ? {
          text: `Cleared with ${session.heartsLeft} heart${session.heartsLeft === 1 ? '' : 's'} left`,
          detail:
            session.mistakes === 0
              ? 'A clean read — not a single wrong tap.'
              : `${session.mistakes} wrong tap${session.mistakes === 1 ? '' : 's'} along the way.`,
          bg: palette.successMuted,
          border: palette.success,
        }
      : session.status === 'failed'
        ? {
            text: 'Out of hearts',
            detail: 'The board was still winnable — nothing you tapped ever broke it.',
            bg: palette.dangerMuted,
            border: palette.danger,
          }
        : undefined;

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <StatusBar
        barStyle={palette.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={palette.background}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Hud
          palette={palette}
          levelName="Tangle"
          levelNumber={1}
          heartsLeft={session.heartsLeft}
          maxHearts={session.maxHearts}
          arrowsLeft={session.state.remaining}
        />

        <View style={styles.boardWrap}>
          <BoardCanvas
            board={board}
            state={session.state}
            maxWidth={boardWidth}
            maxHeight={boardHeight}
            palette={palette}
            arrowStyle={theme.arrow}
            boardStyle={theme.board}
            safeArrows={safeArrows}
            blockedArrow={flash?.blocked}
            blockerArrow={flash?.blocker}
            onTapArrow={onTapArrow}
          />
        </View>

        {banner ? (
          <View style={[styles.banner, { backgroundColor: banner.bg, borderColor: banner.border }]}>
            <Text style={[styles.bannerText, { color: palette.text }]}>{banner.text}</Text>
            <Text style={[styles.bannerDetail, { color: palette.textMuted }]}>{banner.detail}</Text>
          </View>
        ) : (
          <Text style={[styles.message, { color: palette.textMuted }]}>{message}</Text>
        )}

        <View style={styles.actionRow}>
          <PillButton palette={palette} label="Restart" icon="↺" onPress={onRestart} />
          <PillButton palette={palette} label="Hint" icon="💡" onPress={onHint} primary />
          <PillButton
            palette={palette}
            label="Assist"
            icon="◉"
            active={assist}
            onPress={() => setAssist((v) => !v)}
          />
        </View>

        {/* ---------------- Theme picker ---------------- */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: palette.text }]}>Themes</Text>
          <Text style={[styles.sectionCaption, { color: palette.textMuted }]}>
            A theme sets the palette, the arrow shape, and the board pattern independently. Adding
            one is a data entry — the renderer never branches on which theme is active.
          </Text>

          <View style={styles.themeGrid}>
            {THEMES.map((option) => {
              const selected = option.id === themeId;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setThemeId(option.id)}
                  style={({ pressed }) => [
                    styles.themeCard,
                    {
                      backgroundColor: option.palette.board,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 2 : 1,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.swatchRow}>
                    <View style={[styles.swatch, { backgroundColor: option.palette.arrow }]} />
                    <View style={[styles.swatch, { backgroundColor: option.palette.pattern }]} />
                    <View style={[styles.swatch, { backgroundColor: option.palette.heart }]} />
                  </View>
                  <Text style={[styles.themeName, { color: option.palette.text }]}>
                    {option.name}
                  </Text>
                  <Text style={[styles.themeMeta, { color: option.palette.textFaint }]}>
                    {option.arrow.head} · {option.board.pattern}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.themeDescription, { color: palette.textFaint }]}>
            {theme.description}
          </Text>
        </View>

        <Text style={[styles.footer, { color: palette.textFaint }]}>
          Phase 1 of 9 · rules engine + renderer. Next: the thread-out animation and shaped levels.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl + spacing.lg, paddingBottom: spacing.xxl },

  boardWrap: { alignItems: 'center' },

  message: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    lineHeight: 19,
    minHeight: 38,
  },

  banner: {
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  bannerText: { ...typography.heading },
  bannerDetail: { ...typography.small, marginTop: 2, textAlign: 'center' },

  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },

  section: { marginTop: spacing.xl },
  sectionTitle: { ...typography.heading },
  sectionCaption: { ...typography.small, marginTop: spacing.xs, lineHeight: 19 },

  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  themeCard: {
    width: '31%',
    flexGrow: 1,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  pressed: { opacity: 0.65 },
  swatchRow: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  themeName: { ...typography.small, fontWeight: '700' },
  themeMeta: { ...typography.tiny, marginTop: 1 },

  themeDescription: { ...typography.small, marginTop: spacing.md, lineHeight: 18 },

  footer: { ...typography.tiny, textAlign: 'center', marginTop: spacing.xl },
});
