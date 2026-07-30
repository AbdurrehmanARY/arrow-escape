/**
 * build-levels.ts — generate the shipped level library.
 *
 * Purpose:      Turn the 600-level curriculum into packs of verified levels.
 * Responsibilities:
 *               - Generate, verify, encode, and write every level.
 *               - Emit the pack index.
 *               - Report the curve so the mix can be eyeballed.
 * Notes:        Deterministic. Each level's seed derives from its id, so a rebuild
 *               produces byte-identical files and a level someone has learned
 *               never silently changes under them.
 *
 *               Written as **packs of 50 rather than 600 separate files.** Metro
 *               charges real overhead per module, and 600 JSON modules is a
 *               meaningful slice of startup for no benefit — nothing ever needs
 *               one level in isolation.
 *
 *               A level is only written once the solver has both solved it *and*
 *               replayed its recorded solution. Nothing reaches `src/data` on
 *               trust.
 *
 *               Run: `npm run levels:build`
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildLevel, solve, verifySolution } from '../src/game';
import { encodeLevel, TIER_ORDER, type DifficultyTier, type EncodedLevel } from '../src/game/codec';
import { CURRICULUM, isOversized, isPlanningLevel, bandOf } from './curriculum';
import { generateLevel } from './generate';
import { maskCapacity, maskFor } from './shapes';

const OUT_DIR = join(process.cwd(), 'src', 'data', 'levels');
const PACK_SIZE = 50;

/** Distinct, stable seed per level. */
const seedFor = (id: number): number => id * 7919 + 104729;

/**
 * Search budget, scaled to board size.
 *
 * Far smaller than it was, and the reason is a trap worth recording. Packed
 * generation is nearly deterministic in quality — every attempt covers roughly the
 * same share of the board — so extra attempts buy almost nothing. Worse, the
 * generator only stops early when a candidate scores well against its
 * blind-mistake target, and packed boards sit so far above those targets that the
 * early exit never fires. The old budget of 900 therefore ran *in full*, on every
 * level, with a much more expensive `analyze` behind it. The build went from six
 * minutes to not finishing.
 *
 * These numbers are enough to sample a little variety and no more.
 */
function attemptsFor(cells: number): number {
  if (cells <= 225) return 40;
  if (cells <= 900) return 24;
  if (cells <= 2000) return 12;
  return 8;
}

interface BuildResult {
  readonly encoded: EncodedLevel;
  readonly tier: DifficultyTier;
  readonly blind: number;
  readonly target: number;
  readonly arrows: number;
  readonly cells: number;
  readonly oversized: boolean;
  /** Gate modes actually present on the finished board, not merely requested. */
  readonly gateModes: readonly string[];
  /** Share of legal taps that lose the level. Non-zero only on shutter boards. */
  readonly blunderRate: number;
  /**
   * Share of the *playable area* covered by snakes, as shipped.
   *
   * Against the silhouette rather than the grid, and the distinction is the whole
   * number on a shaped level: a pumpkin cannot fill a rectangle, so measuring
   * against the grid reported those boards at 48% when they were in fact 84% full
   * — as packed as the free boards next to them, and looking it. Measured against
   * the grid the metric mostly reports which shape was chosen.
   */
  readonly coverage: number;
}

