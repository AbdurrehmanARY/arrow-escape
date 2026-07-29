/**
 * helpers.ts — shared test utilities.
 *
 * Not a test file itself (the Jest `testMatch` only picks up `*.test.ts`).
 * Provides board authoring from ASCII art and a deterministic random-board
 * generator, so the property tests produce the same boards on every run and on
 * every machine. A flaky property test is worse than no property test.
 */

import {
  type ArrowSpec,
  buildLevel,
  type BuiltLevel,
  type GateMode,
  type GateSpec,
  type LevelDefinition,
  parseAscii,
  type ParseAsciiOptions,
} from '@game';

/** Build a playable board from ASCII art, failing loudly if the art is invalid. */
export function build(art: string, hearts?: number): BuiltLevel {
  return buildWith(art, hearts !== undefined ? { hearts } : {});
}

/**
 * `build`, with the parse options gates and colour groups need.
 *
 * Separate from `build` only so the eighty existing fixtures that want nothing but
 * a picture keep reading as one argument.
 */
export function buildWith(art: string, options: ParseAsciiOptions): BuiltLevel {
  const result = buildLevel(parseAscii(art, options));
  if (!result.ok) throw new Error(`build() fixture is invalid: ${result.error}`);
  return result.value;
}

/**
 * mulberry32 — a tiny seeded PRNG.
 *
 * `Math.random` is deliberately avoided: every property test must be
 * reproducible, so a failure can be re-run and debugged rather than shrugged at.
 */
export function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomBoardOptions {
  readonly rows: number;
  readonly cols: number;
  readonly arrowCount: number;
  /** Cells per snake. Longer bodies tangle more, which is the point of the game. */
  readonly maxBodyLength?: number;
}

/**
 * Grow `arrowCount` random snakes on an empty grid by self-avoiding random walk.
 *
 * Snakes are grown rather than placed because a body must be a connected,
 * non-self-touching path — the same constraint the level generator will face in
 * Phase 3, so these boards exercise realistic shapes rather than toy ones.
 */
export function randomLevel(
  rng: () => number,
  { rows, cols, arrowCount, maxBodyLength = 4 }: RandomBoardOptions,
): LevelDefinition {
  const owner = new Int32Array(rows * cols).fill(-1);
  const arrows: ArrowSpec[] = [];

  const freeNeighbours = (cell: number): number[] => {
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
    // Pick a free starting cell for the tail.
    const candidates: number[] = [];
    for (let cell = 0; cell < owner.length; cell += 1) {
      if (owner[cell] === -1) candidates.push(cell);
    }
    if (candidates.length === 0) break;

    const start = candidates[Math.floor(rng() * candidates.length)]!;
    const body: number[] = [start];
    owner[start] = index;

    const target = 2 + Math.floor(rng() * Math.max(1, maxBodyLength - 1));
    let cursor = start;
    while (body.length < target) {
      const options = freeNeighbours(cursor);
      if (options.length === 0) break;
      const next = options[Math.floor(rng() * options.length)]!;
      owner[next] = index;
      body.push(next);
      cursor = next;
    }

    // A one-cell snake has no last segment, so its direction cannot be inferred.
    // Release it and move on rather than emit an arrow the builder would reject.
    if (body.length < 2) {
      owner[start] = -1;
      continue;
    }

    // The walk grew tail-first; the head is the far end, so reverse it.
    body.reverse();
    arrows.push({
      id: `a${arrows.length}`,
      body: body.map((cell) => [Math.floor(cell / cols), cell % cols] as const),
    });
  }

  return {
    id: 0,
    name: 'random',
    rows,
    cols,
    layout: 'free',
    difficulty: 1,
    arrows,
  };
}

/** Build a random board, skipping the `Result` unwrap. */
export function randomBoard(rng: () => number, options: RandomBoardOptions): BuiltLevel {
  const result = buildLevel(randomLevel(rng, options));
  if (!result.ok) throw new Error(`randomBoard produced invalid level: ${result.error}`);
  return result.value;
}

/** Colour names used by the randomised gate tests. Three is enough to tangle. */
const TEST_GROUPS = ['red', 'blue', 'green'] as const;

/**
 * A random board with colour groups and gates bolted on.
 *
 * Gates land on cells no arrow occupies, which is what `buildLevel` requires and
 * also what makes them interesting: a gate is only ever a hole in the board that
 * opens or shuts, never something sitting on top of a snake.
 *
 * Most of the boards this produces are unsolvable, and that is fine — the property
 * tests filter on solvability first. What matters is that the ones that survive are
 * shaped like real gate levels rather than like a special case someone thought of.
 */
export function randomGatedLevel(
  rng: () => number,
  options: RandomBoardOptions,
  mode: GateMode,
  gateCount = 2,
): LevelDefinition {
  const base = randomLevel(rng, options);
  if (base.arrows.length === 0) return base;

  const used = new Set<string>();
  const arrows: ArrowSpec[] = base.arrows.map((arrow) => {
    // Leave roughly a third of the arrows uncoloured: a board where every snake
    // wears a colour is not the common case and would hide bugs in the
    // `NO_GROUP` path.
    if (rng() < 0.35) return arrow;
    const group = TEST_GROUPS[Math.floor(rng() * TEST_GROUPS.length)]!;
    used.add(group);
    return { ...arrow, group };
  });
  if (used.size === 0) return { ...base, arrows };

  const occupied = new Set<string>();
  for (const arrow of arrows) {
    for (const cell of arrow.body) occupied.add(`${cell[0]},${cell[1]}`);
  }

  const groups = [...used];
  const gates: GateSpec[] = [];
  const taken = new Set<string>();

  for (let i = 0; i < gateCount; i += 1) {
    const row = Math.floor(rng() * base.rows);
    const col = Math.floor(rng() * base.cols);
    const key = `${row},${col}`;
    if (occupied.has(key) || taken.has(key)) continue;
    taken.add(key);
    gates.push({
      cells: [[row, col]],
      group: groups[Math.floor(rng() * groups.length)]!,
      mode,
    });
  }

  return { ...base, arrows, ...(gates.length > 0 ? { gates } : {}) };
}
