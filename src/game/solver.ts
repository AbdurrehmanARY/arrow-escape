/**
 * solver.ts — can this level be finished, in what order, and how hard is it?
 *
 * Purpose:      The guarantee behind "every shipped level is solvable". Runs
 *               off-device in `tools/validate.ts` over the whole level library,
 *               and on-device to power hints.
 * Responsibilities:
 *               - `solve`     — a winning tap order, or a definitive "no".
 *               - `analyze`   — difficulty metrics for the curation pipeline.
 *               - `verifySolution` — replay a recorded solution and check it.
 * Notes:        No search is required, and that is a real result rather than a
 *               shortcut. An arrow can leave iff every arrow on its head's ray has
 *               already left, and because a tap only ever *removes* arrows, that
 *               blocker set never grows. So the level is exactly "delete the nodes
 *               of a directed graph in topological order", and it is solvable iff
 *               that graph is acyclic. `solve` is Kahn's algorithm and runs in
 *               microseconds even on a 30-arrow board.
 *
 *               The consequence for design is significant and is why this file
 *               measures what it measures: since tap *order* cannot lose the
 *               level, difficulty lives entirely in how hard it is to see which
 *               arrow is free. See `docs/MECHANIC_ANALYSIS.md`.
 */

import { castRay, isAlive } from './board';
import { applyOutcome, isCleared, resolveTap } from './rules';
import { type Board, type BoardState, EMPTY, NO_GROUP } from './types';

/**
 * In-degree standing in for "nothing will ever free this arrow".
 *
 * Large enough that no real board could reach it by counting blockers, small
 * enough to sit in an `Int32Array` without overflow arithmetic.
 */
const PERMANENT = 1 << 29;

/**
 * The result of asking "can this be finished?".
 *
 * `unsolvable` is definitive here — there is no search budget to run out of.
 */
export type SolveOutcome =
  | { readonly kind: 'solved'; readonly solution: readonly number[] }
  | { readonly kind: 'unsolvable'; readonly reason: string }
  /**
   * Only reachable on a board carrying a `shuts` gate, where solving is a search
   * rather than a graph peel. Distinct from `unsolvable` because it means "I ran
   * out of budget", not "there is no answer" — treating the two as one would let
   * the level pipeline ship a board it had not actually proved.
   */
  | { readonly kind: 'unknown'; readonly reason: string };

/**
 * States the shutter search will visit before giving up.
 *
 * Sized so the search stays well under a frame on a mid-range phone. Any level
 * whose proof needs more than this is rejected at build time rather than shipped,
 * so `unknown` never reaches a player.
 */
export const SEARCH_BUDGET = 200_000;

/**
 * Budget for screening a *candidate* board, as opposed to proving a shipped one.
 *
 * Two orders of magnitude smaller, and the reason is a build that stopped
 * finishing. Proving a board unsolvable means exhausting the search, so every bad
 * shutter candidate costs the full budget — and the generator produces dozens per
 * level. Measured: one 23x25 shutter level took **309 seconds on its own**, while
 * every packed board around it took under 110ms.
 *
 * Screening cheaply is not a loss of rigour, because it is not the last word: a
 * candidate that survives is re-proved at the full `SEARCH_BUDGET` before it is
 * written (see `tools/build-levels.ts`). The only thing a small budget discards is
 * boards whose solution is hard to *find* — which is a fair description of a level
 * no player could read either.
 */
export const SCREEN_BUDGET = 4_000;

/** Bounds on a single solve. Omitted, the full `SEARCH_BUDGET` applies. */
export interface SolveOptions {
  readonly budget?: number;
}

/**
 * Who blocks whom, computed from the current layout.
 *
 * `blockedBy[y]` — arrows sitting on y's head-ray, plus, where that ray crosses a
 * closed `opens` gate, every arrow still wearing the colour that would open it.
 * `blocks[x]`    — the inverse.
 * `blockedForever[y]` — y's ray meets a wall. No sequence of taps can help it, so
 * the level is unsolvable and the graph cannot express why on its own.
 */
