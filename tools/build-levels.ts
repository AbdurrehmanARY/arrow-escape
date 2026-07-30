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

const OUT_DIR = join(process.cwd(), 'src', 'data', 'levels');
const PACK_SIZE = 50;

/** Distinct, stable seed per level. */
const seedFor = (id: number): number => id * 7919 + 104729;

/**
 * Search budget, scaled to board size.
 *
 * A 7x7 board evaluates in microseconds so it can afford thousands of tries; a
 * 26x26 with 90 snakes costs far more per attempt, and the extra tries buy less
 * because there is more room to land near the target anyway.
 */
function attemptsFor(cells: number): number {
  if (cells <= 100) return 900;
  if (cells <= 225) return 500;
  if (cells <= 400) return 260;
  if (cells <= 900) return 140;
  // Beyond about a thousand cells one attempt grows and analyses a hundred-odd
  // snakes, so the cost per try is an order of magnitude up. There is also less to
  // gain: a board that big has so much room that most candidates land near the
  // target anyway, and it is the outliers, not the sample size, that miss.
  if (cells <= 2000) return 48;
  return 24;
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
  /** This level asked to be packed to four-fifths coverage. */
  readonly dense: boolean;
  /** Share of the *board* actually covered by snakes, as shipped. */
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
      dense: plan.dense,
      coverage: candidate.level.arrows.reduce((sum, arrow) => sum + arrow.body.length, 0) / cells,
    };
  }

  throw new Error(
    `level ${plan.id} "${plan.name}": no solvable ${plan.shape} board found — ` +
      'loosen the plan (fewer arrows, shorter bodies, or a bigger grid)',
  );
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
for (const file of readdirSync(OUT_DIR)) {
  if (file.endsWith('.json') || file === 'index.ts') {
    rmSync(join(OUT_DIR, file), { force: true });
  }
}

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

// ---- Report ---------------------------------------------------------------

const elapsed = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\nBuilt ${results.length} levels into ${packCount} packs in ${elapsed}s.\n`);

const byTier = new Map<DifficultyTier, BuildResult[]>();
for (const r of results) {
  const list = byTier.get(r.tier) ?? [];
  list.push(r);
  byTier.set(r.tier, list);
}

console.log('  tier          count   arrows(avg)   cells(avg)   blind: min / avg / max');
console.log('  ' + '-'.repeat(74));
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
      `${Math.min(...blinds)
        .toFixed(1)
        .padStart(6)} / ${avg((r) => r.blind)
        .toFixed(1)
        .padStart(6)} / ${Math.max(...blinds)
        .toFixed(1)
        .padStart(6)}`,
  );
}

// Dense levels are excluded on purpose. They override their tier's fill to reach
// four-fifths coverage, which makes them far harder than the tier target by design
// — counting them as misses would turn this number into noise and hide a real
// regression among the levels it is actually measuring.
const tuned = results.filter((r) => !r.dense);
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
const denseLevels = results.filter((r) => r.dense);
if (denseLevels.length > 0) {
  const coverages = denseLevels.map((r) => r.coverage);
  const avg = coverages.reduce((sum, c) => sum + c, 0) / coverages.length;
  console.log(
    `  ${denseLevels.length} dense levels, board coverage ` +
      `${(Math.min(...coverages) * 100).toFixed(0)}% / ${(avg * 100).toFixed(0)}% / ` +
      `${(Math.max(...coverages) * 100).toFixed(0)}% (min/avg/max), ` +
      `${(denseLevels.reduce((sum, r) => sum + r.arrows, 0) / denseLevels.length).toFixed(0)} arrows avg.`,
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
