/**
 * solver.ts — can this level be finished, in what order, and how hard is it?
 *
 * Purpose:      The guarantee behind "every shipped level is solvable". Runs
 *               off-device in `tools/validate.ts` over the whole level library,
 *               and on-device to power hints and honest deadlock detection.
 * Responsibilities:
 *               - `solve`     — a winning tap order, or a definitive "no".
 *               - `analyze`   — difficulty metrics for the curation pipeline.
 *               - `countSolutionsUpTo` — solution multiplicity, capped.
 * Notes:        Two engines behind one API, chosen by rule variant:
 *
 *               `escape-only` reduces to a graph problem. An arrow can leave iff
 *               every arrow initially on its ray has already left, and — because
 *               removing an arrow never blocks anything — that blocker set never
 *               grows. So the level is exactly "delete the nodes of a directed
 *               graph in topological order", solvable iff that graph is acyclic.
 *               No search required. See `docs/MECHANIC_ANALYSIS.md`.
 *
 *               `slide-and-stop` needs real search, because a moved arrow becomes
 *               a blocker somewhere new. The state space is still a DAG (each
 *               arrow only ever advances along its own direction, never back), so
 *               plain memoised DFS terminates without a cycle guard.
 */

import { cloneState, stateKey } from './board';
import { applyOutcome, isCleared, legalMoves, resolveTap } from './rules';
import { type Board, type BoardState, EMPTY, ESCAPED } from './types';

/** Safety valve so a pathological board cannot hang the app or the build. */
export const DEFAULT_MAX_NODES = 200_000;

export interface SolveOptions {
  /** Abort the `slide-and-stop` search after this many expanded states. */
  readonly maxNodes?: number;
}

/**
 * The result of asking "can this be finished?".
 *
 * `exhausted` is deliberately distinct from `unsolvable`: the level tooling must
 * never mark a level unsolvable just because the search ran out of budget.
 */
export type SolveOutcome =
  | { readonly kind: 'solved'; readonly solution: readonly number[] }
  | { readonly kind: 'unsolvable'; readonly reason: string }
  | { readonly kind: 'exhausted'; readonly nodesExpanded: number };

/**
 * Who blocks whom, computed once from the starting layout.
 *
 * `blockedBy[y]` — arrows sitting on y's ray at the start.
 * `blocks[x]`    — arrows whose ray x sits on.
 *
 * Only meaningful for `escape-only`, where ray membership is fixed for the whole
 * level. Under `slide-and-stop` arrows move into and out of rays, so this graph
 * would be a snapshot, not an invariant.
 */
interface BlockingGraph {
  readonly blockedBy: readonly number[][];
  readonly blocks: readonly number[][];
}

