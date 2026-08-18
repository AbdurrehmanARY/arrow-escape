/**
 * check-curriculum.ts — is every level plan physically possible?
 *
 * Purpose:      Catch a plan that asks for more snake than its shape can hold,
 *               before the generator burns thousands of attempts discovering it.
 * Notes:        Random self-avoiding growth strands cells — a walk paints itself
 *               into corners and abandons pockets too small for another body. In
 *               practice usable yield is roughly 60% of raw capacity, so a plan
 *               needs real headroom, not a bare fit.
 *
 *               With 600 levels this prints a summary rather than every row;
 *               `--verbose` lists them all.
 *
 *               Run: `npm run levels:check`
 */

import type { DifficultyTier } from '../src/game/codec';
import {
  CURRICULUM,
  isOversized,
  isPlanningLevel,
  PACKED_USABLE_FRACTION,
  USABLE_FRACTION,
} from './curriculum';
import { maskCapacity, maskFor, SHAPE_NAMES } from './shapes';

const verbose = process.argv.includes('--verbose');

const tierCounts = new Map<DifficultyTier, number>();
const shapeCounts = new Map<string, number>();
let problems = 0;
let oversized = 0;
let totalArrows = 0;
let biggest = 0;

for (const plan of CURRICULUM) {
  const mask = maskFor(plan.shape, plan.rows, plan.cols);
  const capacity = maskCapacity(mask);
  // Which grower will run decides how much of the mask is reachable: a packed
  // board places centre-outward and strands far less than a random walk. Imported
  // from `curriculum.ts` rather than restated, because the two drifting apart is
  // how a plan gets rejected here that the generator could have met — or worse,
  // accepted here and then burned thousands of attempts failing.
  const usable = Math.floor(
    capacity * (isPlanningLevel(plan.id) ? USABLE_FRACTION : PACKED_USABLE_FRACTION),
  );
  const need = plan.arrowCount * plan.minBodyLength;
  const ok = need <= usable;

  tierCounts.set(plan.tier, (tierCounts.get(plan.tier) ?? 0) + 1);
  shapeCounts.set(plan.shape, (shapeCounts.get(plan.shape) ?? 0) + 1);
  totalArrows += plan.arrowCount;
  biggest = Math.max(biggest, plan.rows * plan.cols);
  if (isOversized(plan)) oversized += 1;

  if (!ok) {
    problems += 1;
    console.log(
      `  TOO TIGHT  ${String(plan.id).padStart(3)} ${plan.name.padEnd(22)} ` +
        `${plan.shape.padEnd(14)} ${plan.rows}x${plan.cols}  need ${need}, usable ${usable}`,
    );
  } else if (verbose) {
    console.log(
      `  ok  ${String(plan.id).padStart(3)} ${plan.tier.padEnd(12)} ${plan.name.padEnd(22)} ` +
        `${plan.shape.padEnd(14)} ${plan.rows}x${plan.cols}  arrows ${plan.arrowCount}`,
    );
  }
}

/*
 * Two properties of the shape library that nothing else was checking.
 *
 * Ids must be unique across the four families because `maskFor` resolves them in a
 * fixed order — analytic, then glyph, then procedural, then bitmap — so a collision
 * does not error, it silently makes the loser unreachable. `infinity` was defined
 * as both a bitmap and a glyph for exactly that reason and went unnoticed: the
 * drawing sat in `SHAPE_NAMES` inflating every count while never rendering.
 *
 * And every shape should reach at least one level, since the point of drawing one
 * is that a player sees it.
 */
const duplicates = SHAPE_NAMES.filter((name, i) => SHAPE_NAMES.indexOf(name) !== i);
if (duplicates.length > 0) {
  console.log('');
  console.log(`shape ids are not unique: ${[...new Set(duplicates)].join(', ')}`);
  problems += duplicates.length;
}

const unused = SHAPE_NAMES.filter((name) => !shapeCounts.has(name));
if (unused.length > 0) {
  console.log('');
  console.log(`${unused.length} shape(s) reach no level: ${unused.join(', ')}`);
  problems += unused.length;
}

console.log('');
console.log(`${CURRICULUM.length} levels planned.`);
console.log(
  `  tier mix        : ${[...tierCounts.entries()].map(([t, n]) => `${t} ${n}`).join(', ')}`,
);
console.log(`  distinct shapes : ${shapeCounts.size}`);
console.log(`  oversized boards: ${oversized} (need zoom and pan)`);
console.log(`  largest board   : ${biggest} cells`);
console.log(`  total arrows    : ${totalArrows}`);

if (problems > 0) {
  console.log('');
  console.log(`${problems} plan(s) ask for more snake than the shape can hold.`);
  process.exitCode = 1;
} else {
  console.log('');
  console.log('All plans fit their shape.');
}