function buildOne(planIndex: number): BuildResult {
  const plan = CURRICULUM[planIndex]!;
  const cells = plan.rows * plan.cols;

  // Loosen on later attempts: a tight shape sometimes cannot hit its arrow count,
  // and relaxing beats shipping nothing.
  for (let relax = 0; relax < 4; relax += 1) {
    const candidate = generateLevel(
      seedFor(plan.id) + relax * 31,
      {
        rows: plan.rows,
        cols: plan.cols,
        shape: plan.shape,
        // Floor of five, matching `arrowsFor`. Relaxing is meant to make a tight
        // plan achievable, not to hollow it out — three snakes is not an easy
        // level, it is an empty one, and level 249 shipped exactly that before this
        // floor existed. If five is still too many for the shape, the right answer
        // is to fail loudly rather than ship a board with nothing to read.
        arrowCount: Math.max(5, plan.arrowCount - relax * Math.ceil(plan.arrowCount * 0.12)),
        minBodyLength: Math.max(2, plan.minBodyLength - (relax > 1 ? 1 : 0)),
        maxBodyLength: plan.maxBodyLength,
        targetBlindMistakes: plan.targetBlindMistakes,
        attempts: attemptsFor(cells),
        hearts: plan.hearts,
        // Every board is packed — except the shutter levels.
        //
        // Proving a shutter board solvable is a depth-first search rather than a
        // graph peel, and its cost explodes with the number of arrows. On a packed
        // board that is a hundred snakes deep, and the build stopped finishing:
        // levels 100-150 alone took six minutes. A shutter level is about
        // *sequence*, not density, so it loses nothing by staying open, and the
        // player can actually see the order they are being asked to work out.
        packed: plan.gate?.mode !== 'shuts',
        // Only the last relaxation pass drops the gate. A planning level without a
        // shutter is a different level wearing the wrong name, so it is worth
        // several attempts before giving up on it — but not worth failing the whole
        // build over, because "no board of this shape can take a gate" is a fact
        // about the shape, not a bug.
        ...(plan.gate && relax < 3 ? { gate: plan.gate } : {}),
      },
      { id: plan.id, name: plan.name },
    );
    if (!candidate) continue;

    const built = buildLevel(candidate.level);
    if (!built.ok) throw new Error(`level ${plan.id}: ${built.error}`);

    const outcome = solve(built.value.board, built.value.initial);
    if (outcome.kind !== 'solved') {
      throw new Error(`level ${plan.id}: generator produced an unsolvable board`);
    }

    const check = verifySolution(built.value.board, built.value.initial, outcome.solution);
    if (!check.ok) throw new Error(`level ${plan.id}: ${check.error}`);

    const encoded = encodeLevel(
      { ...candidate.level, difficulty: bandOf(plan.tier) },
      plan.tier,
      outcome.solution,
    );

    return {
      encoded,
      tier: plan.tier,
      blind: candidate.metrics.expectedBlindMistakes,
      target: plan.targetBlindMistakes,
      arrows: candidate.metrics.arrowCount,
      cells,
      oversized: isOversized(plan),
      gateModes: (candidate.level.gates ?? []).map((gate) => gate.mode),
      blunderRate: candidate.metrics.blunderRate,
      coverage:
        candidate.level.arrows.reduce((sum, arrow) => sum + arrow.body.length, 0) /
        Math.max(1, maskCapacity(maskFor(plan.shape, plan.rows, plan.cols))),
    };
  }

  throw new Error(
    `level ${plan.id} "${plan.name}": no solvable ${plan.shape} board found — ` +
      'loosen the plan (fewer arrows, shorter bodies, or a bigger grid)',
  );
}

// ---------------------------------------------------------------------------

// The old levels stay on disk until the new ones are ready to replace them.
// Generating 600 levels takes minutes, and clearing the directory first left the
// app unbuildable for that whole window — Metro cannot resolve `@data/levels`
// when it is empty, so a rebuild broke the running dev server every time. Stale
// packs are swept at the end instead; see below.
mkdirSync(OUT_DIR, { recursive: true });

const started = Date.now();
const results: BuildResult[] = [];

for (let i = 0; i < CURRICULUM.length; i += 1) {
  results.push(buildOne(i));
  if ((i + 1) % 50 === 0) {
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`  ${i + 1}/${CURRICULUM.length} levels built (${seconds}s)`);
  }
}

// ---- Write packs ----------------------------------------------------------

const packCount = Math.ceil(results.length / PACK_SIZE);
const packNames: string[] = [];

