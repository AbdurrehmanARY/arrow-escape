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
  SCREEN_BUDGET,
} from '../src/game';
import { maskCapacity, maskFor, type ShapeName } from './shapes';

/**
 * Screening, not proving.
 *
 * Everything in this file is judging a *candidate*, and a candidate is cheap to
 * throw away. Only shutter boards are affected — every other board is peeled, not
 * searched — but on those the difference is the whole build: one shutter level was
 * measured at 309 seconds against ~100ms for the packed boards either side of it,
 * because proving a board unsolvable means exhausting the search and the generator
 * makes dozens of doomed candidates per level.
 *
 * Whatever survives is re-solved at the full budget in `build-levels.ts` before it
 * is written, so this trades away only boards that are hard to *find* an answer
 * for — which is the kind of level worth losing.
 */
const SCREEN_BUDGET_OPTIONS = { budget: SCREEN_BUDGET } as const;

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
  /** Filled in as attempts run, for the density probe. Tooling only. */
  readonly stats?: GenerateStats;
  /**
   * Pack the board centre-outward instead of growing it at random.
   *
   * The only way to reach four-fifths coverage and stay solvable — see
   * `growPackedBoard`. Costs nothing on a sparse board but changes the character
   * of the layout, so it is opt-in rather than the default.
   */
  readonly packed?: boolean;
}

/**
 * Where attempts are being lost, for diagnosing a plan that will not generate.
 *
 * "No solvable board found" is the same message whether the shape could not hold
 * the snakes, or held them fine and every layout came out a knot — and those call
 * for opposite fixes. Optional, and only the tooling passes it.
 */
export interface GenerateStats {
  attempts: number;
  /** Growth could not place enough snakes: the shape or the lengths are too tight. */
  growthFailed: number;
  /** Grew fine, but the blocking graph had a cycle repair could not break. */
  unsolvable: number;
  /** Grew and solved. */
  ok: number;
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

/** Walks tried from one start cell before giving up on it. See `tryPlaceAt`. */
const PACK_RETRIES = 4;

/**
 * Shortest snake a packed board will accept.
 *
 * Two cells is the shortest thing the rules recognise as an arrow — it needs a
 * neck to point from. On a board being filled to four-fifths, taking the two-cell
 * scraps is what closes the last gaps.
 */
const PACK_MIN_BODY = 2;

/**
 * Grow a densely packed board that is solvable by construction, centre outward.
 *
 * The other approach — grow a board, then work out whether it can be solved — has
 * a hard ceiling, and it was measured rather than guessed: at four-fifths coverage
 * it produced nothing playable at all above about 30x30, because the chance a
 * *random* dense board has an acyclic blocking graph collapses exponentially with
 * size. Reversing arrows to unpick the knot claws some of it back and then stops.
 *
 * This turns the problem around. Snakes are placed from the middle of the board
 * outward, and each new one is kept only if it has an end whose ray to the edge is
 * clear of everything placed *so far*. That single rule is enough, because of how
 * the two orders line up:
 *
 * - Placement runs centre outward, so when a snake is placed, the occupied cells
 *   are all more central than it is and its outward ray crosses empty space.
 * - **The peel order is exactly the reverse of the placement order.** When that
 *   snake is tapped, the arrows still on the board are precisely those placed
 *   before it — the ones its ray was checked against.
 *
 * So the check made at placement time is the same check the rules make at play
 * time, and a board built this way cannot contain a blocking cycle. There is
 * nothing to verify afterwards and nothing to repair.
 *
 * Dense boards peel from the outside in, which is what a player discovers anyway;
 * this simply builds them in the order that makes that true.
 */
function growPackedBoard(
  rng: () => number,
  options: GenerateOptions,
  maskCells: readonly number[],
  owner: Int32Array,
): readonly ArrowSpec[] | undefined {
  const { rows, cols, arrowCount, minBodyLength, maxBodyLength } = options;

  owner.fill(-2);
  for (const cell of maskCells) owner[cell] = -1;

  // Centre first. Ties are shuffled so two levels of the same size do not lay
  // their snakes down in the same order.
  const starts = [...maskCells];
  shuffle(starts, rng);
  const distanceToEdge = (cell: number): number => {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    return Math.min(r, rows - 1 - r, c, cols - 1 - c);
  };
  starts.sort((a, b) => distanceToEdge(b) - distanceToEdge(a));

  const arrows: ArrowSpec[] = [];
  const scratch: number[] = [];

  /** Does this end have a clear run to the edge over everything placed so far? */
  const rayIsClear = (head: number, neck: number, index: number): boolean => {
    const dr = Math.floor(head / cols) - Math.floor(neck / cols);
    const dc = (head % cols) - (neck % cols);
    let r = Math.floor(head / cols) + dr;
    let c = (head % cols) + dc;

    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      const occupant = owner[r * cols + c]!;
      // -1 free, -2 outside the shape. Outside is not a wall: the mask only says
      // where snakes may be grown, and an arrow leaves straight through it.
      if (occupant >= 0 && occupant !== index) return false;
      r += dr;
      c += dc;
    }
    return true;
  };

