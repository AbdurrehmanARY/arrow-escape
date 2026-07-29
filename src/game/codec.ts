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

import type { ArrowSpec, GateMode, LevelDefinition } from './types';

/**
 * Difficulty tiers, as authored in the curriculum.
 *
 * Ten rather than five. Five was enough when a level could only vary in how hard
 * it was to read, but with 600 of them each tier had to cover a range wide enough
 * that "Hard" meant almost nothing — the easiest Hard board and the hardest one
 * were a different game. Ten bands are narrow enough that the label is a promise.
 *
 * The names are player-facing and are the reason they are not `t1`…`t10`: a tier
 * is shown in level select, and a player deciding whether to attempt a level is
 * better served by "Brutal" than by a number they have to calibrate themselves.
 */
export type DifficultyTier =
  | 'tutorial'
  | 'easy'
  | 'casual'
  | 'medium'
  | 'tricky'
  | 'hard'
  | 'superHard'
  | 'extremeHard'
  | 'brutal'
  | 'nightmare';

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
  /**
   * colour group per arrow, in arrow order, `""` for none.
   *
   * Every one of these optional fields is omitted entirely rather than written as
   * an empty value, because the overwhelming majority of levels have no obstacles
   * at all and four empty keys across six hundred levels is real bundle weight.
   */
  readonly p?: readonly string[];
  /** walls, as `"row,col;row,col"` */
  readonly w?: string;
  /** gates */
  readonly g?: readonly EncodedGate[];
}

/** One gate in its stored form. */
export interface EncodedGate {
  /** group name */
  readonly u: string;
  /** mode */
  readonly m: GateMode;
  /** cells, as `"row,col;row,col"` */
  readonly c: string;
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

/** Turn a list of `[row, col]` pairs into `"row,col;row,col"`. */
function encodeCells(cells: readonly (readonly number[])[]): string {
  return cells.map((cell) => `${cell[0]},${cell[1]}`).join(';');
}

/** Read `"row,col;row,col"` back into pairs. */
function decodeCells(encoded: string): number[][] {
  if (encoded.length === 0) return [];
  return encoded.split(';').map((pair) => {
    const [rowText, colText] = pair.split(',');
    const row = Number(rowText);
    const col = Number(colText);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
      throw new Error(`codec: malformed cell "${pair}"`);
    }
    return [row, col];
  });
}

/** Compact a playable level for storage. */
export function encodeLevel(
  level: LevelDefinition,
  tier: DifficultyTier,
  solutionIndices: readonly number[],
): EncodedLevel {
  const groups = level.arrows.map((arrow) => arrow.group ?? '');
  const walls = level.walls ?? [];
  const gates = level.gates ?? [];

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
    ...(groups.some((group) => group !== '') ? { p: groups } : {}),
    ...(walls.length > 0 ? { w: encodeCells(walls) } : {}),
    ...(gates.length > 0
      ? { g: gates.map((gate) => ({ u: gate.group, m: gate.mode, c: encodeCells(gate.cells) })) }
      : {}),
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
  const arrows: ArrowSpec[] = encoded.a.map((body, index) => {
    const group = encoded.p?.[index] ?? '';
    return {
      id: arrowIdFor(index),
      body: decodeBody(body),
      ...(group !== '' ? { group } : {}),
    };
  });

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
    ...(encoded.w !== undefined ? { walls: decodeCells(encoded.w) } : {}),
    ...(encoded.g !== undefined
      ? {
          gates: encoded.g.map((gate) => ({
            group: gate.u,
            mode: gate.m,
            cells: decodeCells(gate.c),
          })),
        }
      : {}),
    ...(solution.length > 0 ? { solution } : {}),
  };
}

/** Human-readable tier label, for level select and build reports. */
export const TIER_LABELS: Record<DifficultyTier, string> = {
  tutorial: 'Tutorial',
  easy: 'Easy',
  casual: 'Casual',
  medium: 'Medium',
  tricky: 'Tricky',
  hard: 'Hard',
  superHard: 'Super Hard',
  extremeHard: 'Extreme',
  brutal: 'Brutal',
  nightmare: 'Nightmare',
};

/** Tier order, low to high. Used for sorting and for the level-select legend. */
export const TIER_ORDER: readonly DifficultyTier[] = [
  'tutorial',
  'easy',
  'casual',
  'medium',
  'tricky',
  'hard',
  'superHard',
  'extremeHard',
  'brutal',
  'nightmare',
];

/**
 * Curated 1–5 band for a tier, shown as pips in level select.
 *
 * Ten tiers still collapse to five pips because a pip strip is a glanceable
 * signal, not a scale — eight pips of ten is not information anyone reads at
 * speed. The tier name carries the precision; the pips carry the shape.
 */
export const TIER_BANDS: Record<DifficultyTier, number> = {
  tutorial: 1,
  easy: 1,
  casual: 2,
  medium: 2,
  tricky: 3,
  hard: 3,
  superHard: 4,
  extremeHard: 4,
  brutal: 5,
  nightmare: 5,
};