for (let p = 0; p < packCount; p += 1) {
  const slice = results.slice(p * PACK_SIZE, (p + 1) * PACK_SIZE);
  const name = `pack-${String(p + 1).padStart(2, '0')}`;
  packNames.push(name);

  writeFileSync(
    join(OUT_DIR, `${name}.json`),
    `${JSON.stringify(
      {
        from: slice[0]!.encoded.i,
        to: slice[slice.length - 1]!.encoded.i,
        levels: slice.map((r) => r.encoded),
      },
      null,
      0,
    )}\n`,
    'utf8',
  );
}

const imports = packNames
  .map((name) => `import ${name.replace('-', '')} from './${name}.json';`)
  .join('\n');
const list = packNames
  .map((name) => `  ${name.replace('-', '')} as unknown as LevelPack,`)
  .join('\n');

writeFileSync(
  join(OUT_DIR, 'index.ts'),
  `/**
 * index.ts — the shipped level library.
 *
 * GENERATED by \`npm run levels:build\`. Do not edit by hand; your changes will be
 * overwritten and, worse, will not have been checked by the solver.
 *
 * Levels are stored compactly (see \`game/codec\`) and grouped into packs, so 600
 * of them cost ${packNames.length} Metro modules rather than 600. Decoding happens on demand and
 * is cached, so only the levels actually played are ever expanded.
 */

import { decodeLevel, type EncodedLevel, type LevelPack, type DifficultyTier } from '@game/codec';
import type { LevelDefinition } from '@game';

${imports}

const PACKS: readonly LevelPack[] = [
${list}
];

/** Every level in stored form, in play order. Cheap to hold; not yet decoded. */
export const ENCODED_LEVELS: readonly EncodedLevel[] = PACKS.flatMap((pack) => pack.levels);

/** Total levels shipped. */
export const LEVEL_COUNT = ENCODED_LEVELS.length;

const cache = new Map<number, LevelDefinition>();

/** Look up a level by its id (1-based), decoding and caching on first use. */
export function levelById(id: number): LevelDefinition | undefined {
  const hit = cache.get(id);
  if (hit) return hit;

  const encoded = ENCODED_LEVELS[id - 1];
  if (!encoded || encoded.i !== id) {
    const found = ENCODED_LEVELS.find((level) => level.i === id);
    if (!found) return undefined;
    const decoded = decodeLevel(found);
    cache.set(id, decoded);
    return decoded;
  }

  const decoded = decodeLevel(encoded);
  cache.set(id, decoded);
  return decoded;
}

/** Difficulty tier for a level, without decoding it. */
export function tierOf(id: number): DifficultyTier | undefined {
  return ENCODED_LEVELS[id - 1]?.t ?? ENCODED_LEVELS.find((l) => l.i === id)?.t;
}

/** Level name and board size, for level select — no decoding needed. */
export function summaryOf(id: number):
  | { name: string; rows: number; cols: number; tier: DifficultyTier; difficulty: number }
  | undefined {
  const level = ENCODED_LEVELS[id - 1]?.i === id
    ? ENCODED_LEVELS[id - 1]
    : ENCODED_LEVELS.find((l) => l.i === id);
  if (!level) return undefined;
  return { name: level.n, rows: level.r, cols: level.c, tier: level.t, difficulty: level.d };
}
`,
  'utf8',
);

// Sweep packs left over from a build that produced more of them than this one.
// Safe to do now: every file the new index imports has already been written.
const kept = new Set(packNames.map((name) => `${name}.json`));
for (const file of readdirSync(OUT_DIR)) {
  if (file.endsWith('.json') && !kept.has(file)) {
    rmSync(join(OUT_DIR, file), { force: true });
  }
}

// ---- Report ---------------------------------------------------------------

