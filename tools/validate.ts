/**
 * validate.ts — prove the shipped level library is sound.
 *
 * Purpose:      The guarantee behind "every shipped level is solvable". Reads the
 *               JSON on disk — not the generator's memory — and checks it.
 * Responsibilities:
 *               - Every file parses into a valid board.
 *               - Every level is solvable.
 *               - Every recorded solution actually clears its board.
 *               - Ids are unique, contiguous, and in order.
 * Notes:        Reads from disk on purpose. The generator could be perfect and a
 *               level still be broken by a bad merge, a hand edit, or a partial
 *               write. This is the last line before a player sees it.
 *
 *               Run: `npm run levels:validate`
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  analyze,
  buildLevel,
  indexOfArrow,
  solve,
  verifySolution,
  type LevelDefinition,
} from '../src/game';

const DIR = join(process.cwd(), 'src', 'data', 'levels');

const failures: string[] = [];
const report: { id: number; name: string; blind: number; arrows: number }[] = [];

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

if (files.length === 0) {
  console.error('No levels found. Run `npm run levels:build` first.');
  process.exit(1);
}

const seenIds = new Set<number>();

for (const file of files) {
  const path = join(DIR, file);
  let level: LevelDefinition;

  try {
    level = JSON.parse(readFileSync(path, 'utf8')) as LevelDefinition;
  } catch (error) {
    failures.push(`${file}: not valid JSON — ${(error as Error).message}`);
    continue;
  }

  if (seenIds.has(level.id)) {
    failures.push(`${file}: duplicate id ${level.id}`);
    continue;
  }
  seenIds.add(level.id);

  const expectedFile = `${String(level.id).padStart(3, '0')}.json`;
  if (file !== expectedFile) {
    failures.push(`${file}: id ${level.id} should live in ${expectedFile}`);
  }

  const built = buildLevel(level);
  if (!built.ok) {
    failures.push(`${file}: ${built.error}`);
    continue;
  }

  const { board, initial } = built.value;

  const outcome = solve(board, initial);
  if (outcome.kind !== 'solved') {
    failures.push(`${file}: UNSOLVABLE — ${outcome.reason}`);
    continue;
  }

  if (!level.solution || level.solution.length === 0) {
    failures.push(`${file}: no recorded solution`);
    continue;
  }

  const indices = level.solution.map((id) => indexOfArrow(board, id));
  const unknown = level.solution.filter((_, i) => indices[i] === -1);
  if (unknown.length > 0) {
    failures.push(`${file}: solution names arrows that do not exist: ${unknown.join(', ')}`);
    continue;
  }

  const replay = verifySolution(board, initial, indices);
  if (!replay.ok) {
    failures.push(`${file}: recorded solution does not work — ${replay.error}`);
    continue;
  }

  const metrics = analyze(board, initial);
  report.push({
    id: level.id,
    name: level.name,
    blind: metrics.expectedBlindMistakes,
    arrows: metrics.arrowCount,
  });
}

// Ids must run 1..N with no gaps, or level unlocking silently strands a player.
const ids = [...seenIds].sort((a, b) => a - b);
for (let i = 0; i < ids.length; i += 1) {
  if (ids[i] !== i + 1) {
    failures.push(`level ids are not contiguous: expected ${i + 1}, found ${ids[i]}`);
    break;
  }
}

// The curve should rise. A dip is fine and intentional; a *big* backwards step
// between neighbours usually means a plan was retuned and its neighbours were not.
report.sort((a, b) => a.id - b.id);
const regressions: string[] = [];
for (let i = 1; i < report.length; i += 1) {
  const drop = report[i - 1]!.blind - report[i]!.blind;
  if (drop > 6) {
    regressions.push(
      `  level ${report[i]!.id} "${report[i]!.name}" is ${drop.toFixed(1)} easier than the one before it`,
    );
  }
}

console.log(`Checked ${files.length} level files.`);

if (regressions.length > 0) {
  console.log('\nCurve notes (not failures — breathers are intentional):');
  console.log(regressions.join('\n'));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s):`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

const first = report[0];
const last = report[report.length - 1];
console.log(
  `\nAll levels solvable, all recorded solutions verified.` +
    (first && last
      ? `\nDifficulty runs ${first.blind.toFixed(1)} → ${last.blind.toFixed(1)} expected blind mistakes.`
      : ''),
);