  for (const start of starts) {
    if (arrows.length >= arrowCount) break;
    if (owner[start] !== -1) continue;
    if (!tryPlaceAt(start)) continue;
  }

  /**
   * Grow and keep a snake from this cell, retrying the walk a few times.
   *
   * The retry matters more as the board fills. A self-avoiding walk is random, so
   * one attempt from a good cell can wander into a pocket and come out too short,
   * or finish with both ends facing into the crowd. Trying again from the same
   * start costs almost nothing and is the difference between leaving a hole and
   * filling it — on a 60x60 board it is worth several percent of coverage.
   */
  function tryPlaceAt(start: number): boolean {
    for (let attempt = 0; attempt < PACK_RETRIES; attempt += 1) {
      if (growOne(start)) return true;
    }
    return false;
  }

  function growOne(start: number): boolean {
    const index = arrows.length;
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

      // Warnsdorff's rule: step into the cell with the *fewest* onward options.
      //
      // A purely random self-avoiding walk is fine when there is room, and hopeless
      // once the board is filling — it wanders into the open middle and strands
      // pockets behind it, so long snakes rarely finish and coverage stalls. Taking
      // the most constrained neighbour first makes the walk hug the frontier and
      // consume awkward corners while they are still reachable. It is the classic
      // knight's-tour heuristic, and it is what turns a 60x60 board from three-fifths
      // covered into four-fifths.
      //
      // Ties are still broken by reservoir sample, so the shape stays varied rather
      // than becoming a deterministic boustrophedon.
      let chosen = -1;
      let bestFreedom = 5;
      let seen = 0;
      for (const next of scratch) {
        const nr = Math.floor(next / cols);
        const nc = next % cols;
        let touches = 0;
        let freedom = 0;
        if (nr > 0) {
          if (owner[next - cols] === index) touches += 1;
          if (owner[next - cols] === -1) freedom += 1;
        }
        if (nr + 1 < rows) {
          if (owner[next + cols] === index) touches += 1;
          if (owner[next + cols] === -1) freedom += 1;
        }
        if (nc > 0) {
          if (owner[next - 1] === index) touches += 1;
          if (owner[next - 1] === -1) freedom += 1;
        }
        if (nc + 1 < cols) {
          if (owner[next + 1] === index) touches += 1;
          if (owner[next + 1] === -1) freedom += 1;
        }
        if (touches !== 1) continue;

        if (freedom < bestFreedom) {
          bestFreedom = freedom;
          seen = 1;
          chosen = next;
        } else if (freedom === bestFreedom) {
          seen += 1;
          if (Math.floor(rng() * seen) === 0) chosen = next;
        }
      }
      if (chosen === -1) break;

      owner[chosen] = index;
      body.push(chosen);
      head = chosen;
    }

    const release = (): void => {
      for (const cell of body) owner[cell] = -1;
    };

    // The requested length is an *aspiration*, not a requirement.
    //
    // Rejecting a short walk is right on a sparse board, where the length range is
    // the design. On a packed one it is the main thing standing between the board
    // and full coverage: a walk that runs out of room after six cells has still
    // filled six cells, and throwing it away leaves a hole that nothing else can
    // reach either. Asking for long snakes and keeping whatever arrives covers far
    // more than insisting on long snakes and abandoning the corners.
    if (body.length < PACK_MIN_BODY) {
      release();
      return false;
    }

