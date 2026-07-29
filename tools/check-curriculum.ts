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
import { CURRICULUM, isOversized } from './curriculum';
import { maskCapacity, maskFor } from './shapes';

/** Fraction of a mask a random self-avoiding fill can realistically use. */
const USABLE_FRACTION = 0.6;

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
  const usable = Math.floor(capacity * USABLE_FRACTION);
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
