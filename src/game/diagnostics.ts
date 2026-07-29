/**
 * diagnostics.ts — run the rules engine against itself, on the device.
 *
 * Purpose:      Prove the domain layer behaves on a real phone exactly as it does
 *               under Jest on the dev machine.
 * Responsibilities:
 *               - `runEngineSelfCheck` — a short battery of checks with readable
 *                 results, safe to render in a debug screen.
 * Notes:        Not a substitute for the test suite; it is a smoke test for the
 *               *runtime*. The engine leans on `Int32Array`, `Uint8Array`,
 *               `Math.imul` and 32-bit integer coercion, and Hermes is not the
 *               same JS engine as Node — so "the tests pass on my laptop" is not
 *               by itself evidence that the solver is correct in the shipped app.
 *
 *               Kept out of `index.ts` on purpose: this is developer-facing and
 *               should never be pulled into a production screen by accident.
 */

import { parseAscii } from './ascii';
import { buildLevel } from './board';
import { findSafeMove } from './hints';
import { applyOutcome, legalMoves, resolveTap, startSession, tapArrow } from './rules';
import { analyze, isSolvable, solve, verifySolution } from './solver';
import type { LevelDefinition } from './types';

/** One line of the report. */
export interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface SelfCheckReport {
  readonly results: readonly CheckResult[];
  readonly passed: number;
  readonly failed: number;
  readonly durationMs: number;
}

/** Deterministic PRNG, so a failure on a device is reproducible on the desktop. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grow random snakes by self-avoiding walk, the same way the tests do. */
function randomLevel(
  rng: () => number,
  rows: number,
  cols: number,
  count: number,
): LevelDefinition {
  const owner = new Int32Array(rows * cols).fill(-1);
  const arrows: LevelDefinition['arrows'][number][] = [];

  for (let index = 0; index < count; index += 1) {
    const free: number[] = [];
    for (let cell = 0; cell < owner.length; cell += 1) {
      if (owner[cell] === -1) free.push(cell);
    }
    if (free.length === 0) break;

    const start = free[Math.floor(rng() * free.length)]!;
    const body: number[] = [start];
    owner[start] = index;

    const target = 2 + Math.floor(rng() * 3);
    let cursor = start;
    while (body.length < target) {
      const r = Math.floor(cursor / cols);
      const c = cursor % cols;
      const options: number[] = [];
      if (r > 0 && owner[cursor - cols] === -1) options.push(cursor - cols);
      if (r + 1 < rows && owner[cursor + cols] === -1) options.push(cursor + cols);
      if (c > 0 && owner[cursor - 1] === -1) options.push(cursor - 1);
      if (c + 1 < cols && owner[cursor + 1] === -1) options.push(cursor + 1);
      if (options.length === 0) break;

      const next = options[Math.floor(rng() * options.length)]!;
      owner[next] = index;
      body.push(next);
      cursor = next;
    }

    if (body.length < 2) {
      owner[start] = -1;
      continue;
    }

    body.reverse();
    arrows.push({
      id: `a${arrows.length}`,
      body: body.map((cell) => [Math.floor(cell / cols), cell % cols] as const),
    });
  }

  return { id: 0, name: 'selfcheck', rows, cols, layout: 'free', difficulty: 1, arrows };
}