    // Either end may carry the head. Take whichever has a clear run; if neither
    // does, this snake cannot be peeled in its turn, so drop it and free the cells
    // for a shape that can.
    const first = body[0]!;
    const last = body[body.length - 1]!;
    let ordered: number[] | undefined;
    if (rayIsClear(last, body[body.length - 2]!, index)) ordered = [...body].reverse();
    else if (rayIsClear(first, body[1]!, index)) ordered = body;

    if (!ordered) {
      release();
      return false;
    }

    arrows.push({
      id: `a${arrows.length}`,
      body: ordered.map((cell) => [Math.floor(cell / cols), cell % cols]),
    });
    return true;
  }

  return arrows.length >= Math.ceil(arrowCount * 0.5) ? arrows : undefined;
}

/**
 * Choose every snake's head-end so that the board is solvable **by construction**.
 *
 * This replaces guess-and-check at density, and the reason it has to is measurable.
 * A board is solvable iff its blocking graph is acyclic, and the chance a *random*
 * orientation is acyclic collapses as arrows are added: at 20x20 the repair pass
 * still finds a way most of the time, and by 40x40 it failed on **100%** of
 * attempts — not because the shape could not hold the snakes (growth succeeded
 * every time) but because every layout was a knot. No amount of resampling fixes
 * an exponentially unlikely event.
 *
 * So instead of producing a board and asking whether it can be solved, this
 * produces the solution and reads the board off it. Repeatedly: find any arrow
 * that has *some* orientation whose ray is clear of the arrows still present, fix
 * it that way, and take it off the board. The sequence built is a winning order, so
 * the board it describes cannot contain a cycle — there is nothing to check
 * afterwards.
 *
 * It works at density for a reason worth knowing: an arrow with a cell on the
 * border, pointed outward, has a ray of length zero and is therefore *always* free.
 * Dense boards peel from the outside in, and there is always an outside.
 *
 * Reversing a body is free — it swaps which end carries the arrowhead and leaves
 * the silhouette untouched — so this costs nothing in how the level looks.
 *
 * Returns `undefined` if it stalls, which is rare and handled by trying another
 * seed.
 */
function orientForSolvability(
  rng: () => number,
  level: LevelDefinition,
): LevelDefinition | undefined {
  const { rows, cols } = level;
  const bodies = level.arrows.map((arrow) => arrow.body.map((cell) => [cell[0]!, cell[1]!]));

  // cell -> index of the arrow still on it, or -1.
  const occupancy = new Int32Array(rows * cols).fill(-1);
  bodies.forEach((body, index) => {
    for (const [r, c] of body) occupancy[r! * cols + c!] = index;
  });

  /** Is this head's ray clear of every arrow still on the board? */
  const rayIsClear = (body: number[][], index: number): boolean => {
    const head = body[0]!;
    const neck = body[1]!;
    const dr = head[0]! - neck[0]!;
    const dc = head[1]! - neck[1]!;

    let r = head[0]! + dr;
    let c = head[1]! + dc;
    while (r >= 0 && r < rows && c >= 0 && c < cols) {
      const occupant = occupancy[r * cols + c]!;
      // Its own body never blocks it — each segment vacates as the one ahead moves.
      if (occupant !== -1 && occupant !== index) return false;
      r += dr;
      c += dc;
    }
    return true;
  };

  const remaining = new Set<number>(bodies.map((_, index) => index));
  const chosen: (number[][] | undefined)[] = new Array<number[][] | undefined>(bodies.length);

  while (remaining.size > 0) {
    // Shuffled so the peel order — and therefore the finished board — varies with
    // the seed rather than always favouring the lowest index.
    const candidates = [...remaining];
    shuffle(candidates, rng);

    let removed = -1;
    for (const index of candidates) {
      const body = bodies[index]!;
      if (body.length < 2) continue;

      const reversed = [...body].reverse();
      let pick: number[][] | undefined;
      if (rayIsClear(body, index)) pick = body;
      else if (rayIsClear(reversed, index)) pick = reversed;
      if (!pick) continue;

      chosen[index] = pick;
      for (const [r, c] of pick) occupancy[r! * cols + c!] = -1;
      remaining.delete(index);
      removed = index;
      break;
    }

    if (removed === -1) return undefined;
  }

  return {
    ...level,
    arrows: level.arrows.map((arrow, index) => {
      const body = chosen[index];
      return body ? { ...arrow, body } : arrow;
    }),
  };
}

