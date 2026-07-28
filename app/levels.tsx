/**
 * app/levels.tsx — level select.
 *
 * Purpose:      Show the whole curve at a glance: what is done, what is next, and
 *               what is still locked.
 * Notes:        Levels unlock in sequence, and the unlock point is *derived* from
 *               the completed set rather than stored, so it cannot drift out of
 *               sync and strand a player (see `progressStore`).
 *
 *               A cleared level shows whether it was read cleanly. That is the
 *               only mastery marker in v0.1 and it costs nothing to offer — no
 *               stars, no scores, just "you did this without a wrong tap".
 */

import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton, Screen, useTheme } from '@components';
import { LEVELS, LEVEL_COUNT } from '@data/levels';
import { highestUnlocked, useProgressStore, type LevelRecord } from '@state/progressStore';
import { radius, spacing, typography, type Palette } from '@theme';

/** The four bands from GDD §6, used as section headings. */
function bandFor(id: number): string {
  if (id <= 10) return 'Onboarding';
  if (id <= 25) return 'Foundations';
  if (id <= 40) return 'Tightening';
  return 'Mastery';
}

export default function LevelSelectScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const records = useProgressStore((state) => state.records);

  const unlocked = useMemo(() => highestUnlocked(records, LEVEL_COUNT), [records]);

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton palette={palette} glyph="←" label="Back" onPress={() => router.back()} />
        <Text style={[styles.title, { color: palette.text }]}>Levels</Text>
        <View style={styles.headerSpacer} />
      </View>

      <FlatList
        data={LEVELS}
        keyExtractor={(level) => String(level.id)}
        numColumns={4}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => {
          const previousBand = index === 0 ? null : bandFor(LEVELS[index - 1]!.id);
          const band = bandFor(item.id);
          const record = records[item.id];
          const locked = item.id > unlocked;

          return (
            <>
              {band !== previousBand ? (
                <Text style={[styles.band, { color: palette.textFaint }]}>{band}</Text>
              ) : null}
              <LevelTile
                palette={palette}
                id={item.id}
                name={item.name}
                record={record}
                locked={locked}
                current={item.id === unlocked}
                onPress={() => router.push(`/play/${item.id}`)}
              />
            </>
          );
        }}
      />
    </Screen>
  );
}

function LevelTile({
  palette,
  id,
  name,
  record,
  locked,
  current,
  onPress,
}: {
  palette: Palette;
  id: number;
  name: string;
  record: LevelRecord | undefined;
  locked: boolean;
  current: boolean;
  onPress: () => void;
}) {
  const cleared = (record?.timesCleared ?? 0) > 0;
  const perfect = cleared && record?.bestMistakes === 0;

  const background = cleared
    ? palette.successMuted
    : current
      ? palette.accentMuted
      : palette.surfaceRaised;
  const borderColor = perfect
    ? palette.success
    : current
      ? palette.accent
      : palette.border;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `Level ${id}, locked`
          : `Level ${id}, ${name}${cleared ? ', cleared' : ''}${perfect ? ', perfect read' : ''}`
      }
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: background, borderColor, opacity: locked ? 0.4 : 1 },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.tileNumber, { color: palette.text }]}>{locked ? '🔒' : id}</Text>
      <Text numberOfLines={1} style={[styles.tileName, { color: palette.textFaint }]}>
        {locked ? '' : name}
      </Text>
      {perfect ? <Text style={[styles.perfect, { color: palette.success }]}>♥</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 44 },
  title: { ...typography.title },

  list: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  row: { gap: spacing.sm, marginBottom: spacing.sm },
  band: {
    ...typography.tiny,
    letterSpacing: 1.2,
    width: '100%',
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },

  tile: {
    flexGrow: 1,
    flexBasis: 0,
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.6 },
  tileNumber: { ...typography.heading, fontSize: 19, fontVariant: ['tabular-nums'] },
  tileName: { ...typography.tiny, fontSize: 9, marginTop: 1 },
  perfect: { position: 'absolute', top: 4, right: 6, fontSize: 10 },
});
