/**
 * app/levels.tsx — level select.
 *
 * Purpose:      Navigate 600 levels without it feeling like a spreadsheet.
 * Notes:        Two views, because 600 tiles is not a list anyone reads. The
 *               chapter view gives twelve landmarks with progress; opening one
 *               shows its fifty levels. "Halfway through Deep Water" is a
 *               position a player can hold in their head; "level 287" is not.
 *
 *               The grid is virtualised with a fixed row height so it can jump
 *               without measuring, and it opens where the player actually is.
 *
 *               Tier is a colour stripe rather than a word: at five tiles per row
 *               a label is unreadable, but a stripe is legible in peripheral
 *               vision — and it makes the mixed curve visible, which is a design
 *               point rather than an accident.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { IconButton, Screen, useTheme } from '@components';
import { TIER_LABELS, type DifficultyTier } from '@game/codec';
import { ENCODED_LEVELS, LEVEL_COUNT } from '@data/levels';
import {
  CHAPTERS,
  chapterOf,
  chapterProgress,
  isChapterOpen,
  type Chapter,
} from '@data/chapters';
import {
  highestUnlocked,
  isCleared,
  useProgressStore,
  type LevelRecord,
} from '@state/progressStore';
import { radius, spacing, typography, type Palette } from '@theme';

const COLUMNS = 5;
/** Fixed so the list can lay out rows without measuring any of them. */
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

  const unlocked = useMemo(() => highestUnlocked(records, LEVEL_COUNT), [records]);
  const cleared = useCallback((id: number) => isCleared(records, id), [records]);

  // Open on the chapter the player is actually in, not chapter one.
  const [openChapter, setOpenChapter] = useState<Chapter | null>(null);

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton
          palette={palette}
          glyph="←"
          label={openChapter ? 'Back to chapters' : 'Back'}
          onPress={() => (openChapter ? setOpenChapter(null) : router.back())}
        />
        <View style={styles.headerCentre}>
          <Text style={[styles.title, { color: palette.text }]}>
            {openChapter ? openChapter.name : 'Levels'}
          </Text>
          <Text style={[styles.subtitle, { color: palette.textFaint }]}>
            {openChapter
              ? openChapter.tagline
              : `${unlocked - 1} of ${LEVEL_COUNT} cleared`}
          </Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {openChapter ? (
        <ChapterGrid
          palette={palette}
          chapter={openChapter}
          records={records}
          unlocked={unlocked}
          onOpenLevel={(id) => router.push(`/play/${id}`)}
        />
      ) : (
        <ChapterList
          palette={palette}
          unlocked={unlocked}
          isLevelCleared={cleared}
          onOpen={setOpenChapter}
        />
      )}
    </Screen>
  );
}

function ChapterList({
  palette,
  unlocked,
  isLevelCleared,
  onOpen,
}: {
  palette: Palette;
  unlocked: number;
  isLevelCleared: (id: number) => boolean;
  onOpen: (chapter: Chapter) => void;
}) {
  const current = chapterOf(unlocked);

  return (
    <ScrollView contentContainerStyle={styles.chapterList} showsVerticalScrollIndicator={false}>
      {CHAPTERS.map((chapter) => {
        const open = isChapterOpen(chapter, unlocked);
        const { cleared, total } = chapterProgress(chapter, isLevelCleared);
        const isCurrent = chapter.index === current.index;
        const done = cleared === total;

        return (
          <Pressable
            key={chapter.index}
            accessibilityRole="button"
            accessibilityLabel={
              open
                ? `${chapter.name}, ${cleared} of ${total} cleared`
                : `${chapter.name}, locked`
            }
            accessibilityState={{ disabled: !open }}
            disabled={!open}
            onPress={() => onOpen(chapter)}
            style={({ pressed }) => [
              styles.chapterCard,
              {
                backgroundColor: done
                  ? palette.successMuted
                  : isCurrent
                    ? palette.accentMuted
                    : palette.surface,
                borderColor: isCurrent ? palette.accent : palette.border,
                opacity: open ? 1 : 0.4,
              },
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.chapterHead}>
              <Text style={[styles.chapterIndex, { color: palette.textFaint }]}>
                {String(chapter.index + 1).padStart(2, '0')}
              </Text>
              <View style={styles.chapterText}>
                <Text style={[styles.chapterName, { color: palette.text }]}>
                  {open ? chapter.name : 'Locked'}
                </Text>
                <Text style={[styles.chapterTagline, { color: palette.textFaint }]}>
                  {open ? chapter.tagline : `Clear level ${chapter.firstLevel - 1} to open`}
                </Text>
              </View>
              <Text style={[styles.chapterCount, { color: palette.textMuted }]}>
                {open ? `${cleared}/${total}` : ''}
              </Text>
            </View>

            {open ? (
              <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: done ? palette.success : palette.accent,
                      width: `${(cleared / total) * 100}%`,
                    },
                  ]}
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ChapterGrid({
  palette,
  chapter,
  records,
  unlocked,
  onOpenLevel,
}: {
  palette: Palette;
  chapter: Chapter;
  records: Record<number, LevelRecord>;
  unlocked: number;
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
                current={id === unlocked}
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
  headerCentre: { alignItems: 'center', flex: 1 },
  headerSpacer: { width: 44 },
  title: { ...typography.title },
  subtitle: { ...typography.tiny, marginTop: 1 },

  chapterList: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  chapterCard: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  chapterHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chapterIndex: { ...typography.heading, fontVariant: ['tabular-nums'] },
  chapterText: { flex: 1 },
  chapterName: { ...typography.body, fontWeight: '700' },
  chapterTagline: { ...typography.small, marginTop: 1 },
  chapterCount: { ...typography.small, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, borderRadius: 2, marginTop: spacing.md, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

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
