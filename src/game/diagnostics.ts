/**
 * diagnostics.ts — run the rules engine against itself, on the device.
 *
 * Purpose:      Prove the domain layer behaves on a real phone exactly as it does
 *               under Jest on the dev machine.
 * Responsibilities:
 *               - `runEngineSelfCheck` — a short battery of checks with readable
 *                 results, safe to render in a debug screen.
 * Notes:        This is not a substitute for the test suite; it is a smoke test
 *               for the *runtime*. The engine leans on `Int32Array`, `Math.imul`
 *               and 32-bit integer coercion, and Hermes is not the same JS engine
 *               as Node — so "the tests pass on my laptop" is not by itself
 *               evidence that the solver is correct in the shipped app.
 *
 *               Kept out of `index.ts` on purpose: this is developer-facing and
 *               should never be pulled into a production screen by accident.
 */

import { buildLevel, DIRECTIONS } from './board';
import { parseAscii } from './ascii';
import { applyOutcome, legalMoves, resolveTap } from './rules';
import { findSafeMove } from './hints';
import { isSolvable, solve } from './solver';
import type { Direction, LevelDefinition, RuleVariant } from './types';

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

function randomLevel(
  rng: () => number,
  rows: number,
  cols: number,
  count: number,
  variant: RuleVariant,
): LevelDefinition {
  const cells = Array.from({ length: rows * cols }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return {
    id: 0,
    name: 'selfcheck',
    rows,
    cols,
    layout: 'free',
    difficulty: 1,
    variant,
    arrows: cells.slice(0, count).map((cell, i) => ({
      id: `a${i}`,
      row: Math.floor(cell / cols),
      col: cell % cols,
      dir: DIRECTIONS[Math.floor(rng() * 4)] as Direction,
    })),
  };
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

function buildOrThrow(art: string, variant: RuleVariant) {
  const result = buildLevel(parseAscii(art, { variant }));
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

/** The trap board from the test suite, re-checked here on real hardware. */
const TRAP_BOARD = `
  . v <
  > > .
  . . ^
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
    check('Board builds from level data', () => {
      const { board, initial } = buildOrThrow('> . .', 'escape-only');
      assert(board.arrows.length === 1, 'expected one arrow');
      assert(initial.remaining === 1, 'expected one arrow on the board');
      return '1 arrow placed, occupancy consistent';
    }),

    check('Malformed level is rejected, not thrown', () => {
      const bad = buildLevel({
        id: 1,
        name: 'bad',
        rows: 2,
        cols: 2,
        layout: 'free',
        difficulty: 1,
        arrows: [{ id: 'a', row: 9, col: 0, dir: 'up' }],
      });
      assert(!bad.ok, 'expected the level to be rejected');
      return 'returned a typed error instead of crashing';
    }),

    check('Blocked tap changes nothing', () => {
      const { board, initial } = buildOrThrow('> . <', 'escape-only');
      const outcome = resolveTap(board, initial, 0);
      assert(outcome.kind === 'blocked', `expected blocked, got ${outcome.kind}`);
      assert(applyOutcome(initial, outcome) === initial, 'state identity should be preserved');
      return 'arrow shakes, board untouched';
    }),

    check('Forced chain solves in the only valid order', () => {
      const { board, initial } = buildOrThrow('v . .\n> > .\n. . .', 'escape-only');
      const outcome = solve(board, initial);
      assert(outcome.kind === 'solved', 'expected a solvable board');
      if (outcome.kind !== 'solved') throw new Error('unreachable');
      assert(outcome.solution.join(',') === '2,1,0', `got order ${outcome.solution.join(',')}`);
      return 'solved as a2 -> a1 -> a0';
    }),

    check('Head-on pair is detected as unsolvable', () => {
      const { board, initial } = buildOrThrow('> <', 'escape-only');
      assert(!isSolvable(board, initial), 'expected unsolvable');
      return 'cycle detected, level would be rejected at build time';
    }),

    check('escape-only: 300 random boards, no order ever loses', () => {
      const rng = seededRandom(20260728);
      let played = 0;

      for (let trial = 0; trial < 300; trial += 1) {
        const rows = 3 + Math.floor(rng() * 3);
        const cols = 3 + Math.floor(rng() * 3);
        const count = 3 + Math.floor(rng() * 6);
        const built = buildLevel(randomLevel(rng, rows, cols, count, 'escape-only'));
        if (!built.ok) continue;
        const { board, initial } = built.value;
        if (!isSolvable(board, initial)) continue;

        let state = initial;
        while (state.remaining > 0) {
          const moves = legalMoves(board, state);
          assert(moves.length > 0, `random play deadlocked with ${state.remaining} arrows left`);
          const pick = moves[Math.floor(rng() * moves.length)]!;
          state = applyOutcome(state, resolveTap(board, state, pick));
        }
        played += 1;
      }

      assert(played > 50, `only ${played} solvable boards were played`);
      return `${played} solvable boards cleared by random tapping`;
    }),

    check('slide-and-stop: the trap board really can be lost', () => {
      const { board, initial } = buildOrThrow(TRAP_BOARD, 'slide-and-stop');
      assert(isSolvable(board, initial), 'trap board should start solvable');

      const moves = legalMoves(board, initial);
      assert(moves.join(',') === '3,4', `expected legal moves 3,4 — got ${moves.join(',')}`);

      const safe = applyOutcome(initial, resolveTap(board, initial, 3));
      const doomed = applyOutcome(initial, resolveTap(board, initial, 4));
      assert(isSolvable(board, safe), 'tapping a3 should keep the board winnable');
      assert(!isSolvable(board, doomed), 'tapping a4 should lose the board');
      return 'tap a3 wins, tap a4 loses — order matters';
    }),

    check('Hint never suggests a losing move', () => {
      const { board, initial } = buildOrThrow(TRAP_BOARD, 'slide-and-stop');
      const hint = findSafeMove(board, initial);
      assert(hint.kind === 'move', `expected a move, got ${hint.kind}`);
      if (hint.kind !== 'move') throw new Error('unreachable');
      assert(hint.arrowIndex === 3, `hint pointed at a${hint.arrowIndex}, the losing tap`);
      return 'hint pointed at a3, the only safe tap';
    }),
  ];

  return {
    results,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    durationMs: Date.now() - started,
  };
}