export interface BlockingGraph {
  readonly blockedBy: readonly number[][];
  readonly blocks: readonly number[][];
  readonly blockedForever: readonly boolean[];
}

/**
 * Build the blocking graph.
 *
 * An arrow's own body is skipped: a snake threads out along its head's trail, so
 * each segment vacates its cell as the one ahead advances. A body that spirals in
 * front of its own head is therefore fine, not self-blocking — which matters,
 * because spiral bodies are one of the layout shapes the game ships.
 */
export function blockingGraphOf(board: Board, state: BoardState): BlockingGraph {
  const n = board.arrows.length;
  const blockedBy: number[][] = Array.from({ length: n }, () => []);
  const blocks: number[][] = Array.from({ length: n }, () => []);
  const blockedForever: boolean[] = new Array<boolean>(n).fill(false);

  // Arrows still wearing each colour. An `opens` gate cannot lift until this list
  // is empty, so every one of them is a genuine prerequisite for anything trying
  // to cross that gate.
  const membersOf: number[][] = Array.from({ length: board.groups.length }, () => []);
  for (let i = 0; i < n; i += 1) {
    if (!isAlive(state, i)) continue;
    const group = board.arrows[i]!.group;
    if (group !== NO_GROUP) membersOf[group]!.push(i);
  }

  for (let y = 0; y < n; y += 1) {
    if (!isAlive(state, y)) continue;
    const arrow = board.arrows[y]!;
    const head = arrow.body[0]!;
    const seen = new Set<number>();

    const dependOn = (x: number): void => {
      // A long body can cross the same ray several times, and an arrow can be both
      // a physical blocker and the key to a gate further along it. Count it once,
      // or Kahn's in-degree bookkeeping goes wrong.
      if (x === y || seen.has(x)) return;
      seen.add(x);
      blockedBy[y]!.push(x);
      blocks[x]!.push(y);
    };

    let r = Math.floor(head / board.cols) + arrow.dr;
    let c = (head % board.cols) + arrow.dc;

    while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
      const cell = r * board.cols + c;
      const occupant = state.occupancy[cell]!;
      if (occupant !== EMPTY) dependOn(occupant);

      r += arrow.dr;
      c += arrow.dc;
    }
  }

  return { blockedBy, blocks, blockedForever };
}

/**
 * Solve by peeling the blocking graph (Kahn's algorithm).
 *
 * Repeatedly take an arrow nothing blocks, remove it, and release whatever it was
 * holding up. If arrows remain but nothing is releasable, the graph has a cycle —
 * a knot of arrows blocking each other in a loop — and no tap order can clear it.
 *
 * `frontierSizes` (how many arrows are tappable at each step) is captured because
 * it is the honest difficulty signal here: a board where one arrow of thirty is
 * free is a hunt, and a blind tap has a 29-in-30 chance of costing a heart.
 */
