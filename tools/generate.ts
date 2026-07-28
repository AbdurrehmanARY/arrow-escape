/**
 * generate.ts — the level generator.
 *
 * Purpose:      Produce candidate levels that are solvable, shaped, and land in a
 *               requested difficulty band.
 * Responsibilities:
 *               - Grow self-avoiding snakes inside a shape mask.
 *               - Reject anything the rules engine says is unsolvable.
 *               - Score candidates and keep the best fit for a target.
 * Notes:        Generation is cheap precisely because solvability is a graph
 *               property here rather than a search — `isSolvable` is microseconds,
 *               so the generator can afford to throw away thousands of candidates
 *               to find one that feels right.
 *
 *               Growing rather than placing matters. A body must be a connected,
 *               non-self-touching path, and the only reliable way to guarantee
 *               that is a walk that refuses any step touching its own body twice.
 *
 *               Scaled for boards up to ~700 cells. The naive version rescanned
 *               every cell to find a free start for each snake, which is fine at
 *               49 cells and quadratic misery at 700 across 90 snakes. Free cells
 *               are now a shuffled list walked by a cursor, so placement is linear
 *               in the board rather than in board x arrows.
 */

import {
  analyze,
  applyOutcome,
  buildLevel,
  type ArrowSpec,
  type DifficultyMetrics,
  type LevelDefinition,
  isSolvable,
  legalMoves,
  renderAscii,
  resolveTap,
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
  /** How many random boards to try before settling for the best so far. */
  readonly attempts: number;
  readonly hearts: number;
}

export interface Candidate {
  readonly level: LevelDefinition;
  readonly metrics: DifficultyMetrics;
  readonly score: number;
}

/** Fisher-Yates over a scratch array, using the seeded generator. */
function shuffle(items: number[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
}

/**
 * Grow one board of snakes inside a mask.
 *
 * Returns `undefined` when the mask could not take enough arrows, which is a
 * normal outcome rather than an error — the caller simply tries another seed.
 */
function growBoard(
  rng: () => number,
  options: GenerateOptions,
  maskCells: readonly number[],
  owner: Int32Array,
): readonly ArrowSpec[] | undefined {
  const { rows, cols, arrowCount, minBodyLength, maxBodyLength } = options;

  owner.fill(-2); // -2 = outside the shape
  for (const cell of maskCells) owner[cell] = -1; // -1 = inside and free

  // One shuffled pass over the shape's cells. Each snake starts at the next
  // still-free cell, so total placement work is linear in the mask.
  const starts = [...maskCells];
  shuffle(starts, rng);
  let cursor = 0;

  const arrows: ArrowSpec[] = [];
  const scratch: number[] = [];

  for (let index = 0; index < arrowCount; index += 1) {
    while (cursor < starts.length && owner[starts[cursor]!] !== -1) cursor += 1;
    if (cursor >= starts.length) break;

    const start = starts[cursor]!;
    const body: number[] = [start];
    owner[start] = index;

    const target =
      minBodyLength + Math.floor(rng() * Math.max(1, maxBodyLength - minBodyLength + 1));

    let head = start;
    while (body.length < target) {
      const r = Math.floor(head / cols);
      const c = head % cols;

      scratch.length = 0;
      if (r > 0 && owner[head - cols] === -1) scratch.push(head - cols);
      if (r + 1 < rows && owner[head + cols] === -1) scratch.push(head + cols);
      if (c > 0 && owner[head - 1] === -1) scratch.push(head - 1);
      if (c + 1 < cols && owner[head + 1] === -1) scratch.push(head + 1);
      if (scratch.length === 0) break;

      // A step is only legal if it touches this body exactly once — otherwise the
      // shape closes into a loop and stops being a simple path.
      let chosen = -1;
      let seen = 0;
      for (const next of scratch) {
        const nr = Math.floor(next / cols);
        const nc = next % cols;
        let touches = 0;
        if (nr > 0 && owner[next - cols] === index) touches += 1;
        if (nr + 1 < rows && owner[next + cols] === index) touches += 1;
        if (nc > 0 && owner[next - 1] === index) touches += 1;
        if (nc + 1 < cols && owner[next + 1] === index) touches += 1;
        if (touches !== 1) continue;

        // Reservoir sample, so one pass picks uniformly among the legal steps.
        seen += 1;
        if (Math.floor(rng() * seen) === 0) chosen = next;
      }
      if (chosen === -1) break;

      owner[chosen] = index;
      body.push(chosen);
      head = chosen;
    }

    if (body.length < minBodyLength) {
      for (const cell of body) owner[cell] = -1;
      continue;
    }

    // Grown tail-first, so the far end is the head.
    body.reverse();
    arrows.push({
      id: `a${arrows.length}`,
      body: body.map((cell) => [Math.floor(cell / cols), cell % cols]),
    });
  }

  return arrows.length >= Math.ceil(arrowCount * 0.7) ? arrows : undefined;
}

/**
 * How well a candidate matches what was asked for. Lower is better.
 *
 * Blind-mistake distance is scaled against the target rather than absolute: being
 * 4 out on a target of 6 is a different level entirely, while being 4 out on a
 * target of 80 is noise.
 */
function scoreCandidate(metrics: DifficultyMetrics, options: GenerateOptions): number {
  const target = Math.max(1, options.targetBlindMistakes);
  const mistakeGap = Math.abs(metrics.expectedBlindMistakes - target) / target;
  const arrowGap = Math.abs(metrics.arrowCount - options.arrowCount) / Math.max(1, options.arrowCount);
  // Prefer boards with genuine bends; a field of straight lines is dull to look at
  // and trivial to trace however many arrows are on it.
  const bendPenalty = Math.max(0, 1.1 - metrics.avgTurns);
  return mistakeGap * 2 + arrowGap + bendPenalty;
}

/**
 * Arrows that can never leave: whatever survives greedy peeling.
 *
 * Cheap and exact. Since removing a snake can only ever free others, repeatedly
 * taking every currently-free arrow either empties the board or leaves precisely
 * the knot that makes it unsolvable.
 */
function stuckArrows(level: LevelDefinition): number[] {
  const built = buildLevel(level);
  if (!built.ok) return [];

  const { board, initial } = built.value;
  let state = initial;

  for (;;) {
    const moves = legalMoves(board, state);
    if (moves.length === 0) break;
    for (const move of moves) {
      state = applyOutcome(state, resolveTap(board, state, move));
    }
  }

  const stuck: number[] = [];
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (state.alive[i] === 1) stuck.push(i);
  }
  return stuck;
}