/**
 * Point every snake at its nearer edge, before asking whether the board works.
 *
 * This is the change that makes dense boards possible at all, and the reasoning is
 * worth stating because the naive version is so much worse.
 *
 * A board is solvable iff its blocking graph is acyclic, and an arrow's blockers
 * are whatever sits on its head's ray. So the number of chances a board has to
 * form a cycle scales with **total ray length** — every cell on every ray is a
 * potential edge. Growth leaves each snake's head at whichever end the random walk
 * finished, which means half of them face the long way across the board for no
 * reason at all.
 *
 * Reversing a body swaps which end carries the head. It changes the exit direction
 * and leaves the silhouette untouched, so it is free. Choosing the end with the
 * shorter ray therefore cuts total ray length roughly in half, and cycles fall away
 * with it. Measured on a 40x40 board at 75% fill, this took the share of generated
 * candidates that were solvable at all from **none** to most of them.
 *
 * `repairBoard` still runs afterwards. This gets the board into a position where
 * repair has a knot small enough to pick apart, rather than a board-sized one.
 */
function orientOutward(level: LevelDefinition): LevelDefinition {
  const { rows, cols } = level;

  const raySteps = (head: readonly number[], neck: readonly number[] | undefined): number => {
    // With no neck the direction is unknown; treat it as the worst case so a
    // single-cell arrow is never preferred on a false reading.
    if (!neck) return rows + cols;
    const dr = head[0]! - neck[0]!;
    const dc = head[1]! - neck[1]!;
    if (dr === -1) return head[0]!;
    if (dr === 1) return rows - 1 - head[0]!;
    if (dc === -1) return head[1]!;
    return cols - 1 - head[1]!;
  };

  const arrows = level.arrows.map((arrow) => {
    const body = arrow.body;
    if (body.length < 2) return arrow;

    const forward = raySteps(body[0]!, body[1]);
    const reversed = raySteps(body[body.length - 1]!, body[body.length - 2]);
    return reversed < forward ? { ...arrow, body: [...body].reverse() } : arrow;
  });

  return { ...level, arrows };
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

  const baselineDepth = analyze(
    built.value.board,
    built.value.initial,
    SCREEN_BUDGET_OPTIONS,
  ).dependencyDepth;

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
    if (!isSolvable(board, initial, SCREEN_BUDGET_OPTIONS)) continue;

    const metrics = analyze(board, initial, SCREEN_BUDGET_OPTIONS);
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
    if (options.stats) options.stats.attempts += 1;

    const arrows = options.packed
      ? growPackedBoard(rng, options, maskCells, owner)
      : growBoard(rng, options, maskCells, owner);
    if (!arrows) {
      if (options.stats) options.stats.growthFailed += 1;
      continue;
    }

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

    // Solvability is arranged, not hoped for. `orientForSolvability` builds a
    // winning order and reads the head-ends off it, so the result cannot contain a
    // blocking cycle. On the rare board where it stalls, fall back to the older
    // flip-the-knot repair, which is still the better tool on sparse boards where
    // it converges in a handful of rounds.
    let playable = options.packed ? level : orientForSolvability(rng, level);
    if (!playable) {
      const outward = orientOutward(level);
      playable = repairBoard(rng, outward, Math.max(40, arrows.length * 2));
    }
    if (!playable || !buildLevel(playable).ok) {
      if (options.stats) options.stats.unsolvable += 1;
      continue;
    }

    let built = buildLevel(playable);
    if (!built.ok) continue;
    if (!isSolvable(built.value.board, built.value.initial, SCREEN_BUDGET_OPTIONS)) {
      if (options.stats) options.stats.unsolvable += 1;
      continue;
    }
    if (options.stats) options.stats.ok += 1;

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
    const metrics = analyze(board, initial, SCREEN_BUDGET_OPTIONS);
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
