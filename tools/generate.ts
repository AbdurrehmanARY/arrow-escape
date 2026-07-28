/**
 * generate.ts — the level generator.
 *
 * Purpose:      Produce candidate levels that are solvable, shaped, and land in a
 *               requested difficulty band.
 * Responsibilities:
 *               - Grow self-avoiding snakes inside a shape mask.
 *               - Reject anything the rules engine says is unsolvable.
 *               - Score candidates and keep the best fit for a target.
 * Notes:        This is the "generate" half of the pipeline; `validate.ts` is the
 *               guarantee that what ships is sound. Generation is cheap precisely
 *               because solvability is a graph property here rather than a search:
 *               `isSolvable` is microseconds, so the generator can afford to throw
 *               away thousands of candidates to find one that feels right.
 *
 *               Growing rather than placing matters. A body must be a connected,
 *               non-self-touching path, and the easiest way to guarantee that is a
 *               self-avoiding walk that refuses any step which would touch its own
 *               body twice.
 */

import {
  analyze,
  buildLevel,
  type ArrowSpec,
  type DifficultyMetrics,
  type LevelDefinition,
  isSolvable,
  renderAscii,
} from '../src/game';
import { maskCapacity, maskFor, type ShapeName } from './shapes';

/** Deterministic PRNG so a level library rebuilds byte-identically. */
export function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GenerateOptions {
  readonly rows: number;
  readonly cols: number;
  readonly shape: ShapeName;
  readonly arrowCount: number;
  readonly minBodyLength: number;
  readonly maxBodyLength: number;
  /** Expected hearts a blind player would spend. The main difficulty dial. */
  readonly targetBlindMistakes: number;
  /** How many random boards to try before giving up. */
  readonly attempts: number;
  readonly hearts: number;
}

export interface Candidate {
  readonly level: LevelDefinition;
  readonly metrics: DifficultyMetrics;
  readonly score: number;
}

/**
 * Grow one board of snakes inside a mask.
 *
 * Returns `undefined` if the mask could not accommodate enough arrows, which is a
 * normal outcome rather than an error — the caller simply tries another seed.
 */
function growBoard(
  rng: () => number,
  options: GenerateOptions,
): readonly ArrowSpec[] | undefined {
  const { rows, cols, shape, arrowCount, minBodyLength, maxBodyLength } = options;
  const mask = maskFor(shape, rows, cols);
  const owner = new Int32Array(rows * cols).fill(-1);

  // Cells outside the shape are permanently unavailable.
  for (let cell = 0; cell < owner.length; cell += 1) {
    if (!mask[cell]) owner[cell] = -2;
  }

  const arrows: ArrowSpec[] = [];

  /** Steps that stay in bounds, stay in the mask, and are still free. */
  const openNeighbours = (cell: number): number[] => {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const out: number[] = [];
    if (r > 0) out.push(cell - cols);
    if (r + 1 < rows) out.push(cell + cols);
    if (c > 0) out.push(cell - 1);
    if (c + 1 < cols) out.push(cell + 1);
    return out.filter((n) => owner[n] === -1);
  };

  for (let index = 0; index < arrowCount; index += 1) {
    const free: number[] = [];
    for (let cell = 0; cell < owner.length; cell += 1) {
      if (owner[cell] === -1) free.push(cell);
    }
    if (free.length === 0) break;

    const start = free[Math.floor(rng() * free.length)]!;
    const body: number[] = [start];
    owner[start] = index;

    const target =
      minBodyLength + Math.floor(rng() * Math.max(1, maxBodyLength - minBodyLength + 1));

    let cursor = start;
    while (body.length < target) {
      // A step is only legal if it touches this body exactly once — otherwise the
      // shape closes into a loop and stops being a simple path.
      const legal = openNeighbours(cursor).filter((next) => {
        const nr = Math.floor(next / cols);
        const nc = next % cols;
        let touches = 0;
        if (nr > 0 && owner[next - cols] === index) touches += 1;
        if (nr + 1 < rows && owner[next + cols] === index) touches += 1;
        if (nc > 0 && owner[next - 1] === index) touches += 1;
        if (nc + 1 < cols && owner[next + 1] === index) touches += 1;
        return touches === 1;
      });
      if (legal.length === 0) break;

      const next = legal[Math.floor(rng() * legal.length)]!;
      owner[next] = index;
      body.push(next);
      cursor = next;
    }

    if (body.length < minBodyLength) {
      // Too cramped to be a real snake — release the cells and move on.
      for (const cell of body) owner[cell] = -1;
      continue;
    }

    // Grown tail-first, so the far end is the head.
    body.reverse();
    arrows.push({
      id: String.fromCharCode(97 + arrows.length),
      body: body.map((cell) => [Math.floor(cell / cols), cell % cols] as const),
    });
  }

  return arrows.length >= Math.ceil(arrowCount * 0.7) ? arrows : undefined;
}

