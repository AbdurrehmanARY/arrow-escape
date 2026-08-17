/**
 * PauseMenu.tsx — the sheet behind the pause button.
 *
 * Purpose:      Give the play screen one door out to everything that is not
 *               tapping an arrow, so the board is not surrounded by chrome.
 * Responsibilities:
 *               - `PauseMenu` — level identity, progress, and the four actions
 *                 that lead away from the board.
 * Notes:        This exists as much to *remove* things as to add them. The play
 *               screen used to carry a back button, a settings button and a hint
 *               chip across its top edge, all of them one mis-tap away from the
 *               board and none of them wanted mid-move. They live here now, and
 *               the top edge carries one button.
 *
 *               There is no clock in this game, so "pause" is a slight misnomer —
 *               nothing is running. It is still the right word on the button,
 *               because it is the word players look for when they want to stop and
 *               do something else, and inventing a truer one ("Menu", "More")
 *               would be accurate and useless.
 *
 *               Restart is deliberately *not* the primary action. It is the most
 *               destructive thing on this sheet, and a sheet that opens with the
 *               destructive option highlighted trains people to tap it by reflex.
 */

import { memo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, type Palette, radius, spacing, typography } from '@theme';

import { Springy, useGlow } from './Pressable';
import { withClick } from './sound';

export interface PauseMenuProps {
  palette: Palette;
  visible: boolean;
  levelNumber: number;
  levelName: string;
  /** Human-readable tier, e.g. "Super Hard". Shown so the label earns its keep. */
  tierLabel: string;
  boardRows: number;
  boardCols: number;
  arrowsLeft: number;
  arrowsTotal: number;
  heartsLeft: number;
  maxHearts: number;
  onResume: () => void;
  onRestart: () => void;
  onSettings: () => void;
  onLevels: () => void;
}

export const PauseMenu = memo(function PauseMenu({
  palette,
  visible,
  levelNumber,
  levelName,
  tierLabel,
  boardRows,
  boardCols,
  arrowsLeft,
  arrowsTotal,
  heartsLeft,
  maxHearts,
  onResume,
  onRestart,
  onSettings,
  onLevels,
}: PauseMenuProps) {
  const cleared = arrowsTotal - arrowsLeft;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      {/*
        Tapping the scrim resumes. A paused game is the one modal state where the
        obvious escape gesture should be the harmless one — everything else on this
        sheet takes you somewhere, and nobody opens a pause menu intending to lose
        their place.
      */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Resume"
        onPress={onResume}
        style={styles.scrim}
      >
        {/* Swallows taps so hitting the sheet itself does not dismiss it. */}
        <Pressable
          onPress={() => undefined}
          style={[styles.sheet, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
          <Text style={[styles.eyebrow, { color: palette.textFaint }]}>
            LEVEL {levelNumber} · {tierLabel.toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: palette.text }]}>{levelName}</Text>

          <View style={styles.stats}>
            <Stat
              palette={palette}
              value={`${cleared}/${arrowsTotal}`}
              label="arrows out"
              progress={arrowsTotal === 0 ? 0 : cleared / arrowsTotal}
            />
            <Stat palette={palette} value={`${heartsLeft}/${maxHearts}`} label="hearts left" />
            <Stat palette={palette} value={`${boardRows}×${boardCols}`} label="board" />
          </View>

          <ResumeButton palette={palette} onPress={onResume} />

          <View style={styles.row}>
            <Secondary palette={palette} label="Restart" glyph="↺" onPress={onRestart} />
            <Secondary palette={palette} label="Settings" glyph="⚙" onPress={onSettings} />
          </View>

          <Pressable accessibilityRole="button" onPress={withClick(onLevels)} style={styles.leave}>
            <Text style={[styles.leaveLabel, { color: palette.textMuted }]}>
              Leave for level select
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

/**
 * One figure from the level in progress.
 *
 * The arrows-out tile carries a bar as well as a number, because "31/48" needs
 * arithmetic and a bar does not. The other two are genuinely just numbers, so they
 * do not get one — a progress bar under a board size would be decoration wearing
 * the costume of information.
 */
function Stat({
  palette,
  value,
  label,
  progress,
}: {
  palette: Palette;
  value: string;
  label: string;
  progress?: number;
}) {
  return (
    <View style={[styles.stat, { borderColor: palette.border }]}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.textFaint }]}>{label}</Text>
      {progress === undefined ? null : (
        <View style={[styles.track, { backgroundColor: palette.border }]}>
          <View
            style={[
              styles.fill,
              {
                backgroundColor: palette.accent,
                width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

/**
 * The sheet's one primary action, and the only thing on it that glows.
 *
 * Its own component so the glow hook has somewhere to live — `PauseMenu` is
 * memoised and a hook call inside the sheet's body would run on every render of
 * a modal that is usually closed.
 */
function ResumeButton({ palette, onPress }: { palette: Palette; onPress: () => void }) {
  const elevation = useGlow(palette.accent, 'primary');

  return (
    <Springy
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.resume, { backgroundColor: palette.accent }, elevation]}
    >
      <Text style={[styles.resumeLabel, { color: palette.textOnAccent }]}>Resume</Text>
    </Springy>
  );
}

function Secondary({
  palette,
  label,
  glyph,
  onPress,
}: {
  palette: Palette;
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Springy
      accessibilityRole="button"
      onPress={withClick(onPress)}
      style={[
        styles.secondary,
        { backgroundColor: palette.surfaceRaised, borderColor: palette.border },
      ]}
    >
      <Text style={[styles.secondaryGlyph, { color: palette.textMuted }]}>{glyph}</Text>
      <Text style={[styles.secondaryLabel, { color: palette.text }]}>{label}</Text>
    </Springy>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },

  eyebrow: { ...typography.tiny, letterSpacing: 1.1 },
  title: { ...typography.title, marginTop: 2 },

  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  stat: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  statValue: { ...typography.heading, fontVariant: ['tabular-nums'] },
  statLabel: { ...typography.tiny, marginTop: 1, textAlign: 'center' },
  track: { height: 3, borderRadius: radius.pill, alignSelf: 'stretch', marginTop: spacing.xs },
  fill: { height: 3, borderRadius: radius.pill },

  resume: {
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  resumeLabel: { ...typography.heading, fontSize: 17 },

  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  secondary: {
    flexGrow: 1,
    flexBasis: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  secondaryGlyph: { fontSize: 15 },
  secondaryLabel: { ...typography.body, fontWeight: '700' },

  leave: { alignSelf: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  leaveLabel: { ...typography.small },

});