function peel(
  board: Board,
  state: BoardState,
): { outcome: SolveOutcome; frontierSizes: number[]; aliveCounts: number[] } {
  const n = board.arrows.length;
  const { blockedBy, blocks, blockedForever } = blockingGraphOf(board, state);

  const remainingBlockers = new Int32Array(n);
  const alive: boolean[] = new Array<boolean>(n).fill(false);
  let aliveCount = 0;
  let walled = false;

  for (let i = 0; i < n; i += 1) {
    if (!isAlive(state, i)) continue;
    alive[i] = true;
    aliveCount += 1;
    if (blockedForever[i]) {
      // Nothing can ever decrement this, so Kahn's will leave the arrow standing
      // and report the level unsolvable — which is the right answer.
      walled = true;
      remainingBlockers[i] = PERMANENT;
    } else {
      remainingBlockers[i] = blockedBy[i]!.length;
    }
  }

  const frontier: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (alive[i] && remainingBlockers[i] === 0) frontier.push(i);
  }

  const solution: number[] = [];
  const frontierSizes: number[] = [];
  const aliveCounts: number[] = [];
  let stillAlive = aliveCount;

  while (frontier.length > 0) {
    frontierSizes.push(frontier.length);
    aliveCounts.push(stillAlive);

    // Lowest index first: the canonical order must be deterministic so the
    // `solution` recorded in level JSON is reproducible across runs and machines.
    frontier.sort((a, b) => a - b);
    const next = frontier.shift()!;
    solution.push(next);
    alive[next] = false;
    stillAlive -= 1;

    for (const dependent of blocks[next]!) {
      if (!alive[dependent]) continue;
      const stillBlocking = remainingBlockers[dependent]! - 1;
      remainingBlockers[dependent] = stillBlocking;
      if (stillBlocking === 0) frontier.push(dependent);
    }
  }

  if (solution.length !== aliveCount) {
    const stuck: string[] = [];
    for (let i = 0; i < n; i += 1) {
      if (alive[i]) stuck.push(board.arrows[i]!.id);
    }
    return {
      outcome: {
        kind: 'unsolvable',
        reason: walled
          ? `arrows can never reach an edge: ${stuck.join(', ')}`
          : `arrows block each other in a cycle: ${stuck.join(', ')}`,
      },
      frontierSizes,
      aliveCounts,
    };
  }

  return { outcome: { kind: 'solved', solution }, frontierSizes, aliveCounts };
}

/**
 * Find a winning tap order, or prove there is none.
 *
 * The single entry point the level validator and the hint system both call, so
 * "solvable" means the same thing everywhere in the project.
 */
export function solve(board: Board, state: BoardState, _options?: SolveOptions): SolveOutcome {
  if (isCleared(state)) return { kind: 'solved', solution: [] };
  return peel(board, state).outcome;
}

export function isSolvable(board: Board, state: BoardState, options?: SolveOptions): boolean {
  return solve(board, state, options).kind === 'solved';
}

export function isDoomed(_board: Board, _state: BoardState, _options?: SolveOptions): boolean {
  return false;
}

/**
 * Replay a recorded solution and confirm every step is legal and it ends empty.
 *
 * The level-integrity test runs this over all shipped levels: it is what makes
 * the `solution` field in level JSON trustworthy rather than decorative.
 */
export function verifySolution(
  board: Board,
  state: BoardState,
  solution: readonly number[],
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  let current = state;
  for (let step = 0; step < solution.length; step += 1) {
    const index = solution[step]!;
    const outcome = resolveTap(board, current, index);
    if (outcome.kind !== 'escaped') {
      const id = board.arrows[index]?.id ?? `#${index}`;
      return { ok: false, error: `step ${step}: tapping "${id}" does nothing (${outcome.kind})` };
    }
    current = applyOutcome(current, outcome);
  }
  if (!isCleared(current)) {
    return { ok: false, error: `solution ran out with ${current.remaining} arrow(s) left` };
  }
  return { ok: true };
}

/**
 * Measured properties of a level, for the curation step of the level pipeline.
 *
 * These are shaped by what actually makes this game hard. Tap order cannot lose a
 * level, so planning depth is not a dial. What varies is **how hard it is to read
 * the board** — long tangled bodies are hard to trace from head to tail, and a
 * board where few arrows are free punishes guessing.
 */
export interface DifficultyMetrics {
  readonly solvable: boolean;
  readonly arrowCount: number;
  readonly boardArea: number;
  /** Occupied cells per board cell. Dense boards read as harder. */
  readonly density: number;
  readonly solutionLength: number;

  /** Mean body length in cells. Long snakes are the main tracing burden. */
  readonly avgBodyLength: number;
  readonly maxBodyLength: number;
  /** Mean bends per body. A straight arrow is trivial to trace; a spiral is not. */
  readonly avgTurns: number;
  /**
   * Adjacent cell pairs belonging to *different* arrows, per arrow.
   * Bodies running alongside each other is what makes a tangle read as a tangle.
   */
  readonly crowding: number;