/**
 * Try to make an unsolvable board solvable by flipping arrows in the knot.
 *
 * The yield problem this solves is severe. Solvability requires the blocking
 * graph to be acyclic, and as density rises the chance a *random* board is
 * acyclic collapses — at the fills the Extreme tier uses, nearly every candidate
 * is unsolvable, so resampling from scratch is close to hopeless.
 *
 * Reversing a body swaps which end carries the arrowhead, which flips that
 * arrow's exit direction and leaves the silhouette untouched. Since every cycle
 * must contain at least one stuck arrow, flipping one repeatedly breaks cycles
 * far more often than it makes new ones — turning a near-zero hit rate into a
 * usable one, at a fraction of the cost of growing another board.
 */
function repairBoard(
  rng: () => number,
  level: LevelDefinition,
  budget: number,
): LevelDefinition | undefined {
  let current = level;

  for (let attempt = 0; attempt < budget; attempt += 1) {
    const stuck = stuckArrows(current);
    if (stuck.length === 0) return current;

    const victim = stuck[Math.floor(rng() * stuck.length)]!;
    const arrows = current.arrows.map((arrow, index) =>
      index === victim ? { ...arrow, body: [...arrow.body].reverse() } : arrow,
    );
    current = { ...current, arrows };
  }

  return stuckArrows(current).length === 0 ? current : undefined;
}

/** Generate one level, returning the best-scoring candidate found. */
export function generateLevel(
  seed: number,
  options: GenerateOptions,
  meta: { id: number; name: string },
): Candidate | undefined {
  const mask = maskFor(options.shape, options.rows, options.cols);
  if (maskCapacity(mask) < options.arrowCount * options.minBodyLength) return undefined;

  const maskCells: number[] = [];
  for (let cell = 0; cell < mask.length; cell += 1) {
    if (mask[cell]) maskCells.push(cell);
  }

  const owner = new Int32Array(options.rows * options.cols);
  const rng = mulberry32(seed);
  let best: Candidate | undefined;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const arrows = growBoard(rng, options, maskCells, owner);
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

    let playable = level;
    if (!buildLevel(playable).ok) continue;

    // Dense boards are almost never solvable as grown, so repair rather than
    // discard — flipping an arrow inside the knot is far cheaper than another
    // full board, and keeps the silhouette exactly as it was.
    const repaired = repairBoard(rng, playable, 40);
    if (!repaired) continue;
    playable = repaired;

    const built = buildLevel(playable);
    if (!built.ok) continue;

    const { board, initial } = built.value;
    if (!isSolvable(board, initial)) continue;

    const metrics = analyze(board, initial);
    const score = scoreCandidate(metrics, options);

    if (!best || score < best.score) {
      best = { level: playable, metrics, score };
      // Close enough to the target that more searching would be noise.
      if (score < 0.18) break;
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
      `depth=${m.dependencyDepth}`,
    renderAscii(board, initial)
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n'),
  ].join('\n');
}
