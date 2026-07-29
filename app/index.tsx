/**
 * app/index.tsx — the main menu.
 *
 * Purpose:      Get the player into a level in one tap, and show what they have
 *               done so far.
 * Notes:        "Play" continues to the first level they have not cleared, which
 *               is almost always what they want. Level select is one tap away for
 *               the times it is not.
 */

import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton, Screen, useTheme } from '@components';
import { LEVEL_COUNT } from '@data/levels';
import { clearedCount, nextLevel, perfectCount, useProgressStore } from '@state/progressStore';
import { useHintStore } from '@state/hintStore';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '@theme';

export default function MenuScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const records = useProgressStore((state) => state.records);
  const hints = useHintStore((state) => state.available);

  const cleared = useMemo(() => clearedCount(records), [records]);
  const perfect = useMemo(() => perfectCount(records), [records]);
  const resume = useMemo(() => nextLevel(records, LEVEL_COUNT), [records]);
  const started = cleared > 0;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <View style={styles.hintChip}>
          <Text style={[styles.hintGlyph, { color: palette.accent }]}>💡</Text>
          <Text style={[styles.hintCount, { color: palette.text }]}>{hints}</Text>
        </View>
        <View style={styles.headerActions}>
          <IconButton
            palette={palette}
            glyph="★"
            label="Your record"
            onPress={() => router.push('/stats')}
          />
          <IconButton
            palette={palette}
            glyph="⚙"
            label="Settings"
            onPress={() => router.push('/settings')}
          />
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={[styles.wordmark, { color: palette.text }]}>ArrowPath</Text>
        <Text style={[styles.tagline, { color: palette.textMuted }]}>
          Every arrow wants out. Only some of them can go.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={started ? `Continue to level ${resume}` : 'Play level 1'}
        onPress={() => router.push(`/play/${resume}`)}
        style={({ pressed }) => [
          styles.play,
          { backgroundColor: palette.accent },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.playLabel, { color: palette.textOnAccent }]}>
          {started ? 'Continue' : 'Play'}
        </Text>
        <Text style={[styles.playSub, { color: palette.textOnAccent }]}>Level {resume}</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/levels')}
        style={({ pressed }) => [
          styles.secondary,
          { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.secondaryLabel, { color: palette.text }]}>All levels</Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Your record"
        onPress={() => router.push('/stats')}
        style={({ pressed }) => [styles.stats, pressed && styles.pressed]}
      >
        <Stat palette={palette} value={`${cleared}/${LEVEL_COUNT}`} label="cleared" />
        <Stat palette={palette} value={String(perfect)} label="perfect reads" />
      </Pressable>

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        Tap an arrow whose head has a clear straight run to the edge. Misread it and it costs a
        heart — but the board itself can never be ruined.
      </Text>
    </Screen>
  );
}

function Stat({
  palette,
  value,
  label,
}: {
  palette: ReturnType<typeof useTheme>['palette'];
  value: string;
  label: string;
}) {
  return (
    <View style={[styles.stat, { borderColor: palette.border }]}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.textFaint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  hintChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  hintGlyph: { fontSize: 16 },
  hintCount: { ...typography.heading },

  hero: { marginTop: spacing.xxl, marginBottom: spacing.xxl },
  wordmark: { ...typography.display, letterSpacing: -0.8 },
  tagline: { ...typography.body, marginTop: spacing.xs, lineHeight: 21 },

  play: {
    minHeight: 76,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  playLabel: { ...typography.title },
  playSub: { ...typography.small, opacity: 0.85, marginTop: 1 },

  secondary: {
    minHeight: MIN_TOUCH_TARGET + 8,
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { ...typography.body, fontWeight: '700' },
  pressed: { opacity: 0.65 },

  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statValue: { ...typography.title, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.tiny, marginTop: 2 },

  footnote: { ...typography.small, marginTop: spacing.xl, lineHeight: 19 },
});
