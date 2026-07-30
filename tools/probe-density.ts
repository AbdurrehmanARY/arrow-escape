/**
 * probe-density.ts — how densely can a board actually be packed and still work?
 *
 * Purpose:      Find the real ceiling on fill, per board size, before committing
 *               the curriculum to a number.
 * Notes:        This exists because density and solvability pull hard against each
 *               other, and the relationship is not one anybody can guess. A board
 *               is solvable only if its blocking graph is acyclic, and the chance a
 *               *random* dense board is acyclic collapses as fill rises — at the
 *               fills used before Phase 16, almost every candidate was a knot.
 *               `repairBoard` claws a lot of that back by reversing stuck arrows,
 *               but it has a limit, and the limit is what this measures.
 *
 *               Two numbers matter and they are different. **Fill** is the share of
 *               the shape's cells covered by snakes, which is what a player sees.
 *               **Yield** is the share of generated candidates that come out
 *               solvable, which is what decides whether a build finishes this year.
 *
 *               Run: `npx tsx tools/probe-density.ts`
 */

import { buildLevel, isSolvable } from '../src/game';
import { generateLevel, type GenerateStats } from './generate';
import { maskCapacity, maskFor } from './shapes';

interface Trial {
  readonly size: number;
  /** Requested share of the shape's cells to cover. */
  readonly fill: number;
  readonly minLen: number;
  readonly maxLen: number;
}

/**
 * Body length has to rise with fill, or density becomes unrenderable.
 *
 * Covering 80% of a 40x40 board is 1,280 cells. With five-cell snakes that is 256
 * of them — hundreds of SVG nodes and a level nobody wants to tap through. With
 * fifteen-cell snakes it is 85, which both renders and reads as a tangle. Long
 * bodies are how a board gets dense without getting silly.
 */
const TRIALS: readonly Trial[] = [
  { size: 18, fill: 0.9, minLen: 4, maxLen: 10 },
  { size: 20, fill: 0.9, minLen: 4, maxLen: 11 },
  { size: 22, fill: 0.95, minLen: 4, maxLen: 12 },
  { size: 24, fill: 0.95, minLen: 5, maxLen: 12 },
  { size: 26, fill: 0.95, minLen: 5, maxLen: 12 },
  { size: 26, fill: 1.0, minLen: 5, maxLen: 12 },
];

const SAMPLES = 4;
/** Matches what `build-levels.ts` allows a large board, so the yield is realistic. */
const ATTEMPTS = 40;

console.log('size   asked   arrows   actual fill   solvable   grew-fail  knot   ms/level');
console.log('-'.repeat(78));

for (const trial of TRIALS) {
  const capacity = maskCapacity(maskFor('free', trial.size, trial.size));
  const averageLength = (trial.minLen + trial.maxLen) / 2;
  const arrowCount = Math.round((capacity * trial.fill) / averageLength);

  let solved = 0;
  let cellsCovered = 0;
  let arrowsMade = 0;
  const stats: GenerateStats = { attempts: 0, growthFailed: 0, unsolvable: 0, ok: 0 };
  const started = Date.now();

  for (let sample = 0; sample < SAMPLES; sample += 1) {
    const candidate = generateLevel(
      1000 + sample * 977 + trial.size * 31,
      {
        rows: trial.size,
        cols: trial.size,
        shape: 'free',
        arrowCount,
        minBodyLength: trial.minLen,
        maxBodyLength: trial.maxLen,
        targetBlindMistakes: 999, // irrelevant here; we are measuring feasibility
        attempts: ATTEMPTS,
        hearts: 5,
        stats,
      },
      { id: 0, name: 'probe' },
    );
    if (!candidate) continue;

    const built = buildLevel(candidate.level);
    if (!built.ok || !isSolvable(built.value.board, built.value.initial)) continue;

    solved += 1;
    arrowsMade += candidate.metrics.arrowCount;
    cellsCovered += candidate.level.arrows.reduce((sum, arrow) => sum + arrow.body.length, 0);
  }

  const perLevel = (Date.now() - started) / SAMPLES;
  const actualFill = solved === 0 ? 0 : cellsCovered / solved / capacity;

  const share = (n: number) =>
    stats.attempts === 0 ? '  -' : `${Math.round((n / stats.attempts) * 100)}%`;

  console.log(
    `${String(trial.size).padStart(4)}   ` +
      `${(trial.fill * 100).toFixed(0).padStart(4)}%   ` +
      `${(solved === 0 ? 0 : arrowsMade / solved).toFixed(0).padStart(6)}   ` +
      `${(actualFill * 100).toFixed(0).padStart(10)}%   ` +
      `${`${solved}/${SAMPLES}`.padStart(8)}   ` +
      `${share(stats.growthFailed).padStart(9)}  ` +
      `${share(stats.unsolvable).padStart(5)}   ` +
      `${perLevel.toFixed(0).padStart(8)}`,
  );
}

console.log('');
console.log('"actual fill" is what the generator managed, not what was asked for.');
console.log('"solvable" is the yield: how many of the samples came out playable at all.');
console.log('"grew-fail" = the shape could not hold the snakes. "knot" = it could, but every');
console.log('layout had a blocking cycle repair could not break. They need opposite fixes.');
