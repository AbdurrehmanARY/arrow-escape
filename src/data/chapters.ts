/**
 * chapters.ts — 1,000 levels, grouped into something a person can navigate.
 *
 * Purpose:      Give the level list structure, so finding level 380 is a choice
 *               rather than a scroll.
 * Responsibilities:
 *               - Chapter boundaries, names, and progress.
 * Notes:        A flat list of 1,000 tiles is 200 rows of scrolling with no
 *               landmarks. Chapters give the player somewhere to *be* — "I'm
 *               halfway through Deep Water" is a position; "level 287" is a
 *               number.
 *
 *               Names are fixed rather than derived from the levels inside them.
 *               Chapter contents are generated and will shift whenever the
 *               curriculum is retuned, but a chapter a player remembers finishing
 *               should not silently rename itself between builds.
 *
 *               Twenty chapters of fifty, matching the pack layout exactly, so a
 *               chapter is also the unit of data that gets loaded.
 */

import { LEVEL_COUNT } from './levels';

export interface Chapter {
  readonly index: number;
  readonly name: string;
  /** One line of flavour, shown under the name. */
  readonly tagline: string;
  readonly firstLevel: number;
  readonly lastLevel: number;
}

const CHAPTER_SIZE = 50;

const NAMES: readonly { name: string; tagline: string }[] = [
  { name: 'First Light', tagline: 'Learn to read a head' },
  { name: 'Open Ground', tagline: 'Room to be wrong' },
  { name: 'The Weave', tagline: 'Bodies start to cross' },
  { name: 'Close Quarters', tagline: 'Less space, more care' },
  { name: 'Deep Water', tagline: 'Boards outgrow the screen' },
  { name: 'The Long Way', tagline: 'Trace it properly' },
  { name: 'Ironwork', tagline: 'Dense and unforgiving' },
  { name: 'The Tangle', tagline: 'Everything at once' },
  { name: 'Far Country', tagline: 'Pan, zoom, think' },
  { name: 'The Reckoning', tagline: 'No easy reads left' },
  { name: 'Last Light', tagline: 'For the patient' },
  { name: 'The Long Word', tagline: 'Everything you have learned' },
  // Chapters 13-20 arrived with the extension from 600 levels to 1,000. The names
  // are fixed like the others and for the same reason given above: a chapter a
  // player remembers finishing must not rename itself between builds.
  { name: 'Second Wind', tagline: 'Past where it used to end' },
  { name: 'The Undertow', tagline: 'Deeper than it looks' },
  { name: 'Blackwork', tagline: 'Density without mercy' },
  { name: 'The Meridian', tagline: 'Too far to turn back' },
  { name: 'Coldforge', tagline: 'Hard, and then harder' },
  { name: 'The Labyrinth', tagline: 'Every thread at once' },
  { name: 'Nightfall', tagline: 'The last of the light' },
  { name: 'The Long Count', tagline: 'Everything you have left' },
];

/** Every chapter, in order. */
export const CHAPTERS: readonly Chapter[] = NAMES.map((entry, index) => ({
  index,
  name: entry.name,
  tagline: entry.tagline,
  firstLevel: index * CHAPTER_SIZE + 1,
  lastLevel: Math.min(LEVEL_COUNT, (index + 1) * CHAPTER_SIZE),
})).filter((chapter) => chapter.firstLevel <= LEVEL_COUNT);

/** Which chapter a level belongs to. */
export function chapterOf(levelId: number): Chapter {
  const index = Math.min(CHAPTERS.length - 1, Math.floor((levelId - 1) / CHAPTER_SIZE));
  return CHAPTERS[index]!;
}

/** How many levels in a chapter have been cleared. */
export function chapterProgress(
  chapter: Chapter,
  isLevelCleared: (id: number) => boolean,
): { cleared: number; total: number } {
  let cleared = 0;
  for (let id = chapter.firstLevel; id <= chapter.lastLevel; id += 1) {
    if (isLevelCleared(id)) cleared += 1;
  }
  return { cleared, total: chapter.lastLevel - chapter.firstLevel + 1 };
}

/**
 * A chapter is open once the one before it has been *started*, not finished.
 *
 * Gating on completion would strand a player who has cleared 49 of 50 and is
 * stuck on the last one — they would have 550 levels they cannot touch because of
 * a single board. Progression through levels is already sequential; chapters are
 * navigation, not another lock.
 */
export function isChapterOpen(chapter: Chapter, highestUnlockedLevel: number): boolean {
  return highestUnlockedLevel >= chapter.firstLevel;
}
