/**
 * src/components/levels/ChapterGrid.tsx — one chapter's fifty levels, as a grid.
 *
 * Purpose:      Show a single chapter as rows of tiles, virtualised so jumping
 *               inside a fifty-level chapter costs no measuring.
 * Responsibilities:
 *               - Chunk the chapter into fixed-width rows.
 *               - Lay the rows out without measuring, using a fixed row height.
 *               - Draw the tier legend above the grid.
 * Notes:        Owns `COLUMNS`, `ROW_HEIGHT`, `Row` and `LEGEND_TIERS` because it
 *               is the only consumer of all four — the row height in particular is
 *               what lets `getItemLayout` answer without measuring, and it is only
 *               meaningful alongside the grid it lays out.
 *
 *               Moved verbatim out of `app/levels.tsx`, together with the seven
 *               style keys it uses and none of anyone else's.
 */

import { useCallback, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { TIER_LABELS, type DifficultyTier } from '@game';
import type { Chapter } from '@data';
import type { LevelRecord } from '@state';
import { spacing, typography, type Palette } from '@theme';

import { LevelTile, tierColor } from './LevelTile';

const COLUMNS = 5;
/** Fixed so the list can lay out rows without measuring any of them. */
const ROW_HEIGHT = 74;

interface Row {
  readonly key: string;
  readonly ids: number[];
}

/**
 * The tiers shown in the legend.
 *
 * One per colour band rather than all ten, because a legend is a key to the dots
 * and there are only five of those. The names shown are the *lower* of each pair,
 * so the legend reads as a floor — "Hard and up is orange" — rather than
 * pretending Tricky and Hard look different.
 */
const LEGEND_TIERS: readonly DifficultyTier[] = [
  'tutorial',
  'casual',
  'tricky',
  'superHard',
  'brutal',
];

/** One chapter's levels, in rows of `COLUMNS`, with the tier legend above. */
export function ChapterGrid({
  palette,
  chapter,
  records,
  unlocked,
  current,
  onOpenLevel,
}: {
  palette: Palette;
  chapter: Chapter;
  records: Record<number, LevelRecord>;
  unlocked: number;
  current: number;
  onOpenLevel: (id: number) => void;
}) {
  const listRef = useRef<FlatList<Row>>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (let id = chapter.firstLevel; id <= chapter.lastLevel; id += COLUMNS) {
      const ids: number[] = [];
      for (let c = 0; c < COLUMNS && id + c <= chapter.lastLevel; c += 1) ids.push(id + c);
      out.push({ key: `r${id}`, ids });
    }
    return out;
  }, [chapter]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<Row> | null | undefined, index: number) => ({
      length: ROW_HEIGHT,
      offset: ROW_HEIGHT * index,
      index,
    }),
    [],
  );

  return (
    <>
      <View style={styles.legend}>
        {LEGEND_TIERS.map((tier) => (
          <View key={tier} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: tierColor(palette, tier) }]} />
            <Text style={[styles.legendLabel, { color: palette.textFaint }]}>
              {TIER_LABELS[tier]}+
            </Text>
          </View>
        ))}
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(row) => row.key}
        getItemLayout={getItemLayout}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            {item.ids.map((id) => (
              <LevelTile
                key={id}
                palette={palette}
                id={id}
                record={records[id]}
                locked={id > unlocked}
                current={id === current}
                onPress={() => onOpenLevel(id)}
              />
            ))}
            {/* Keep the final row's tiles the same width as every other row. */}
            {Array.from({ length: COLUMNS - item.ids.length }, (_, i) => (
              <View key={`pad${i}`} style={styles.tilePad} />
            ))}
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', gap: spacing.sm, height: ROW_HEIGHT, paddingVertical: spacing.xs },
  tilePad: { flexGrow: 1, flexBasis: 0 },
});
