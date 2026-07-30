/**
 * bench.ts — timings for the work a tap actually causes.
 *
 * Purpose:      Put numbers on the hot paths, against the levels that ship, so a
 *               performance decision is made from measurement rather than from an
 *               opinion about what looks expensive.
 * Notes:        This is a *desktop* benchmark and the numbers are not frame budgets
 *               — a mid-range phone's JS thread is several times slower than this
 *               machine. What it is good for is **ratios and outliers**: which of
 *               these costs ten times what the others do, and whether anything
 *               scales worse than the board does.
 *
 *               Everything measured here is pure and runs identically in the app,
 *               which is the whole point of keeping `game/` free of React. The
 *               renderer cannot be measured this way and is covered in
 *               `docs/PERFORMANCE.md`.
 *
 *               Run: `npm run bench`
 */

import {
  analyze,
  applyOutcome,
  buildLevel,
  findAllSafeMoves,
  findSafeMove,
  isDoomed,
  legalMoves,
  resolveTap,
  solve,
  type Board,
  type BoardState,
} from '../src/game';
import { buildArrowGeometry } from '../src/components/arrowGeometry';
import { ENCODED_LEVELS, levelById } from '../src/data/levels';
import { defaultTheme } from '../src/theme/themes';

/** Median of repeated runs. Means are dragged around by one unlucky GC pause. */
function timeMs(runs: number, fn: () => void): number {
  const samples: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    const started = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

/** The biggest board, the busiest board, and a typical mid-game one. */
function pickLevels(): number[] {
  const byCells = [...ENCODED_LEVELS].sort((a, b) => b.r * b.c - a.r * a.c);
  const byArrows = [...ENCODED_LEVELS].sort((a, b) => b.a.length - a.a.length);
  const ids = new Set<number>([byCells[0]!.i, byArrows[0]!.i, 300]);
  return [...ids].sort((a, b) => a - b);
}

console.log('Desktop timings, median of repeated runs. Ratios matter; absolutes do not.\n');

for (const id of pickLevels()) {
  const encoded = ENCODED_LEVELS.find((level) => level.i === id)!;
  console.log(
    `--- level ${id} "${encoded.n}" · ${encoded.r}x${encoded.c} (${encoded.r * encoded.c} cells) · ` +
      `${encoded.a.length} arrows · ${encoded.t}`,
  );

  // Cold decode: only paid once per level, but it is paid while the player waits.
  const decode = timeMs(20, () => {
    const level = levelById(id)!;
    const built = buildLevel(level);
    if (!built.ok) throw new Error(built.error);
  });

  const level = levelById(id)!;
  const built = buildLevel(level);
  if (!built.ok) throw new Error(built.error);
  const { board, initial } = built.value;

  // Per tap, in the order the play screen does them.
  const resolve = timeMs(200, () => void resolveTap(board, initial, 0));
  const apply = timeMs(200, () => void applyOutcome(initial, resolveTap(board, initial, 0)));
  const doomed = timeMs(50, () => void isDoomed(board, initial));
  const geometry = timeMs(20, () => geometryForWholeBoard(board));

  // Only on demand, but they are the two most expensive things a player can ask
  // for, and both are one tap away.
  const hint = timeMs(20, () => void findSafeMove(board, initial));
  const assist = timeMs(20, () => void findAllSafeMoves(board, initial));

  // Tooling only — included because if `analyze` were ever called on device this
  // is what it would cost.
  const metrics = timeMs(5, () => void analyze(board, initial));

  const row = (label: string, ms: number, note = '') =>
    console.log(`    ${label.padEnd(30)} ${ms.toFixed(3).padStart(9)} ms  ${note}`);

  row('decode + buildLevel', decode, 'once, on entering the level');
  row('resolveTap', resolve, 'every tap');
  row('applyOutcome', apply, 'every successful tap');
  row('geometry, whole board', geometry, 'every render of every arrow');
  row('isDoomed', doomed, 'every tap (shutter boards only)');
  row('findSafeMove (hint)', hint, 'on demand');
  row('findAllSafeMoves (assist)', assist, 'every tap while Assist is on');
  row('analyze', metrics, 'build tooling only');
  console.log('');
}

/**
 * Rebuild every arrow's drawing geometry, as a full re-render of the board does.
 *
 * Measured as one number because that is how it is paid: React re-renders the
 * whole `BoardCanvas` on a state change, so this is per *tap*, not per arrow.
 */
function geometryForWholeBoard(board: Board): void {
  for (let i = 0; i < board.arrows.length; i += 1) {
    buildArrowGeometry(board, i, 26, 13, 13, defaultTheme.arrow);
  }
}

// ---------------------------------------------------------------------------
// Whole-library totals: what launch and a full playthrough cost.
// ---------------------------------------------------------------------------

const decodeAll = timeMs(3, () => {
  for (const encoded of ENCODED_LEVELS) {
    const level = levelById(encoded.i);
    if (!level) throw new Error(`level ${encoded.i} missing`);
  }
});

const solveAll = timeMs(3, () => {
  for (const encoded of ENCODED_LEVELS) {
    const built = buildLevel(levelById(encoded.i)!);
    if (built.ok) solve(built.value.board, built.value.initial);
  }
});

/** A full greedy playthrough of the largest level, tap by tap. */
const biggest = [...ENCODED_LEVELS].sort((a, b) => b.a.length - a.a.length)[0]!;
const biggestBuilt = buildLevel(levelById(biggest.i)!);
let playthrough = 0;
if (biggestBuilt.ok) {
  const { board, initial } = biggestBuilt.value;
  playthrough = timeMs(5, () => {
    let state: BoardState = initial;
    while (state.remaining > 0) {
      const moves = legalMoves(board, state);
      if (moves.length === 0) break;
      state = applyOutcome(state, resolveTap(board, state, moves[0]!));
    }
  });
}

console.log('--- whole library');
console.log(
  `    decode all 600 levels          ${decodeAll.toFixed(1).padStart(9)} ms  (cached after first read)`,
);
console.log(`    solve all 600 levels           ${solveAll.toFixed(1).padStart(9)} ms`);
console.log(
  `    greedy playthrough of #${biggest.i}      ${playthrough.toFixed(1).padStart(9)} ms  ` +
    `(${biggest.a.length} taps, engine only)`,
);
