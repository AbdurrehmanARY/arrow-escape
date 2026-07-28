/**
 * app/levels.tsx — level select.
 *
 * Purpose:      Navigate 600 levels without it feeling like a spreadsheet.
 * Notes:        Two things change at this scale. The list has to be virtualised
 *               with a fixed row height, or scrolling 600 tiles stutters — hence
 *               `getItemLayout`, which lets it jump without measuring. And it has
 *               to open *where the player is*, because scrolling to level 400 by
 *               hand every session is nobody's idea of a menu.
 *
 *               Tier is shown as a colour stripe rather than a word. At five
 *               tiles per row a label is unreadable, but a stripe is legible in
 *               peripheral vision — and it makes the mixed curve visible, which is
 *               a design point rather than an accident.
 *
 *               Unlocking is *derived* from the completed set rather than stored,
 *               so it cannot drift and strand a player outside a level they have
 *               already finished.
 */

import { useCallback, useMemo, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton, Screen, useTheme } from '@components';
import { TIER_LABELS, type DifficultyTier } from '@game/codec';
import { ENCODED_LEVELS, LEVEL_COUNT } from '@data/levels';
import { highestUnlocked, useProgressStore, type LevelRecord } from '@state/progressStore';
import { radius, spacing, typography, type Palette } from '@theme';

const COLUMNS = 5;
const TILE_MARGIN = spacing.sm;
/** Fixed so the list can lay out 600 rows without measuring any of them. */
const ROW_HEIGHT = 74;

interface Row {
  readonly key: string;
  readonly ids: number[];
}

/** Tier colour, from the active palette so it reskins with the theme. */
function tierColor(palette: Palette, tier: DifficultyTier): string {
  switch (tier) {
    case 'easy':
      return palette.success;
    case 'medium':
      return palette.accent;
    case 'hard':
      return palette.arrowBlocker;
    case 'superHard':
      return palette.danger;
    case 'extremeHard':
      return palette.text;
    default:
      return palette.border;
  }
}

export default function LevelSelectScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const records = useProgressStore((state) => state.records);
  const listRef = useRef<FlatList<Row>>(null);

  const unlocked = useMemo(() => highestUnlocked(records, LEVEL_COUNT), [records]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let i = 0; i < LEVEL_COUNT; i += COLUMNS) {
      const ids: number[] = [];
      for (let c = 0; c < COLUMNS && i + c < LEVEL_COUNT; c += 1) ids.push(i + c + 1);
      out.push({ key: `r${i}`, ids });
    }
    return out;
  }, []);

  // Open a couple of rows above where the player got to, so the next level is
  // visible with a little context rather than pinned to the very top edge.
  const initialIndex = Math.max(0, Math.floor((unlocked - 1) / COLUMNS) - 2);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton palette={palette} glyph="←" label="Back" onPress={() => router.back()} />
        <View style={styles.headerCentre}>
          <Text style={[styles.title, { color: palette.text }]}>Levels</Text>
          <Text style={[styles.subtitle, { color: palette.textFaint }]}>
            {unlocked - 1} of {LEVEL_COUNT} cleared
          </Text>
        </View>
        <IconButton
          palette={palette}
          glyph="⌖"
          label="Jump to current level"
          onPress={() =>
            listRef.current?.scrollToIndex({ index: initialIndex, animated: true })
          }
        />
      </View>

      <View style={styles.legend}>
        {(['easy', 'medium', 'hard', 'superHard', 'extremeHard'] as DifficultyTier[]).map(
          (tier) => (
            <View key={tier} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: tierColor(palette, tier) }]} />
              <Text style={[styles.legendLabel, { color: palette.textFaint }]}>
                {TIER_LABELS[tier]}
              </Text>
            </View>
          ),
        )}
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemLayout={getItemLayout}
        initialScrollIndex={initialIndex}
        initialNumToRender={14}
        windowSize={9}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        // A failed scroll (list not laid out yet) must not be fatal; retry once
        // the frames exist rather than leaving the player at the top of 600 rows.
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 120);
        }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.ids.map((id) => (
              <LevelTile
                key={id}
                palette={palette}
                id={id}
                record={records[id]}
                locked={id > unlocked}
                current={id === unlocked}
                onPress={() => router.push(`/play/${id}`)}
              />
            ))}
            {/* Keep the final row's tiles the same width as every other row. */}
            {Array.from({ length: COLUMNS - item.ids.length }, (_, i) => (
              <View key={`pad${i}`} style={styles.tilePad} />
            ))}
          </View>
        )}
      />
    </Screen>
  );
}

function LevelTile({
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        locked
          ? `Level ${id}, locked`
          : `Level ${id}, ${encoded?.n ?? ''}, ${TIER_LABELS[tier]}${cleared ? ', cleared' : ''}${perfect ? ', perfect read' : ''}`
      }
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
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
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.tierStripe, { backgroundColor: tierColor(palette, tier) }]} />
      <Text style={[styles.tileNumber, { color: palette.text }]}>{locked ? '🔒' : id}</Text>
      {perfect ? <Text style={[styles.perfect, { color: palette.success }]}>♥</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCentre: { alignItems: 'center' },
  title: { ...typography.title },
  subtitle: { ...typography.tiny, marginTop: 1 },

  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 3 },
  legendLabel: { ...typography.tiny },

  list: { paddingBottom: spacing.xxl },
  row: { flexDirection: 'row', gap: TILE_MARGIN, height: ROW_HEIGHT, paddingVertical: spacing.xs },

  tile: {
    flexGrow: 1,
    flexBasis: 0,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tilePad: { flexGrow: 1, flexBasis: 0 },
  pressed: { opacity: 0.6 },
  tierStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  tileNumber: { ...typography.heading, fontSize: 17, fontVariant: ['tabular-nums'] },
  perfect: { position: 'absolute', bottom: 3, right: 5, fontSize: 9 },
});