function buildBlockingGraph(board: Board, state: BoardState): BlockingGraph {
  const n = board.arrows.length;
  const blockedBy: number[][] = Array.from({ length: n }, () => []);
  const blocks: number[][] = Array.from({ length: n }, () => []);

  for (let y = 0; y < n; y += 1) {
    if (state.positions[y] === ESCAPED) continue;
    const arrow = board.arrows[y]!;
    const from = state.positions[y]!;
    let r = Math.floor(from / board.cols) + arrow.dr;
    let c = (from % board.cols) + arrow.dc;

    while (r >= 0 && r < board.rows && c >= 0 && c < board.cols) {
      const occupant = state.occupancy[r * board.cols + c]!;
      if (occupant !== EMPTY) {
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
 * Solve an `escape-only` board by peeling the blocking graph.
 *
 * This is Kahn's algorithm: repeatedly take an arrow nothing blocks, remove it,
 * and release whatever it was holding up. If arrows remain but nothing is
 * releasable, the graph has a cycle — a knot of arrows blocking each other in a
 * loop — and no tap order can ever clear it.
 *
 * `frontier` (how many arrows are tappable at each step) is captured because it
 * is the honest difficulty signal for this variant: a board where only one arrow
 * is ever free is a forced march; one where twelve are free is a free-for-all.
 */
function solveEscapeOnly(
  board: Board,
  state: BoardState,
): { outcome: SolveOutcome; frontierSizes: number[] } {
  const n = board.arrows.length;
  const { blockedBy, blocks } = buildBlockingGraph(board, state);

  const remainingBlockers = new Int32Array(n);
  const alive: boolean[] = new Array<boolean>(n).fill(false);
  let aliveCount = 0;

  for (let i = 0; i < n; i += 1) {
    if (state.positions[i] === ESCAPED) continue;
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

  while (frontier.length > 0) {
    frontierSizes.push(frontier.length);
    // Lowest index first: the canonical order must be deterministic so the
    // `solution` recorded in level JSON is reproducible across runs and machines.
    frontier.sort((a, b) => a - b);
    const next = frontier.shift()!;
    solution.push(next);
    alive[next] = false;

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
    };
  }

  return { outcome: { kind: 'solved', solution }, frontierSizes };
}

/**
 * Solve a `slide-and-stop` board by memoised depth-first search.
 *
 * The memo stores, per state, the single move that leads to a win (or `-1` for
 * "this state is lost"), rather than a whole solution array. Reconstructing the
 * path afterwards costs one cheap replay and keeps memory flat on levels with
 * tens of thousands of reachable states.
 */
function solveSlideAndStop(board: Board, state: BoardState, maxNodes: number): SolveOutcome {
  const memo = new Map<string, number>();
  let nodesExpanded = 0;
  let budgetHit = false;

  const winningMove = (current: BoardState): number => {
    if (isCleared(current)) return -2; // -2 = already won, no move needed
    const key = stateKey(current);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;

    if (nodesExpanded >= maxNodes) {
      budgetHit = true;
      return -1;
    }
    nodesExpanded += 1;

    let answer = -1;
    for (const move of legalMoves(board, current)) {
      const next = applyOutcome(current, resolveTap(board, current, move));
      if (winningMove(next) !== -1) {
        answer = move;
        break;
      }
      if (budgetHit) break;
    }

    // Do not cache a "lost" verdict that was really "ran out of budget" — that
    // would poison the memo and could turn a solvable level into a rejected one.
    if (!(budgetHit && answer === -1)) memo.set(key, answer);
    return answer;
  };

  const first = winningMove(state);
  if (budgetHit && first === -1) return { kind: 'exhausted', nodesExpanded };
  if (first === -1) return { kind: 'unsolvable', reason: 'no tap order clears the board' };

  const solution: number[] = [];
  let cursor = cloneState(state);
  for (;;) {
    const move = winningMove(cursor);
    if (move < 0) break;
    solution.push(move);
    cursor = applyOutcome(cursor, resolveTap(board, cursor, move));
  }

  return { kind: 'solved', solution };
}

/**
 * Find a winning tap order, or prove there is none.
 *
 * The single entry point the level validator and the hint system both call, so
 * "solvable" means the same thing everywhere in the project.
 */
export function solve(board: Board, state: BoardState, options: SolveOptions = {}): SolveOutcome {
  if (isCleared(state)) return { kind: 'solved', solution: [] };
  if (board.variant === 'escape-only') return solveEscapeOnly(board, state).outcome;
  return solveSlideAndStop(board, state, options.maxNodes ?? DEFAULT_MAX_NODES);
}

/** Is there any way to finish from here? Thin wrapper for readability at call sites. */
export function isSolvable(board: Board, state: BoardState, options?: SolveOptions): boolean {
  return solve(board, state, options).kind === 'solved';
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
    if (outcome.kind === 'blocked' || outcome.kind === 'invalid') {
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
 * How many distinct winning tap orders exist, saturating at `limit`.
 *
 * Capped because under `escape-only` the true count is the number of topological
 * orderings of the blocking graph, which is routinely astronomical — a board of
 * 20 mutually independent arrows has 20! ≈ 2.4x10^18 solutions. A saturated
 * count is still useful information ("many"), and the cap keeps it computable.
 */
export function countSolutionsUpTo(
  board: Board,
  state: BoardState,
  limit: number,
  options: SolveOptions = {},
): number {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES;
  const memo = new Map<string, number>();
  let nodes = 0;

  const count = (current: BoardState): number => {
    if (isCleared(current)) return 1;
    const key = stateKey(current);
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (nodes >= maxNodes) return 0;
    nodes += 1;

    let total = 0;
    for (const move of legalMoves(board, current)) {
      total += count(applyOutcome(current, resolveTap(board, current, move)));
      if (total >= limit) {
        total = limit;
        break;
      }
    }
    memo.set(key, total);
    return total;
  };

  return count(state);
}

/**
 * Measured properties of a level, for the curation step of the level pipeline.
 *
 * These replace the TDD's original "solution depth" dial, which does not survive
 * contact with the `escape-only` rule set: since every tap order wins, depth of
 * *planning* is always zero there. What actually varies — and what actually makes
 * one of these boards feel harder than another — is how many arrows are tappable
 * at a time (`minFrontier`/`avgFrontier`, the visual-search load) and how long
 * the longest forced chain of removals is (`dependencyDepth`).
 */
export interface DifficultyMetrics {
  readonly solvable: boolean;
  readonly arrowCount: number;
  readonly boardArea: number;
  /** Arrows per cell. Dense boards read as harder even when they are not. */
  readonly density: number;
  readonly solutionLength: number;
  /** Fewest simultaneously-tappable arrows at any point. 1 = fully forced. */
  readonly minFrontier: number;
  /** Mean tappable arrows per step. Low = the player must hunt for the one move. */
  readonly avgFrontier: number;
  /** Steps where exactly one arrow was tappable. */
  readonly forcedSteps: number;
  /** Longest chain of "this must go before that". The real depth of the layout. */
  readonly dependencyDepth: number;
  /**
   * `slide-and-stop` only: opening taps that are legal but throw the level away.
   * Zero here means the variant is not adding any planning burden on this board.
   */
  readonly trapMoves: number;
  /** Suggested 1–5 band. A starting point for human curation, not a verdict. */
  readonly suggestedDifficulty: number;
}

/** Longest path in the blocking DAG — the deepest "must precede" chain. */
function longestChain(board: Board, state: BoardState): number {
  const { blocks } = buildBlockingGraph(board, state);
  const depth = new Int32Array(board.arrows.length).fill(-1);

  const walk = (node: number): number => {
    const cached = depth[node]!;
    if (cached >= 0) return cached;
    depth[node] = 0; // guards against cycles in unsolvable boards
    let best = 1;
    for (const next of blocks[node]!) {
      best = Math.max(best, 1 + walk(next));
    }
    depth[node] = best;
    return best;
  };

  let deepest = 0;
  for (let i = 0; i < board.arrows.length; i += 1) {
    if (state.positions[i] === ESCAPED) continue;
    deepest = Math.max(deepest, walk(i));
  }
  return deepest;
}

/** Measure a level. Used by the generator to score candidates before curation. */
export function analyze(board: Board, state: BoardState, options: SolveOptions = {}): DifficultyMetrics {
  const arrowCount = state.remaining;
  const boardArea = board.cellCount;
  const density = boardArea === 0 ? 0 : arrowCount / boardArea;

  let solvable = false;
  let solutionLength = 0;
  let frontierSizes: number[] = [];

  if (board.variant === 'escape-only') {
    const result = solveEscapeOnly(board, state);
    solvable = result.outcome.kind === 'solved';
    solutionLength = result.outcome.kind === 'solved' ? result.outcome.solution.length : 0;
    frontierSizes = result.frontierSizes;
  } else {
    const outcome = solve(board, state, options);
    solvable = outcome.kind === 'solved';
    solutionLength = outcome.kind === 'solved' ? outcome.solution.length : 0;
    // Replay the canonical solution to sample how much choice the player had.
    if (outcome.kind === 'solved') {
      let cursor = state;
      for (const move of outcome.solution) {
        frontierSizes.push(legalMoves(board, cursor).length);
        cursor = applyOutcome(cursor, resolveTap(board, cursor, move));
      }
    }
  }

  // Drop the final step before measuring choice: with one arrow left the frontier
  // is always exactly 1, which would otherwise drag `minFrontier` to 1 on every
  // board and report a trivial "forced" step on even the most wide-open layout.
  const choiceSteps = frontierSizes.slice(0, -1);
  const minFrontier = choiceSteps.length > 0 ? Math.min(...choiceSteps) : frontierSizes.length;
  const avgFrontier =
    choiceSteps.length > 0 ? choiceSteps.reduce((a, b) => a + b, 0) / choiceSteps.length : 0;
  const forcedSteps = choiceSteps.filter((size) => size === 1).length;

  let trapMoves = 0;
  if (board.variant === 'slide-and-stop' && solvable) {
    for (const move of legalMoves(board, state)) {
      const next = applyOutcome(state, resolveTap(board, state, move));
      if (!isSolvable(board, next, options)) trapMoves += 1;
    }
  }

  const dependencyDepth = longestChain(board, state);

  // A blunt heuristic, intentionally: it orders candidates for a human to judge.
  // Density and search load dominate because those are what a player actually
  // feels on these boards. Traps count heavily since they are the only source of
  // genuine "think before you tap" pressure.
  const raw =
    density * 3.5 +
    dependencyDepth * 0.35 +
    (avgFrontier > 0 ? Math.max(0, 3 - avgFrontier) * 0.6 : 0) +
    trapMoves * 0.8;
  const suggestedDifficulty = Math.max(1, Math.min(5, Math.round(raw)));

  return {
    solvable,
    arrowCount,
    boardArea,
    density,
    solutionLength,
    minFrontier,
    avgFrontier,
    forcedSteps,
    dependencyDepth,
    trapMoves,
    suggestedDifficulty,
  };
}

/**
 * Brute-force reference solver: try every tap order, no shortcuts.
 *
 * Exists purely so the test suite can prove the two fast engines above agree with
 * exhaustive search on thousands of random boards. Never call this from app code —
 * it is exponential by design.
 */
export function solveBruteForce(board: Board, state: BoardState): boolean {
  const seen = new Set<string>();

  const search = (current: BoardState): boolean => {
    if (isCleared(current)) return true;
    const key = stateKey(current);
    if (seen.has(key)) return false;
    seen.add(key);

    for (let i = 0; i < board.arrows.length; i += 1) {
      if (current.positions[i] === ESCAPED) continue;
      const outcome = resolveTap(board, current, i);
      if (outcome.kind === 'blocked' || outcome.kind === 'invalid') continue;
      if (search(applyOutcome(current, outcome))) return true;
    }
    return false;
  };

  return search(state);
}

/** Exposes the blocking graph so level tooling can reason about it without reaching into internals. */
export function blockingGraphOf(board: Board, state: BoardState): BlockingGraph {
  return buildBlockingGraph(board, state);
}
