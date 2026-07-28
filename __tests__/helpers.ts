/**
 * helpers.ts — shared test utilities.
 *
 * Not a test file itself (the Jest `testMatch` only picks up `*.test.ts`).
 * Provides board authoring from ASCII art and a deterministic random-board
 * generator, so the property tests below produce the same boards on every run and
 * on every machine. A flaky property test is worse than no property test.
 */

import {
  buildLevel,
  type BuiltLevel,
  DIRECTIONS,
  type Direction,
  type LevelDefinition,
  parseAscii,
  type RuleVariant,
} from '@game';

/** Build a playable board from ASCII art, failing loudly if the art is invalid. */
export function build(art: string, variant: RuleVariant = 'escape-only'): BuiltLevel {
  const level = parseAscii(art, { variant });
  const result = buildLevel(level);
  if (!result.ok) throw new Error(`build() fixture is invalid: ${result.error}`);
  return result.value;
}

/**
 * mulberry32 — a tiny seeded PRNG.
 *
 * `Math.random` is deliberately avoided: every property test below must be
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
  readonly variant?: RuleVariant;
}

/** Scatter `arrowCount` randomly-directed arrows over an empty grid. */
export function randomLevel(
  rng: () => number,
  { rows, cols, arrowCount, variant = 'escape-only' }: RandomBoardOptions,
): LevelDefinition {
  const cells: number[] = [];
  for (let i = 0; i < rows * cols; i += 1) cells.push(i);

  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }

  const chosen = cells.slice(0, Math.min(arrowCount, cells.length));
  return {
    id: 0,
    name: 'random',
    rows,
    cols,
    layout: 'free',
    difficulty: 1,
    variant,
    arrows: chosen.map((cell, index) => ({
      id: `a${index}`,
      row: Math.floor(cell / cols),
      col: cell % cols,
      dir: DIRECTIONS[Math.floor(rng() * DIRECTIONS.length)] as Direction,
    })),
  };
}

/** Build a random board, skipping the `Result` unwrap that random input can't fail. */
export function randomBoard(rng: () => number, options: RandomBoardOptions): BuiltLevel {
  const result = buildLevel(randomLevel(rng, options));
  if (!result.ok) throw new Error(`randomBoard produced invalid level: ${result.error}`);
  return result.value;
}

/**
 * The reference `slide-and-stop` trap board.
 *
 *     . v <
 *     > > .
 *     . . ^
 *
 * Two arrows can be tapped: `a3` (the second `>`, which has a clear run to the
 * right edge) and `a4` (the `^` in the bottom-right, which is blocked by `a1` and
 * so can only slide one cell up).
 *
 * Tapping `a4` first slides it into (1,2) — exactly the cell `a3` needed to exit
 * through. `a4` can never move again, `a3` is now walled in, and the board is
 * lost. Tapping `a3` first wins.
 *
 * This one board is the entire practical difference between the two rule sets,
 * and it is shared rather than re-derived so all three suites assert on the same
 * concrete example. Found by exhaustive search over random boards, then verified
 * by hand.
 */
export const TRAP_BOARD = `
  . v <
  > > .
  . . ^
`;

/** The tap that loses `TRAP_BOARD`: slides `a4` into `a3`'s only exit. */
export const TRAP_MOVE = 4;

/** The tap that wins `TRAP_BOARD`: lets `a3` out before its path is stolen. */
export const SAFE_MOVE = 3;