/**
 * How well a candidate matches what was asked for.
 *
 * Lower is better. Blind-mistake distance dominates because that is what decides
 * whether five hearts is enough, which is the difference between a level that
 * teaches and one that frustrates.
 */
function scoreCandidate(metrics: DifficultyMetrics, options: GenerateOptions): number {
  const mistakeGap = Math.abs(metrics.expectedBlindMistakes - options.targetBlindMistakes);
  const arrowGap = Math.abs(metrics.arrowCount - options.arrowCount);
  // Prefer boards with some genuine bends; a board of straight lines is dull to
  // look at and trivial to trace regardless of how many arrows are on it.
  const bendBonus = Math.max(0, 1.2 - metrics.avgTurns) * 2;
  return mistakeGap + arrowGap * 0.8 + bendBonus;
}

/** Generate one level, returning the best-scoring candidate found. */
export function generateLevel(
  seed: number,
  options: GenerateOptions,
  meta: { id: number; name: string },
): Candidate | undefined {
  const mask = maskFor(options.shape, options.rows, options.cols);
  if (maskCapacity(mask) < options.arrowCount * options.minBodyLength) return undefined;

  const rng = mulberry32(seed);
  let best: Candidate | undefined;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const arrows = growBoard(rng, options);
    if (!arrows) continue;

    const level: LevelDefinition = {
      id: meta.id,
      name: meta.name,
      rows: options.rows,
      cols: options.cols,
      layout: options.shape,
      difficulty: 1,
      hearts: options.hearts,
      arrows,
    };

    const built = buildLevel(level);
    if (!built.ok) continue;

    const { board, initial } = built.value;
    if (!isSolvable(board, initial)) continue;

    const metrics = analyze(board, initial);
    const score = scoreCandidate(metrics, options);

    if (!best || score < best.score) {
      best = { level: { ...level, difficulty: metrics.suggestedDifficulty }, metrics, score };
      // Close enough to the target that more searching would be noise.
      if (score < 0.6) break;
    }
  }

  return best;
}

/** Print a candidate for a human to look at during curation. */
export function describeCandidate(candidate: Candidate): string {
  const built = buildLevel(candidate.level);
  if (!built.ok) return `INVALID: ${built.error}`;

  const { board, initial } = built.value;
  const m = candidate.metrics;
  return [
    `#${candidate.level.id} ${candidate.level.name} (${candidate.level.layout}) ` +
      `${candidate.level.rows}x${candidate.level.cols}`,
    `  arrows=${m.arrowCount} avgLen=${m.avgBodyLength.toFixed(1)} turns=${m.avgTurns.toFixed(1)} ` +
      `crowd=${m.crowding.toFixed(1)} blind=${m.expectedBlindMistakes.toFixed(1)} ` +
      `depth=${m.dependencyDepth} band=${candidate.level.difficulty}`,
    renderAscii(board, initial)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  ].join('\n');
}
