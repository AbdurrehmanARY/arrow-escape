/**
 * codec.ts — the on-disk level format.
 *
 * Purpose:      Store 600 levels, some of them very large, without bloating the
 *               app bundle.
 * Responsibilities:
 *               - `encodeLevel` / `decodeLevel` between the compact wire form and
 *                 the `LevelDefinition` the engine plays.
 * Notes:        The obvious format — every body as `[[r,c],[r,c],…]` — costs
 *               roughly 9 bytes per cell. An extreme level can hold 90 snakes of
 *               6 cells, and 600 of those is megabytes of JSON parsed at launch.
 *
 *               A body is a *walk*, so only its head needs coordinates; the rest
 *               is one character per step. `"4,7:DDRR"` replaces five coordinate
 *               pairs with eight characters. Across the library that is roughly a
 *               fourfold saving, and it parses faster because there are no nested
 *               arrays to allocate.
 *
 *               Keys are single letters for the same reason. It reads worse, and
 *               that is a fair trade for a file nobody edits by hand — levels are
 *               generated, and `renderAscii` is what you look at when debugging
 *               one.
 *
 *               Pure, and shared by the app and the off-device tooling, so an
 *               encoder change cannot desync from the decoder.
 */

import type { ArrowSpec, LevelDefinition } from './types';

/** Difficulty tiers, as authored in the curriculum. */
export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'superHard' | 'extremeHard';

/** A level in its stored form. Field names are short because there are 600 of them. */
export interface EncodedLevel {
  /** id */
  readonly i: number;
  /** name */
  readonly n: string;
  /** rows */
  readonly r: number;
  /** cols */
  readonly c: number;
  /** layout / shape id */
  readonly l: string;
  /** curated difficulty band, 1–5 */
  readonly d: number;
  /** tier */
  readonly t: DifficultyTier;
  /** hearts */
  readonly h: number;
  /** arrows, each `"row,col:STEPS"` — head coordinates then a walk to the tail */
  readonly a: readonly string[];
  /** canonical solution, as comma-separated arrow indices */
  readonly s: string;
}

/** One pack file. Levels are grouped so 600 of them are not 600 Metro modules. */
export interface LevelPack {
  readonly from: number;
  readonly to: number;
  readonly levels: readonly EncodedLevel[];
}

const STEP_TO_DELTA: Record<string, readonly [number, number]> = {
  U: [-1, 0],
  D: [1, 0],
  L: [0, -1],
  R: [0, 1],
};

function deltaToStep(dr: number, dc: number): string {
  if (dr === -1 && dc === 0) return 'U';
  if (dr === 1 && dc === 0) return 'D';
  if (dr === 0 && dc === -1) return 'L';
  if (dr === 0 && dc === 1) return 'R';
  throw new Error(`codec: body step (${dr}, ${dc}) is not orthogonal`);
}

/** Arrow ids are positional, so they never need storing. */
export const arrowIdFor = (index: number): string => `a${index}`;

/** Turn one body into `"row,col:STEPS"`. */
function encodeBody(body: readonly (readonly number[])[]): string {
  const head = body[0];
  if (!head || head.length !== 2) throw new Error('codec: body has no head');

  let steps = '';
  for (let i = 1; i < body.length; i += 1) {
    const previous = body[i - 1]!;
    const current = body[i]!;
    steps += deltaToStep(current[0]! - previous[0]!, current[1]! - previous[1]!);
  }

  return `${head[0]},${head[1]}:${steps}`;
}

/** Read `"row,col:STEPS"` back into a list of cells, head first. */
function decodeBody(encoded: string): number[][] {
  const split = encoded.indexOf(':');
  if (split === -1) throw new Error(`codec: malformed body "${encoded}"`);

  const [rowText, colText] = encoded.slice(0, split).split(',');
  const row = Number(rowText);
  const col = Number(colText);
  if (!Number.isFinite(row) || !Number.isFinite(col)) {
    throw new Error(`codec: malformed head in "${encoded}"`);
  }

  const body: number[][] = [[row, col]];
  let r = row;
  let c = col;

  for (const step of encoded.slice(split + 1)) {
    const delta = STEP_TO_DELTA[step];
    if (!delta) throw new Error(`codec: unknown step "${step}" in "${encoded}"`);
    r += delta[0];
    c += delta[1];
    body.push([r, c]);
  }

  return body;
}

/** Compact a playable level for storage. */
export function encodeLevel(
  level: LevelDefinition,
  tier: DifficultyTier,
  solutionIndices: readonly number[],
): EncodedLevel {
  return {
    i: level.id,
    n: level.name,
    r: level.rows,
    c: level.cols,
    l: level.layout,
    d: level.difficulty,
    t: tier,
    h: level.hearts ?? 5,
    a: level.arrows.map((arrow) => encodeBody(arrow.body)),
    s: solutionIndices.join(','),
  };
}

/**
 * Expand a stored level back into the form the engine plays.
 *
 * Throws on malformed input rather than returning a `Result`, because this only
 * ever reads data the build generated and CI verified. A corrupt pack is a broken
 * build, not a runtime condition worth threading an error type through every
 * screen for — and `buildLevel` still validates the result properly afterwards.
 */
export function decodeLevel(encoded: EncodedLevel): LevelDefinition {
  const arrows: ArrowSpec[] = encoded.a.map((body, index) => ({
    id: arrowIdFor(index),
    body: decodeBody(body),
  }));

  const solution = encoded.s
    .split(',')
    .filter((part) => part.length > 0)
    .map((part) => arrowIdFor(Number(part)));

  return {
    id: encoded.i,
    name: encoded.n,
    rows: encoded.r,
    cols: encoded.c,
    layout: encoded.l,
    difficulty: encoded.d,
    hearts: encoded.h,
    arrows,
    ...(solution.length > 0 ? { solution } : {}),
  };
}

/** Human-readable tier label, for level select and build reports. */
export const TIER_LABELS: Record<DifficultyTier, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  superHard: 'Super Hard',
  extremeHard: 'Extreme',
};

/** Tier order, low to high. Used for sorting and for the level-select legend. */
export const TIER_ORDER: readonly DifficultyTier[] = [
  'easy',
  'medium',
  'hard',
  'superHard',
  'extremeHard',
];