function check(name: string, fn: () => string): CheckResult {
  try {
    return { name, passed: true, detail: fn() };
  } catch (error) {
    return { name, passed: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function buildOrThrow(art: string) {
  const result = buildLevel(parseAscii(art));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** Three snakes queued in a row: only the front one can move. */
const CHAIN = 'c C b B a A';

/** A hook whose own tail sits on its head's ray — must not count as self-blocking. */
const SELF_CROSSING = `
  a a a a
  a . . a
  a A . a
`;

/**
 * Run every check and report.
 *
 * Sized to finish in a few milliseconds so it can run during render without
 * making the screen feel stuck.
 */
export function runEngineSelfCheck(): SelfCheckReport {
  const started = Date.now();

  const results: CheckResult[] = [
    check('Snake bodies build from level data', () => {
      const { board, initial } = buildOrThrow('A a a\n. . a');
      assert(board.arrows.length === 1, 'expected one arrow');
      assert(board.arrows[0]!.body.length === 4, 'expected a four-cell body');
      assert(
        board.arrows[0]!.dir === 'left',
        `head should point left, got ${board.arrows[0]!.dir}`,
      );
      assert(initial.remaining === 1, 'expected one arrow on the board');
      return '4-cell body, head direction inferred from its last segment';
    }),

    check('Malformed level is rejected, not thrown', () => {
      const bad = buildLevel({
        id: 1,
        name: 'bad',
        rows: 2,
        cols: 2,
        layout: 'free',
        difficulty: 1,
        arrows: [
          {
            id: 'a',
            body: [
              [0, 0],
              [1, 1],
            ],
          },
        ],
      });
      assert(!bad.ok, 'expected a disconnected body to be rejected');
      return 'returned a typed error instead of crashing';
    }),

    check('Whole body leaves in one move', () => {
      const { board, initial } = buildOrThrow('A a a\n. . a');
      const next = applyOutcome(initial, resolveTap(board, initial, 0));
      assert(next.remaining === 0, 'board should be empty');
      assert(
        Array.from(next.occupancy).every((cell) => cell === -1),
        'every body cell should be released',
      );
      return 'all 4 cells released together';
    }),

    check('Blocked tap changes nothing', () => {
      const { board, initial } = buildOrThrow('a A . b B');
      const outcome = resolveTap(board, initial, 0);
      assert(outcome.kind === 'blocked', `expected blocked, got ${outcome.kind}`);
      assert(applyOutcome(initial, outcome) === initial, 'state identity should be preserved');
      return 'arrow flashes red, board untouched';
    }),

    check('A body crossing its own ray is not self-blocking', () => {
      const { board, initial } = buildOrThrow(SELF_CROSSING);
      assert(isSolvable(board, initial), 'hook should be free — its tail vacates as it moves');
      return 'spiral and hook shapes stay playable';
    }),

    check('Forced chain solves in the only valid order', () => {
      const { board, initial } = buildOrThrow(CHAIN);
      const outcome = solve(board, initial);
      assert(outcome.kind === 'solved', 'expected a solvable board');
      if (outcome.kind !== 'solved') throw new Error('unreachable');
      assert(outcome.solution.join(',') === '0,1,2', `got order ${outcome.solution.join(',')}`);
      assert(verifySolution(board, initial, outcome.solution).ok, 'solution should replay cleanly');
      return 'solved front-to-back, and the replay verified';
    }),

    check('Head-on pair is detected as unsolvable', () => {
      const { board, initial } = buildOrThrow('a A B b');
      assert(!isSolvable(board, initial), 'expected unsolvable');
      return 'cycle detected — the level pipeline would reject this board';
    }),

    check('Hearts are spent on wrong taps only', () => {
      const { board, initial } = buildOrThrow(CHAIN);
      let session = startSession(initial, 5);

      session = tapArrow(board, session, 2).session;
      assert(
        session.heartsLeft === 4,
        `blocked tap should cost a heart, got ${session.heartsLeft}`,
      );
      assert(session.state.remaining === 3, 'blocked tap must not change the board');

      session = tapArrow(board, session, 0).session;
      assert(session.heartsLeft === 4, 'a good tap must not cost a heart');
      assert(session.state.remaining === 2, 'a good tap should clear an arrow');
      return 'wrong tap -4 hearts remaining, board unchanged; right tap free';
    }),

    check('Running out of hearts fails a still-winnable level', () => {
      const { board, initial } = buildOrThrow(CHAIN);
      let session = startSession(initial, 2);
      session = tapArrow(board, session, 2).session;
      session = tapArrow(board, session, 2).session;

      assert(session.status === 'failed', `expected failed, got ${session.status}`);
      assert(isSolvable(board, session.state), 'the board itself should still be winnable');
      return 'lost on hearts, not on a ruined board';
    }),

    check('Hint never costs a heart', () => {
      const { board, initial } = buildOrThrow(CHAIN);
      let session = startSession(initial, 5);
      let guard = 0;

      while (session.status === 'playing' && guard < 20) {
        const hint = findSafeMove(board, session.state);
        assert(hint.kind === 'move', `expected a move, got ${hint.kind}`);
        if (hint.kind !== 'move') break;
        session = tapArrow(board, session, hint.arrowIndex).session;
        guard += 1;
      }

      assert(session.status === 'won', `expected a win, got ${session.status}`);
      assert(session.mistakes === 0, `hints cost ${session.mistakes} heart(s)`);
      return 'cleared the level on full hearts';
    }),

    check('300 random boards: no order ever stalls a solvable level', () => {
      const rng = seededRandom(20260728);
      let played = 0;

      for (let trial = 0; trial < 300; trial += 1) {
        const rows = 3 + Math.floor(rng() * 3);
        const cols = 3 + Math.floor(rng() * 3);
        const built = buildLevel(randomLevel(rng, rows, cols, 2 + Math.floor(rng() * 4)));
        if (!built.ok) continue;
        const { board, initial } = built.value;
        if (board.arrows.length === 0 || !isSolvable(board, initial)) continue;

        let state = initial;
        while (state.remaining > 0) {
          const moves = legalMoves(board, state);
          assert(moves.length > 0, `random play stalled with ${state.remaining} arrows left`);
          const pick = moves[Math.floor(rng() * moves.length)]!;
          state = applyOutcome(state, resolveTap(board, state, pick));
        }
        played += 1;
      }

      assert(played > 30, `only ${played} solvable boards were played`);
      return `${played} solvable boards cleared by tapping at random`;
    }),

    check('Difficulty metrics predict blind heart loss', () => {
      const { board, initial } = buildOrThrow(CHAIN);
      const metrics = analyze(board, initial);
      assert(metrics.solvable, 'chain should be solvable');
      assert(
        Math.abs(metrics.expectedBlindMistakes - 3) < 1e-6,
        `expected 3 blind mistakes, got ${metrics.expectedBlindMistakes}`,
      );
      return 'a blind player would burn 3 hearts on this board';
    }),
  ];

  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    durationMs: Date.now() - started,
  };
}
