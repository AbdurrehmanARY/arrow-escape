/**
 * app/levels.tsx — level select.
 *
 * Purpose:      Navigate 1,000 levels without it feeling like a spreadsheet.
 * Notes:        Two views, because 1,000 tiles is not a list anyone reads. The
 *               chapter view gives twenty landmarks with progress; opening one
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

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import {
  ChapterGrid,
  ChapterList,
  Screen,
  ScreenHeader,
  useTheme,
} from '@components';
import { LEVEL_COUNT } from '@data';
import type { Chapter } from '@data';
import { clearedCount, highestUnlocked, isCleared, useProgressStore } from '@state';

export default function LevelSelectScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const records = useProgressStore((state) => state.records);

  // What the UI will let you open, and where the player genuinely is. These were
  // two different numbers while `UNLOCK_ALL_LEVELS` existed — the flag opened
  // everything without claiming the player had reached it. The flag is gone for
  // production, so there is one question and one memo: sequential progress.
  const unlocked = useMemo(() => highestUnlocked(records, LEVEL_COUNT), [records]);
  const clearedTotal = useMemo(() => clearedCount(records), [records]);
  const cleared = useCallback((id: number) => isCleared(records, id), [records]);

  // Open on the chapter the player is actually in, not chapter one.
  const [openChapter, setOpenChapter] = useState<Chapter | null>(null);

  return (
    <Screen palette={palette}>
      <ScreenHeader
        palette={palette}
        title={openChapter ? openChapter.name : 'Levels'}
        subtitle={openChapter ? openChapter.tagline : `${clearedTotal} of ${LEVEL_COUNT} cleared`}
        backLabel={openChapter ? 'Back to chapters' : 'Back'}
        onBack={() => (openChapter ? setOpenChapter(null) : router.back())}
      />

      {openChapter ? (
        <ChapterGrid
          palette={palette}
          chapter={openChapter}
          records={records}
          unlocked={unlocked}
          current={unlocked}
          onOpenLevel={(id) => router.push(`/play/${id}`)}
        />
      ) : (
        <ChapterList
          palette={palette}
          unlocked={unlocked}
          current={unlocked}
          isLevelCleared={cleared}
          onOpen={setOpenChapter}
        />
      )}
    </Screen>
  );
}