const elapsed = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\nBuilt ${results.length} levels into ${packCount} packs in ${elapsed}s.\n`);

const byTier = new Map<DifficultyTier, BuildResult[]>();
for (const r of results) {
  const list = byTier.get(r.tier) ?? [];
  list.push(r);
  byTier.set(r.tier, list);
}

console.log('  tier          count   arrows(avg)   cells(avg)   fill   blind: min / avg / max');
console.log('  ' + '-'.repeat(81));
for (const tier of TIER_ORDER) {
  const rows = byTier.get(tier) ?? [];
  if (rows.length === 0) continue;
  const avg = (pick: (r: BuildResult) => number) =>
    rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
  const blinds = rows.map((r) => r.blind);
  console.log(
    `  ${tier.padEnd(13)} ${String(rows.length).padStart(4)}   ` +
      `${avg((r) => r.arrows)
        .toFixed(1)
        .padStart(10)}   ` +
      `${avg((r) => r.cells)
        .toFixed(0)
        .padStart(9)}   ` +
      `${(avg((r) => r.coverage) * 100).toFixed(0).padStart(3)}%   ` +
      `${Math.min(...blinds)
        .toFixed(1)
        .padStart(6)} / ${avg((r) => r.blind)
        .toFixed(1)
        .padStart(6)} / ${Math.max(...blinds)
        .toFixed(1)
        .padStart(6)}`,
  );
}

const tuned = results;
const offTarget = tuned.filter((r) => Math.abs(r.blind - r.target) > Math.max(3, r.target * 0.5));
const oversized = results.filter((r) => r.oversized).length;
const totalArrows = results.reduce((sum, r) => sum + r.arrows, 0);

const opensLevels = results.filter((r) => r.gateModes.includes('opens')).length;
const shutsLevels = results.filter((r) => r.gateModes.includes('shuts'));
const plannedShutters = CURRICULUM.filter((plan) => isPlanningLevel(plan.id)).length;

console.log('');
console.log(
  `  ${tuned.length - offTarget.length}/${tuned.length} tuned levels landed in their target band ` +
    `(dense levels excluded — they are deliberately off-target).`,
);
console.log(`  ${oversized} boards are oversized and need zoom and pan.`);
console.log(`  ${totalArrows} arrows across the library.`);
console.log(`  largest board: ${Math.max(...results.map((r) => r.cells))} cells.`);
console.log('');
console.log(`  ${opensLevels} levels carry an opening gate.`);
// Reported against what was planned, not just as a count. A shutter that could
// not be placed silently downgrades a planning level to an ordinary one, and that
// is exactly the kind of quiet shortfall a build log exists to surface.
// Coverage, reported for the whole library rather than a subset: every board is
// packed now, so this is the number that says whether the game looks full.
// Shutter levels are counted separately rather than dragging the headline down.
// They are the one tier-independent exception to the density target and it is
// deliberate — see the `fill` comment in `curriculum.ts`.
const packedResults = results.filter((r) => !r.gateModes.includes('shuts'));
const coverages = packedResults.map((r) => r.coverage).sort((a, b) => a - b);
const meanCoverage = coverages.reduce((sum, c) => sum + c, 0) / coverages.length;
const belowTarget = coverages.filter((c) => c < 0.8).length;
console.log(
  `  playable area covered ${(coverages[0]! * 100).toFixed(0)}% / ` +
    `${(meanCoverage * 100).toFixed(0)}% / ${(coverages[coverages.length - 1]! * 100).toFixed(0)}% ` +
    `(min/avg/max) across ${packedResults.length} packed levels; ${belowTarget} under 80%.`,
);
if (shutsLevels.length > 0) {
  const shutterFill = shutsLevels.reduce((sum, r) => sum + r.coverage, 0) / shutsLevels.length;
  console.log(
    `  the ${shutsLevels.length} shutter levels sit at ${(shutterFill * 100).toFixed(0)}% by design — ` +
      'an order has to be readable off the board.',
  );
}

console.log(
  `  ${shutsLevels.length} of ${plannedShutters} planned shutter levels got one` +
    (shutsLevels.length > 0
      ? `, blunder rate avg ${(
          shutsLevels.reduce((sum, r) => sum + r.blunderRate, 0) / shutsLevels.length
        ).toFixed(2)}.`
      : '.'),
);
