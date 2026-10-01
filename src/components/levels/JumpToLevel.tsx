/**
 * src/components/levels/JumpToLevel.tsx — straight to a level by number.
 *
 * Purpose:      Let someone reach level 106 without tapping through 106 tiles.
 * Responsibilities:
 *               - Own the number field, its validation against `LEVEL_COUNT`, and
 *                 the Go button that stays disabled until the number is real.
 * Notes:        Only rendered while `UNLOCK_ALL_LEVELS` is on. Reaching a level by
 *               tapping through chapters is fine for a player working forward and
 *               miserable for someone checking one specific board.
 *
 *               Moved verbatim out of `app/levels.tsx`, together with the six
 *               style keys it uses and none of anyone else's.
 */

import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { LEVEL_COUNT } from '@data';
import { radius, spacing, typography, type Palette } from '@theme';

import { Springy } from '../Pressable';
import { withClick } from '../sound';

/** Straight to a level by number. */
export function JumpToLevel({ palette, onJump }: { palette: Palette; onJump: (id: number) => void }) {
  const [text, setText] = useState('');
  const parsed = Number(text);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= LEVEL_COUNT;

  return (
    <View
      style={[
        styles.testingBar,
        { backgroundColor: palette.accentMuted, borderColor: palette.accent },
      ]}
    >
      <Text style={[styles.testingLabel, { color: palette.text }]}>TESTING · all levels open</Text>
      <View style={styles.jumpRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          keyboardType="number-pad"
          placeholder={`1-${LEVEL_COUNT}`}
          placeholderTextColor={palette.textFaint}
          accessibilityLabel="Level number to jump to"
          returnKeyType="go"
          onSubmitEditing={() => valid && onJump(parsed)}
          style={[
            styles.jumpInput,
            {
              backgroundColor: palette.surfaceRaised,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />
        <Springy
          accessibilityRole="button"
          accessibilityLabel="Go to level"
          accessibilityState={{ disabled: !valid }}
          disabled={!valid}
          onPress={withClick(() => onJump(parsed))}
          style={[
            styles.jumpGo,
            { backgroundColor: palette.accent, opacity: valid ? 1 : 0.4 },
          ]}
        >
          <Text style={[styles.jumpGoLabel, { color: palette.textOnAccent }]}>Go</Text>
        </Springy>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  testingBar: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  testingLabel: { ...typography.tiny, letterSpacing: 1 },
  jumpRow: { flexDirection: 'row', gap: spacing.sm },
  jumpInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  jumpGo: {
    width: 62,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  jumpGoLabel: { ...typography.body, fontWeight: '700' },
});
