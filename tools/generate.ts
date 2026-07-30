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
  type GateMode,
  type GateSpec,
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
  /** A gate to try to add once the board is grown and known solvable. */
  readonly gate?: GateRequest;
}

export interface GateRequest {
  readonly mode: GateMode;
  readonly groupCount: number;
  readonly cellsPerGroup: number;
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

  // Counts *placed* snakes, not attempts. A start cell that cannot grow a long
  // enough body used to consume an arrow slot anyway, which was invisible at
  // bodies of 2–6 and ruinous at 5–14: on a 30x30 board most starts paint
  // themselves into a corner, so the board came out at half the density it asked
  // for. A failed start now costs only that start.
  let placed = 0;
  while (placed < arrowCount) {
    while (cursor < starts.length && owner[starts[cursor]!] !== -1) cursor += 1;
    if (cursor >= starts.length) break;

    const index = placed;
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
      // Skip this start rather than retrying it: the cells are free again, so the
      // cursor would otherwise sit on it forever.
      cursor += 1;
      continue;
    }

    // Grown tail-first, so the far end is the head.
    body.reverse();
    arrows.push({
      id: `a${arrows.length}`,
      body: body.map((cell) => [Math.floor(cell / cols), cell % cols]),
    });
    placed += 1;
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
  const arrowGap =
    Math.abs(metrics.arrowCount - options.arrowCount) / Math.max(1, options.arrowCount);
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

    // Flip a share of the knot at once, not a single arrow.
    //
    // One flip per round is right when a board has thirty arrows and four of them
    // are tangled. On a 40x43 board with a hundred and ten it is hopeless: a knot
    // of sixty arrows would need sixty lucky rounds, and level 21 simply failed to
    // build. Flipping a quarter of the knot converges in a handful of rounds, and
    // the single-flip case is preserved exactly where it was already working,
    // because a small knot still rounds down to one.
    //
    // The last few rounds drop back to one flip regardless, so a knot of two or
    // three that needs a specific arrow reversed still gets tried individually.
    const precise = attempt > budget * 0.75;
    const flips = precise ? 1 : Math.max(1, Math.floor(stuck.length / 4));

    const victims = new Set<number>();
    for (let i = 0; i < flips; i += 1) {
      victims.add(stuck[Math.floor(rng() * stuck.length)]!);
    }

    const arrows = current.arrows.map((arrow, index) =>
      victims.has(index) ? { ...arrow, body: [...arrow.body].reverse() } : arrow,
    );
    current = { ...current, arrows };
  }

  return stuckArrows(current).length === 0 ? current : undefined;
}

/** Colour names, in the order groups are handed out. Purely for reading level files. */
const GROUP_NAMES = ['red', 'blue', 'green', 'violet', 'amber'] as const;

/**
 * Try to add gates to a board that is already grown and already solvable.
 *
 * Placement is by rejection rather than by construction, and that is a considered
 * choice. Constructing a provably-safe gate means reasoning about the canonical
 * solution order and which arrows can be brought forward past which others — real
 * work, easy to get subtly wrong, and it would bias every gated level towards the
 * same shape. Throwing gates at the board and asking the solver is a few
 * milliseconds per try and produces placements nobody would have thought of.
 *
 * The acceptance test differs by mode, and the difference is the whole point:
 *
 * - `opens` only has to leave the board solvable, and must deepen it. A gate that
 *   changes no dependency is scenery the player pays attention to for nothing.
 * - `shuts` has to leave the board solvable *and* genuinely order-dependent. A
 *   shutter that can never actually trap anybody is worse than no shutter, because
 *   it teaches the player to fear something harmless.
 */
