/**
 * check-curriculum.ts — is every level plan physically possible?
 *
 * Purpose:      Catch a plan that asks for more snake than its shape can hold,
 *               before the generator burns thousands of attempts discovering it.
 * Responsibilities:
 *               - Compare each plan's minimum cell demand against its mask.
 * Notes:        Random self-avoiding growth strands cells — a walk paints itself
 *               into corners and abandons pockets too small for another body. In
 *               practice usable yield is roughly 60% of raw capacity, so a plan
 *               needs real headroom, not a bare fit.
 *
 *               Run: `npm run levels:check`
 */

import { CURRICULUM, bandOf } from './curriculum';
import { maskCapacity, maskFor } from './shapes';

/** Fraction of a mask a random self-avoiding fill can realistically use. */
const USABLE_FRACTION = 0.6;

let problems = 0;

console.log('  id  band          name           shape       size    need  cap  usable  verdict');
console.log('  ' + '-'.repeat(82));

for (const plan of CURRICULUM) {
  const mask = maskFor(plan.shape, plan.rows, plan.cols);
  const capacity = maskCapacity(mask);
  const usable = Math.floor(capacity * USABLE_FRACTION);
  const need = plan.arrowCount * plan.minBodyLength;

  const ok = need <= usable;
  if (!ok) problems += 1;

  console.log(
    `  ${String(plan.id).padStart(2)}  ${bandOf(plan.id).padEnd(12)}  ${plan.name.padEnd(13)}  ` +
      `${plan.shape.padEnd(10)}  ${`${plan.rows}x${plan.cols}`.padEnd(6)}  ` +
      `${String(need).padStart(4)}  ${String(capacity).padStart(3)}  ${String(usable).padStart(6)}  ` +
      `${ok ? 'ok' : 'TOO TIGHT'}`,
  );
}

console.log('');
if (problems === 0) {
  console.log(`All ${CURRICULUM.length} plans fit their shape.`);
} else {
  console.log(
    `${problems} plan(s) ask for more snake than the shape can hold. ` +
      'Reduce arrows, shorten bodies, or grow the grid.',
  );
  process.exitCode = 1;
}
