/**
 * src/components/levels/LevelTile.tsx — one level, as a tile.
 *
 * Purpose:      Be the thing a player taps to open a level, and say without words
 *               what state that level is in.
 * Responsibilities:
 *               - Render the number, the padlock when locked, and the perfect mark.
 *               - Paint the tier stripe, which is how difficulty is read in
 *                 peripheral vision at five tiles a row.
 *               - Own `tierColor`, the tier-to-palette mapping. The chapter grid's
 *                 legend imports it from here because the legend exists to explain
 *                 exactly these stripes, so this is the module that knows them.
 * Notes:        Moved verbatim out of `app/levels.tsx`, together with the four
 *               style keys it uses and none of anyone else's.
 */

import { StyleSheet, Text, View } from 'react-native';

import { TIER_BANDS, TIER_LABELS, type DifficultyTier } from '@game';
import { ENCODED_LEVELS } from '@data';
import type { LevelRecord } from '@state';
import { radius, typography, type Palette } from '@theme';

import { Springy } from '../Pressable';
import { withClick } from '../sound';

/**
 * Tier colour, from the active palette so it reskins with the theme.
 *
 * Ten tiers share five colours, in pairs. That is not a shortcut: ten
 * distinguishable dot colours do not exist in a palette that also has to stay
 * legible for colour-blind players, and a strip of ten near-identical swatches
 * conveys less than five clear ones. The pair is separated by the tier *name*,
 * which is on the card anyway.
 */
export function tierColor(palette: Palette, tier: DifficultyTier): string {
  switch (TIER_BANDS[tier]) {
    case 1:
      return palette.success;
    case 2:
      return palette.accent;
    case 3:
      return palette.arrowBlocker;
    case 4:
      return palette.danger;
    case 5:
      return palette.text;
    default:
      return palette.border;
  }
}

/** One selectable level: its number, its tier stripe, and whether it is done. */
export function LevelTile({
  palette,
  id,
  record,
  locked,
  current,
  onPress,
}: {
  palette: Palette;
  id: number;
  record: LevelRecord | undefined;
  locked: boolean;
  current: boolean;
  onPress: () => void;
}) {
  const encoded = ENCODED_LEVELS[id - 1];
  const tier = encoded?.t ?? 'easy';
  const cleared = (record?.timesCleared ?? 0) > 0;
  const perfect = cleared && record?.bestMistakes === 0;

  return (
    <Springy
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `Level ${id}, locked`
          : `Level ${id}, ${encoded?.n ?? ''}, ${TIER_LABELS[tier]}${cleared ? ', cleared' : ''}${perfect ? ', perfect read' : ''}`
      }
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={withClick(onPress)}
      style={[
        styles.tile,
        {
          backgroundColor: cleared
            ? palette.successMuted
            : current
              ? palette.accentMuted
              : palette.surfaceRaised,
          borderColor: current ? palette.accent : palette.border,
          opacity: locked ? 0.35 : 1,
        },
      ]}
    >
      <View style={[styles.tierStripe, { backgroundColor: tierColor(palette, tier) }]} />
      <Text style={[styles.tileNumber, { color: palette.text }]}>{locked ? '🔒' : id}</Text>
      {perfect ? <Text style={[styles.perfect, { color: palette.success }]}>♥</Text> : null}
    </Springy>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tierStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  tileNumber: { ...typography.heading, fontSize: 17, fontVariant: ['tabular-nums'] },
  perfect: { position: 'absolute', bottom: 3, right: 5, fontSize: 9 },
});