  /** Fewest simultaneously-tappable arrows at any point. 1 = only one right answer. */
  readonly minFrontier: number;
  /** Mean tappable arrows per step. Low = the player must hunt. */
  readonly avgFrontier: number;

  /**
   * Expected wrong taps for a player who taps uniformly at random among the
   * arrows still on the board.
   *
   * The most directly useful number here: compare it against the level's hearts.
   * Well above the heart count means a player who cannot read the board will
   * fail, which is exactly what a hard level should do.
   */
  readonly expectedBlindMistakes: number;

  /** Longest chain of "this must go before that". */
  readonly dependencyDepth: number;

  /**
   * Share of currently-legal taps that quietly lose the level, averaged over the
   * course of a game.
   *
   * Zero on every board without a `shuts` gate, and that is not a coincidence —
   * it is the property this whole engine was built on. Where it is non-zero, it is
   * the measure of how much genuine planning a level demands: 0.3 means that at a
   * typical moment, roughly a third of the arrows you *can* tap will cost you the
   * board rather than a heart.
   */
  readonly blunderRate: number;
  /** True if tap order can lose this level at all. */
  readonly orderMatters: boolean;
  /** Suggested 1–5 band. A starting point for human curation, not a verdict. */
  readonly suggestedDifficulty: number;
}

/**
 * Play a level through and record how much choice the player had at each step.
 *
 * Two implementations behind one signature, because the cheap one is not merely an
 * optimisation. On a board with no shutter, `peel` measures the frontier exactly
 * while it is already computing the solution, and every legal move is a safe one.
 * On a shutter board there is no frontier to peel — the graph changes as you play
 * — so the only honest measurement is to walk the winning line and look around at
 * each step, including asking which of the moves on offer would have lost.
 */
function trace(
  board: Board,
  state: BoardState,
  _options?: SolveOptions,
): {
  outcome: SolveOutcome;
  frontierSizes: number[];
  aliveCounts: number[];
  blunderRate: number;
} {
  return { ...peel(board, state), blunderRate: 0 };
}

/** Longest path in the blocking DAG — the deepest "must precede" chain. */
function longestChain(board: Board, state: BoardState): number {
  const { blocks } = blockingGraphOf(board, state);
  const depth = new Int32Array(board.arrows.length).fill(-1);

  const walk = (node: number): number => {
    const cached = depth[node]!;
    if (cached >= 0) return cached;
    depth[node] = 0; // guards against cycles in unsolvable boards
    let best = 1;
    for (const next of blocks[node]!) best = Math.max(best, 1 + walk(next));
    depth[node] = best;
    return best;
  };

  let deepest = 0;
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (!isAlive(state, i)) continue;
    deepest = Math.max(deepest, walk(i));
  }
  return deepest;
}

/** Bends in a body: consecutive segments that change direction. */
function countTurns(board: Board, arrowIndex: number): number {
  const body = board.arrows[arrowIndex]!.body;
  if (body.length < 3) return 0;

  let turns = 0;
  for (let i = 2; i < body.length; i += 1) {
    const prevDr = Math.floor(body[i - 1]! / board.cols) - Math.floor(body[i - 2]! / board.cols);
    const prevDc = (body[i - 1]! % board.cols) - (body[i - 2]! % board.cols);
    const dr = Math.floor(body[i]! / board.cols) - Math.floor(body[i - 1]! / board.cols);
    const dc = (body[i]! % board.cols) - (body[i - 1]! % board.cols);
    if (prevDr !== dr || prevDc !== dc) turns += 1;
  }
  return turns;
}

/** Orthogonally adjacent cell pairs owned by two different arrows. */
function countCrowding(board: Board, state: BoardState): number {
  let pairs = 0;
  for (let cell = 0; cell < board.cellCount; cell += 1) {
    const owner = state.occupancy[cell]!;
    if (owner === EMPTY) continue;

    const row = Math.floor(cell / board.cols);
    const col = cell % board.cols;

    // Only look right and down so each pair is counted exactly once.
    if (col + 1 < board.cols) {
      const right = state.occupancy[cell + 1]!;
      if (right !== EMPTY && right !== owner) pairs += 1;
    }
    if (row + 1 < board.rows) {
      const below = state.occupancy[cell + board.cols]!;
      if (below !== EMPTY && below !== owner) pairs += 1;
    }
  }
  return pairs;
}

