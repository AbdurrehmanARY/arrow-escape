/**
 * validate.ts — prove the shipped level library is sound.
 *
 * Purpose:      The guarantee behind "every shipped level is solvable". Reads the
 *               packs on disk — not the generator's memory — and checks them.
 * Responsibilities:
 *               - Every pack parses and every level decodes.
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

import { analyze, buildLevel, indexOfArrow, solve, verifySolution } from '../src/game';
import { decodeLevel, TIER_ORDER, type DifficultyTier, type LevelPack } from '../src/game/codec';

const DIR = join(process.cwd(), 'src', 'data', 'levels');

const failures: string[] = [];
const seenIds = new Set<number>();
const byTier = new Map<DifficultyTier, number[]>();

let oversized = 0;
let totalArrows = 0;
let biggest = 0;

const packFiles = readdirSync(DIR)
  .filter((f) => f.startsWith('pack-') && f.endsWith('.json'))
  .sort();

if (packFiles.length === 0) {
  console.error('No level packs found. Run `npm run levels:build` first.');
  process.exit(1);
}

for (const file of packFiles) {
  let pack: LevelPack;
  try {
    pack = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as LevelPack;
  } catch (error) {
    failures.push(`${file}: not valid JSON — ${(error as Error).message}`);
    continue;
  }

  for (const encoded of pack.levels) {
    const where = `${file} level ${encoded.i}`;

    if (seenIds.has(encoded.i)) {
      failures.push(`${where}: duplicate id`);
      continue;
    }
    seenIds.add(encoded.i);

    if (!TIER_ORDER.includes(encoded.t)) {
      failures.push(`${where}: unknown tier "${encoded.t}"`);
    }

    let level;
    try {
      level = decodeLevel(encoded);
    } catch (error) {
      failures.push(`${where}: will not decode — ${(error as Error).message}`);
      continue;
    }

    const built = buildLevel(level);
    if (!built.ok) {
      failures.push(`${where} "${level.name}": ${built.error}`);
      continue;
    }

    const { board, initial } = built.value;

    const outcome = solve(board, initial);
    if (outcome.kind !== 'solved') {
      failures.push(`${where} "${level.name}": UNSOLVABLE — ${outcome.reason}`);
      continue;
    }

    const solution = level.solution ?? [];
    if (solution.length === 0) {
      failures.push(`${where} "${level.name}": no recorded solution`);
      continue;
    }

    const indices = solution.map((id) => indexOfArrow(board, id));
    if (indices.includes(-1)) {
      failures.push(`${where} "${level.name}": solution names an arrow that does not exist`);
      continue;
    }

    const replay = verifySolution(board, initial, indices);
    if (!replay.ok) {
      failures.push(`${where} "${level.name}": recorded solution does not work — ${replay.error}`);
      continue;
    }

    const metrics = analyze(board, initial);
    const list = byTier.get(encoded.t) ?? [];
    list.push(metrics.expectedBlindMistakes);
    byTier.set(encoded.t, list);

    totalArrows += board.arrows.length;
    biggest = Math.max(biggest, encoded.r * encoded.c);
    if (Math.max(encoded.r, encoded.c) > 14) oversized += 1;
  }
}

// Ids must run 1..N with no gaps, or level unlocking silently strands a player.
const ids = [...seenIds].sort((a, b) => a - b);
for (let i = 0; i < ids.length; i += 1) {
  if (ids[i] !== i + 1) {
    failures.push(`level ids are not contiguous: expected ${i + 1}, found ${ids[i]}`);
    break;
  }
}

console.log(`Checked ${packFiles.length} packs, ${ids.length} levels.`);

if (failures.length > 0) {
  console.error('');
  console.error(`${failures.length} problem(s):`);
  for (const failure of failures.slice(0, 25)) console.error(`  x ${failure}`);
  if (failures.length > 25) console.error(`  ... and ${failures.length - 25} more`);
  process.exit(1);
}

console.log('');
console.log('All levels decode, all are solvable, all recorded solutions verified.');
console.log('');
console.log('  tier          count   blind mistakes: min / avg / max');
console.log('  ' + '-'.repeat(58));
for (const tier of TIER_ORDER) {
  const rows = byTier.get(tier);
  if (!rows || rows.length === 0) continue;
  const avg = rows.reduce((sum, v) => sum + v, 0) / rows.length;
  console.log(
    `  ${tier.padEnd(13)} ${String(rows.length).padStart(4)}   ` +
      `${Math.min(...rows)
        .toFixed(1)
        .padStart(6)} / ${avg.toFixed(1).padStart(6)} / ${Math.max(...rows)
        .toFixed(1)
        .padStart(6)}`,
  );
}
console.log('');
console.log(`  ${oversized} boards need pan and zoom. Largest is ${biggest} cells.`);
console.log(`  ${totalArrows} arrows across the library.`);
