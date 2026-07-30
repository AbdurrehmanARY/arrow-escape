/**
 * probe-tiers.ts — what does a tier actually measure at its current settings?
 *
 * Purpose:      Generate one sample level per tier and report what came out, so
 *               the blind-mistake targets can be set from measurement instead of
 *               from a guess.
 * Notes:        Exists because board size and difficulty are not independent, and
 *               the relationship is not one anybody can eyeball. Raising Medium
 *               from 14x14 to 30x30 multiplies its arrow count by five, and
 *               `expectedBlindMistakes` roughly tracks arrows times how narrow the
 *               frontier is — so a target that was right at one size can be off by
 *               an order of magnitude at another.
 *
 *               A full `levels:build` answers the same question and takes half an
 *               hour at these sizes. This takes seconds, because one sample per
 *               tier is enough to see the scale.
 *
 *               Run: `npx tsx tools/probe-tiers.ts`
 */

import { TIER_ORDER } from '../src/game/codec';
import { CURRICULUM } from './curriculum';
import { generateLevel } from './generate';

console.log('tier          board      arrows  len      target ->  measured   depth');
console.log('-'.repeat(74));

for (const tier of TIER_ORDER) {
  // The median plan of the tier, so the sample is representative rather than an
  // edge of the size range.
  const plans = CURRICULUM.filter((plan) => plan.tier === tier && plan.gate === undefined);
  const plan = plans[Math.floor(plans.length / 2)];
  if (!plan) continue;

  const started = Date.now();
  const candidate = generateLevel(
    plan.id * 7919 + 104729,
    {
      rows: plan.rows,
      cols: plan.cols,
      shape: plan.shape,
      arrowCount: plan.arrowCount,
      minBodyLength: plan.minBodyLength,
      maxBodyLength: plan.maxBodyLength,
      targetBlindMistakes: plan.targetBlindMistakes,
      attempts: 6,
      hearts: plan.hearts,
    },
    { id: plan.id, name: plan.name },
  );

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!candidate) {
    console.log(
      `${tier.padEnd(13)} ${`${plan.rows}x${plan.cols}`.padEnd(10)} FAILED after ${elapsed}s`,
    );
    continue;
  }

  const m = candidate.metrics;
  console.log(
    `${tier.padEnd(13)} ${`${plan.rows}x${plan.cols}`.padEnd(10)} ` +
      `${String(m.arrowCount).padStart(5)}   ` +
      `${`${plan.minBodyLength}-${plan.maxBodyLength}`.padEnd(7)} ` +
      `${plan.targetBlindMistakes.toFixed(0).padStart(6)} -> ` +
      `${m.expectedBlindMistakes.toFixed(0).padStart(8)}   ` +
      `${String(m.dependencyDepth).padStart(5)}   (${elapsed}s)`,
  );
}