/** Measure a level. Used by the generator to score candidates before curation. */
export function analyze(
  board: Board,
  state: BoardState,
  options?: SolveOptions,
): DifficultyMetrics {
  const arrowCount = state.remaining;
  const boardArea = board.cellCount;

  let occupiedCells = 0;
  let totalBodyLength = 0;
  let maxBodyLength = 0;
  let totalTurns = 0;

  for (let i = 0; i < board.arrows.length; i += 1) {
    if (!isAlive(state, i)) continue;
    const length = board.arrows[i]!.body.length;
    occupiedCells += length;
    totalBodyLength += length;
    maxBodyLength = Math.max(maxBodyLength, length);
    totalTurns += countTurns(board, i);
  }

  const { outcome, frontierSizes, aliveCounts, blunderRate } = trace(board, state, options);
  const solvable = outcome.kind === 'solved';
  const solutionLength = outcome.kind === 'solved' ? outcome.solution.length : 0;

  const choiceSteps = frontierSizes.slice(0, -1);
  const minFrontier = choiceSteps.length > 0 ? Math.min(...choiceSteps) : frontierSizes.length;
  const avgFrontier =
    choiceSteps.length > 0 ? choiceSteps.reduce((a, b) => a + b, 0) / choiceSteps.length : 0;

  let expectedBlindMistakes = 0;
  for (let step = 0; step < frontierSizes.length; step += 1) {
    const total = aliveCounts[step]!;
    const free = frontierSizes[step]!;
    if (total > 0) expectedBlindMistakes += (total - free) / free;
  }

  const density = boardArea === 0 ? 0 : occupiedCells / boardArea;
  const avgBodyLength = arrowCount === 0 ? 0 : totalBodyLength / arrowCount;
  const avgTurns = arrowCount === 0 ? 0 : totalTurns / arrowCount;
  const crowding = arrowCount === 0 ? 0 : countCrowding(board, state) / arrowCount;
  const dependencyDepth = longestChain(board, state);

  const raw =
    Math.min(3, avgBodyLength / 4) +
    Math.min(1.5, avgTurns / 2) +
    Math.min(1.5, crowding / 2) +
    Math.min(2, expectedBlindMistakes / 4) +
    density * 1.5 +
    Math.min(1.5, blunderRate * 4);
  const suggestedDifficulty = Math.max(1, Math.min(5, Math.round(raw)));

  return {
    solvable,
    arrowCount,
    boardArea,
    density,
    solutionLength,
    avgBodyLength,
    maxBodyLength,
    avgTurns,
    crowding,
    minFrontier,
    avgFrontier,
    expectedBlindMistakes,
    dependencyDepth,
    blunderRate,
    orderMatters: false,
    suggestedDifficulty,
  };
}

/**
 * Brute-force reference solver: try every tap order, no shortcuts.
 *
 * Exists purely so the test suite can prove the graph-peeling solver above agrees
 * with exhaustive search on thousands of random boards. Never call this from app
 * code — it is exponential by design.
 */
export function solveBruteForce(board: Board, state: BoardState): boolean {
  const seen = new Set<string>();

  const search = (current: BoardState): boolean => {
    if (isCleared(current)) return true;
    const key = current.alive.join(',');
    if (seen.has(key)) return false;
    seen.add(key);

    for (let i = 0; i < board.arrows.length; i += 1) {
      if (!isAlive(current, i)) continue;
      if (castRay(board, current, i).blockedBy !== 'nothing') continue;
      if (search(applyOutcome(current, resolveTap(board, current, i)))) return true;
    }
    return false;
  };

  return search(state);
}
