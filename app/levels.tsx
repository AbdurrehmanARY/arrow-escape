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
import { FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, ScreenHeader, Springy, useTheme, withClick } from '@components';
import { TIER_BANDS, TIER_LABELS, type DifficultyTier } from '@game/codec';
import { ENCODED_LEVELS, LEVEL_COUNT } from '@data/levels';
import { CHAPTERS, chapterOf, chapterProgress, isChapterOpen, type Chapter } from '@data/chapters';
import {
  clearedCount,
  highestUnlocked,
  isCleared,
  playableUpTo,
  useProgressStore,
  type LevelRecord,
} from '@state/progressStore';
import { UNLOCK_ALL_LEVELS } from '@config';
import { radius, spacing, typography, type Palette } from '@theme';

const COLUMNS = 5;
/** Fixed so the list can lay out rows without measuring any of them. */
const ROW_HEIGHT = 74;

interface Row {
  readonly key: string;
  readonly ids: number[];
}

/**
 * Tier colour, from the active palette so it reskins with the theme.
 *
 * Ten tiers share five colours, in pairs. That is not a shortcut: ten
 * distinguishable dot colours do not exist in a palette that also has to stay
 * legible for colour-blind players, and a strip of ten near-identical swatches
 * conveys less than five clear ones. The pair is separated by the tier *name*,
 * which is on the card anyway.
 */
function tierColor(palette: Palette, tier: DifficultyTier): string {
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

export default function LevelSelectScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const records = useProgressStore((state) => state.records);

  // Two different questions, and conflating them is how the testing flag would
  // start lying: `unlocked` is what the UI will let you open, `reached` is where
  // you genuinely are. With every level open the first is always 600.
  const unlocked = useMemo(() => playableUpTo(records, LEVEL_COUNT), [records]);
  const reached = useMemo(() => highestUnlocked(records, LEVEL_COUNT), [records]);
  const clearedTotal = useMemo(() => clearedCount(records), [records]);
  const cleared = useCallback((id: number) => isCleared(records, id), [records]);

  // Open on the chapter the player is actually in, not chapter one.
  const [openChapter, setOpenChapter] = useState<Chapter | null>(null);

  return (
    <Screen>
      <ScreenHeader
        palette={palette}
        title={openChapter ? openChapter.name : 'Levels'}
        subtitle={openChapter ? openChapter.tagline : `${clearedTotal} of ${LEVEL_COUNT} cleared`}
        backLabel={openChapter ? 'Back to chapters' : 'Back'}
        onBack={() => (openChapter ? setOpenChapter(null) : router.back())}
      />

      {UNLOCK_ALL_LEVELS ? (
        <JumpToLevel palette={palette} onJump={(id) => router.push(`/play/${id}`)} />
      ) : null}

      {openChapter ? (
        <ChapterGrid
          palette={palette}
          chapter={openChapter}
          records={records}
          unlocked={unlocked}
          current={reached}
          onOpenLevel={(id) => router.push(`/play/${id}`)}
        />
      ) : (
        <ChapterList
          palette={palette}
          unlocked={unlocked}
          current={reached}
          isLevelCleared={cleared}
          onOpen={setOpenChapter}
        />
      )}
    </Screen>
  );
}

/**
 * Straight to a level by number.
 *
 * Only while `UNLOCK_ALL_LEVELS` is on. Reaching level 106 by tapping through
 * chapters is fine for a player working forward and miserable for someone
 * checking one specific board.
 */
function JumpToLevel({ palette, onJump }: { palette: Palette; onJump: (id: number) => void }) {
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

function ChapterList({
  palette,
  unlocked,
  current,
  isLevelCleared,
  onOpen,
}: {
  palette: Palette;
  /** What may be opened. */
  unlocked: number;
  /** Where the player genuinely is — highlights the chapter they are working on. */
  current: number;
  isLevelCleared: (id: number) => boolean;
  onOpen: (chapter: Chapter) => void;
}) {
  const currentChapter = chapterOf(current);

  return (
    <ScrollView contentContainerStyle={styles.chapterList} showsVerticalScrollIndicator={false}>
      {CHAPTERS.map((chapter) => {
        const open = isChapterOpen(chapter, unlocked);
        const { cleared, total } = chapterProgress(chapter, isLevelCleared);
        const isCurrent = chapter.index === currentChapter.index;
        const done = cleared === total;

        return (
          <Springy
            key={chapter.index}
            accessibilityRole="button"
            accessibilityLabel={
              open ? `${chapter.name}, ${cleared} of ${total} cleared` : `${chapter.name}, locked`
            }
            accessibilityState={{ disabled: !open }}
            disabled={!open}
            onPress={withClick(() => onOpen(chapter))}
            style={[
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
          </Springy>
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
  tierStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  tileNumber: { ...typography.heading, fontSize: 17, fontVariant: ['tabular-nums'] },
  perfect: { position: 'absolute', bottom: 3, right: 5, fontSize: 9 },
});