function addGates(
  rng: () => number,
  level: LevelDefinition,
  request: GateRequest,
  attempts: number,
): LevelDefinition | undefined {
  const built = buildLevel(level);
  if (!built.ok) return undefined;

  const baselineDepth = analyze(built.value.board, built.value.initial).dependencyDepth;

  // Gate cells have to be free: `buildLevel` rejects a gate sitting on an arrow.
  const occupied = new Set<number>();
  for (const arrow of level.arrows) {
    for (const cell of arrow.body) occupied.add(cell[0]! * level.cols + cell[1]!);
  }
  const free: number[] = [];
  for (let cell = 0; cell < level.rows * level.cols; cell += 1) {
    if (!occupied.has(cell)) free.push(cell);
  }

  const groupCount = Math.min(request.groupCount, GROUP_NAMES.length);
  if (free.length < groupCount * request.cellsPerGroup) return undefined;
  if (level.arrows.length < groupCount * 2 + 2) return undefined;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const takenCells = new Set<number>();
    const takenArrows = new Set<number>();
    const gates: GateSpec[] = [];
    const groupOf = new Map<number, string>();

    let ok = true;
    for (let g = 0; g < groupCount && ok; g += 1) {
      const name = GROUP_NAMES[g]!;

      // A colour wants at least two arrows — a single-arrow colour reads as one
      // arrow with a hat on, not as a group the player has to track.
      const members = 1 + Math.floor(rng() * 2);
      for (let m = 0; m < members; m += 1) {
        for (let tries = 0; tries < 8; tries += 1) {
          const pick = Math.floor(rng() * level.arrows.length);
          if (takenArrows.has(pick)) continue;
          takenArrows.add(pick);
          groupOf.set(pick, name);
          break;
        }
      }

      const cells: number[][] = [];
      for (let c = 0; c < request.cellsPerGroup; c += 1) {
        let placed = false;
        for (let tries = 0; tries < 12 && !placed; tries += 1) {
          const cell = free[Math.floor(rng() * free.length)]!;
          if (takenCells.has(cell)) continue;
          takenCells.add(cell);
          cells.push([Math.floor(cell / level.cols), cell % level.cols]);
          placed = true;
        }
        if (!placed) ok = false;
      }
      if (cells.length === 0) ok = false;
      else gates.push({ cells, group: name, mode: request.mode });
    }

    if (!ok || groupOf.size === 0) continue;

    const candidate: LevelDefinition = {
      ...level,
      arrows: level.arrows.map((arrow, index) => {
        const group = groupOf.get(index);
        return group === undefined ? arrow : { ...arrow, group };
      }),
      gates,
    };

    const rebuilt = buildLevel(candidate);
    if (!rebuilt.ok) continue;

    const { board, initial } = rebuilt.value;
    if (!isSolvable(board, initial)) continue;

    const metrics = analyze(board, initial);
    if (request.mode === 'shuts') {
      if (metrics.blunderRate <= 0) continue;
    } else if (metrics.dependencyDepth <= baselineDepth) {
      continue;
    }

    return candidate;
  }

  return undefined;
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
    // Budget scales with the board: a knot can be as big as the arrow count, and a
    // fixed forty rounds silently became "give up" once boards reached a hundred
    // snakes.
    const repaired = repairBoard(rng, playable, Math.max(40, arrows.length * 2));
    if (!repaired) continue;
    playable = repaired;

    let built = buildLevel(playable);
    if (!built.ok) continue;
    if (!isSolvable(built.value.board, built.value.initial)) continue;

    // Gates go on last, onto a board already known to work. Adding them earlier
    // would mean the repair pass fighting the gate constraint at the same time as
    // the cycle constraint, and repair is only cheap because it has one job.
    if (options.gate) {
      const gated = addGates(rng, playable, options.gate, 24);
      // A level that asked for a gate and could not get one is not a level — the
      // plan said this board is a planning level, and silently shipping it as an
      // ordinary one would put a `shuts` name on a board with no shutter in it.
      if (!gated) continue;
      playable = gated;

      const regrown = buildLevel(playable);
      if (!regrown.ok) continue;
      built = regrown;
    }

    const { board, initial } = built.value;
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
