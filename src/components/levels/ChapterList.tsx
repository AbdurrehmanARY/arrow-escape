/**
 * src/components/levels/ChapterList.tsx — the twenty chapters, as a list.
 *
 * Purpose:      Give the player twenty landmarks with progress against each,
 *               rather than a thousand tiles nobody reads. "Halfway through Deep
 *               Water" is a position a player can hold in their head; "level 287"
 *               is not.
 * Responsibilities:
 *               - Show each chapter's name, tagline, cleared count and bar.
 *               - Say plainly what opens a locked chapter.
 *               - Mark the chapter the player is actually working in.
 * Notes:        Moved verbatim out of `app/levels.tsx`, together with the ten
 *               style keys it uses and none of anyone else's.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CHAPTERS, chapterOf, chapterProgress, isChapterOpen, type Chapter } from '@data';
import { radius, spacing, typography, type Palette } from '@theme';

import { Springy } from '../Pressable';
import { withClick } from '../sound';

/** The twenty chapters, each opening onto its own level grid. */
export function ChapterList({
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

const styles = StyleSheet.create({
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
});
