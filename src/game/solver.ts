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

import { castRay, isAlive, stateKey } from './board';
import { applyOutcome, isCleared, resolveTap } from './rules';
import { type Board, type BoardState, EMPTY } from './types';

/**
 * The result of asking "can this be finished?".
 *
 * `unsolvable` is definitive here — there is no search budget to run out of.
 */
export type SolveOutcome =
  | { readonly kind: 'solved'; readonly solution: readonly number[] }
  | { readonly kind: 'unsolvable'; readonly reason: string };

/**
 * Who blocks whom, computed from the current layout.
 *
 * `blockedBy[y]` — arrows sitting on y's head-ray.
 * `blocks[x]`    — arrows whose head-ray x sits on.
 */
export interface BlockingGraph {
  readonly blockedBy: readonly number[][];
  readonly blocks: readonly number[][];
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

  for (let y = 0; y < n; y += 1) {
    if (!isAlive(state, y)) continue;
    const arrow = board.arrows[y]!;
    const head = arrow.body[0]!;
    const seen = new Set<number>();

    let r = Math.floor(head / board.cols) + arrow.dr;
    let c = (head % board.cols) + arrow.dc;

    while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
      const occupant = state.occupancy[r * board.cols + c]!;
      // A long body can cross the same ray several times; count it once.
      if (occupant !== EMPTY && occupant !== y && !seen.has(occupant)) {
        seen.add(occupant);
        blockedBy[y]!.push(occupant);
        blocks[occupant]!.push(y);
      }
      r += arrow.dr;
      c += arrow.dc;
    }
  }

  return { blockedBy, blocks };
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
  const { blockedBy, blocks } = blockingGraphOf(board, state);

  const remainingBlockers = new Int32Array(n);
  const alive: boolean[] = new Array<boolean>(n).fill(false);
  let aliveCount = 0;

  for (let i = 0; i < n; i += 1) {
    if (!isAlive(state, i)) continue;
    alive[i] = true;
    aliveCount += 1;
    remainingBlockers[i] = blockedBy[i]!.length;
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
        reason: `arrows block each other in a cycle: ${stuck.join(', ')}`,
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
export function solve(board: Board, state: BoardState): SolveOutcome {
  if (isCleared(state)) return { kind: 'solved', solution: [] };
  return peel(board, state).outcome;
}

/** Is there any way to finish from here? Thin wrapper for readability at call sites. */
export function isSolvable(board: Board, state: BoardState): boolean {
  return solve(board, state).kind === 'solved';
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
  /** Suggested 1–5 band. A starting point for human curation, not a verdict. */
  readonly suggestedDifficulty: number;
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
export function analyze(board: Board, state: BoardState): DifficultyMetrics {
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

  const { outcome, frontierSizes, aliveCounts } = peel(board, state);
  const solvable = outcome.kind === 'solved';
  const solutionLength = outcome.kind === 'solved' ? outcome.solution.length : 0;

  // Drop the final step before measuring choice: with one arrow left the frontier
  // is always exactly 1, which would drag `minFrontier` to 1 on every board.
  const choiceSteps = frontierSizes.slice(0, -1);
  const minFrontier = choiceSteps.length > 0 ? Math.min(...choiceSteps) : frontierSizes.length;
  const avgFrontier =
    choiceSteps.length > 0 ? choiceSteps.reduce((a, b) => a + b, 0) / choiceSteps.length : 0;

  // At each step a blind player picks uniformly among the arrows still on the
  // board and keeps picking until one works. That is a geometric distribution
  // with success chance free/alive, so the expected number of *wrong* picks
  // before landing a right one is (alive - free) / free. Summing over every step
  // gives the hearts such a player would spend clearing the level.
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

  // A blunt heuristic, intentionally: it orders candidates for a human to judge.
  // Tracing load (length, turns, crowding) dominates, because that is the actual
  // skill; blind-mistake pressure is the second term because it decides whether
  // five hearts is enough.
  const raw =
    Math.min(3, avgBodyLength / 4) +
    Math.min(1.5, avgTurns / 2) +
    Math.min(1.5, crowding / 2) +
    Math.min(2, expectedBlindMistakes / 4) +
    density * 1.5;
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
    const key = stateKey(current);
    if (seen.has(key)) return false;
    seen.add(key);

    for (let i = 0; i < board.arrows.length; i += 1) {
      if (!isAlive(current, i)) continue;
      if (castRay(board, current, i).blockerIndex !== EMPTY) continue;
      if (search(applyOutcome(current, resolveTap(board, current, i)))) return true;
    }
    return false;
  };

  return search(state);
}
