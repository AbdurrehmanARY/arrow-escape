/**
 * architecture.test.ts — prove the boundary checks actually fail.
 *
 * Purpose:      `tools/check-architecture.ts` is a rule set nobody has watched
 *               work. A validator that always passes is indistinguishable from a
 *               validator that is broken, and the failure mode is silent: the
 *               layers drift, the check keeps saying "clean", and the only
 *               evidence is a review three months later.
 *               So every rule gets planted in a real file and the checker has to
 *               catch it. If a rule here stops failing, the rule is not
 *               enforced.
 * Responsibilities:
 *               - Assert the real repository is clean.
 *               - Assert each rule FAILS on a seeded violation, then remove it.
 * Notes:        Each case writes a file, runs the checker, asserts on the output,
 *               and deletes the file in a `finally` — so a failing assertion
 *               cannot leave a landmine in the tree for the next run. The checker
 *               is run as a child process because that is how it runs in CI;
 *               testing an in-process copy would not prove the script works.
 *
 *               Only a sample of rules is seeded. The full matrix in
 *               ARCHITECTURE.md §3 is 12 layers; seeding all of it would be a
 *               large, slow file exercising the same code path repeatedly. What
 *               matters is that the *mechanism* is proven on one case per rule
 *               type: a forbidden layer edge, a barrel bypass, the sanctioned
 *               exceptions, and the clean-tree baseline.
 *
 *               The feature-based layers (ARCHITECTURE.md §10) get a second block
 *               below. Those rules are seeded more densely, and deliberately so:
 *               they were added *before* any file existed in `src/features`,
 *               `src/shared` or `src/infrastructure`, so at the moment they were
 *               written every one of them was unfalsifiable in the real tree. A
 *               rule nobody has seen fail is a rule that does not exist, and these
 *               were the rules the whole migration would rest on.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const CHECKER = join(process.cwd(), 'tools', 'check-architecture.ts');

/** The `src/` roots introduced by the feature-based migration (ARCHITECTURE.md §10). */
const NEW_LAYER_ROOTS = ['src/features', 'src/shared', 'src/infrastructure'] as const;

/**
 * How to invoke the checker in a child process.
 *
 * Notes: **Neither `npx` nor `node_modules/.bin/tsx.cmd` is used here, and both
 * fail for the same reason.** Neither is spawnable directly from Node on Windows:
 * `npx` is a shell script that is not on the child's `PATH` (ENOENT), and the
 * `.cmd` shim cannot be executed without a shell (EINVAL). Both failures return
 * *empty output*, which is indistinguishable from a checker that found nothing —
 * so a test written that way passes or fails for reasons that have nothing to do
 * with the architecture.
 *
 * Instead we run `tsx`'s own entry point with `node`, resolved from its
 * `package.json` rather than hardcoded, so the path stays correct across tsx
 * versions. No shell, no PATH, no shim.
 */
function resolveTsxEntry(): string {
  const pkg = join(process.cwd(), 'node_modules', 'tsx', 'package.json');
  if (!existsSync(pkg)) {
    throw new Error(`tsx not installed at ${pkg} — run \`npm install\` first.`);
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const bin = (require(pkg) as { bin?: string | Record<string, string> }).bin;
  const relative = typeof bin === 'string' ? bin : bin?.tsx;
  if (typeof relative !== 'string') {
    throw new Error(`could not resolve the tsx entry point from ${pkg}`);
  }
  return join(process.cwd(), 'node_modules', 'tsx', relative);
}

interface Result {
  readonly status: number;
  readonly output: string;
}

/** Run the checker and capture its exit code and output, never throwing. */
function runChecker(): Result {
  const entry = resolveTsxEntry();
  try {
    const stdout = execFileSync(process.execPath, [entry, CHECKER], {
      encoding: 'utf8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: err.status ?? 1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

/**
 * Remove the directories `withSeededFile` had to create, walking up to `src/`.
 *
 * Purpose: Seeding a `src/features/gameplay/components/` rule means creating three
 *          directories that did not exist. Removing the file alone leaves them
 *          behind, and `src/features/**` is a *layer* — an orphaned empty
 *          `src/features/gameplay/` changes what `layerOf` resolves for every
 *          later assertion in this file, and would make a green run depend on
 *          whether it ran first. `rmdirSync` throws `ENOTEMPTY` rather than
 *          recursing, which is exactly the guard wanted here: it can only ever
 *          remove directories this suite emptied.
 */
function pruneEmptyDirs(from: string): void {
  const src = join(process.cwd(), 'src');
  for (let dir = from; dir.startsWith(src) && dir !== src; dir = join(dir, '..')) {
    if (!existsSync(dir)) continue;
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
  }
}

/**
 * A sorted listing of everything under the three new layer roots.
 *
 * Purpose: The residue check compares this before and after seeding. Comparing
 *          *contents* rather than mere existence is what lets the roots hold real
 *          files: `src/shared/branding/index.ts` is expected to be there and to
 *          still be exactly that afterwards, while a stray
 *          `src/features/gameplay/` is not.
 * Notes:    `readdirSync(..., { recursive: true })` yields both files and
 *          directories, and directories are deliberately kept — an orphaned *empty*
 *          `src/features/gameplay/` is exactly the residue that would corrupt every
 *          later assertion in this file, so listing files alone would miss it.
 */
function newLayerRoots(): string[] {
  const found: string[] = [];
  for (const root of NEW_LAYER_ROOTS) {
    const full = join(process.cwd(), root);
    if (!existsSync(full)) continue;
    for (const entry of readdirSync(full, { recursive: true })) {
      found.push(`${root}/${String(entry).split(sep).join('/')}`);
    }
  }
  return found.sort();
}

/**
 * Plant a file, run the checker, then remove it whatever happens.
 *
 * The cleanup is in a `finally` on purpose: an assertion that throws mid-test
 * must not leave a deliberately-broken file sitting in `src/`.
 */
function withSeededFile(relativePath: string, contents: string, check: (r: Result) => void): void {
  const full = join(process.cwd(), relativePath);
  const dir = join(full, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, contents, 'utf8');
  try {
    check(runChecker());
  } finally {
    rmSync(full, { force: true });
    pruneEmptyDirs(dir);
  }
}

describe('architecture boundaries', () => {
  it('reports the real repository as clean', () => {
    const result = runChecker();
    expect(result.output).toContain('No architecture violations');
    expect(result.status).toBe(0);
  });

  it('fails when the pure engine imports React', () => {
    withSeededFile(
      'src/game/__seed_violation.ts',
      "import { useMemo } from 'react';\nexport const seed = useMemo;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('__seed_violation.ts');
        // React is a platform package, not a layer, so this is reported by the
        // purity rule rather than the forbidden-edge rule. Asserting on the
        // specific wording matters: it proves the *purity* check fired, not some
        // other check that happened to notice the file.
        expect(result.output).toContain('game/ must stay pure');
        expect(result.output).toContain('"react"');
      },
    );
  });

  it('fails when the pure engine imports a service', () => {
    withSeededFile(
      'src/game/__seed_violation.ts',
      "import { loadSlice } from '@services/storage';\nexport const seed = loadSlice;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('game/ must not import');
      },
    );
  });

  it('fails when the engine imports the off-device tooling', () => {
    withSeededFile(
      'src/game/__seed_violation.ts',
      "import { seedTool } from '../../tools/validate';\nexport const seed = seedTool;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('game/ must not import');
      },
    );
  });

  it('fails when a service reaches up into state', () => {
    withSeededFile(
      'src/services/__seed_violation.ts',
      "import { useSettingsStore } from '@state';\nexport const seed = useSettingsStore;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('services/ must not import');
      },
    );
  });

  it('fails when the renderer reaches up into components', () => {
    withSeededFile(
      'src/render/__seed_violation.ts',
      "import { Hud } from '@components/Hud';\nexport const seed = Hud;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('render/ must not import');
      },
    );
  });

  it('fails when a theme token is imported by path rather than by barrel', () => {
    // `hooks` -> `theme` is a legal edge, so this isolates the barrel rule from
    // the layer-forbidden rule: if the checker reports a *forbidden edge* here it
    // is not enforcing the rule this case is about.
    withSeededFile(
      'src/hooks/__seed_violation.ts',
      "import { PALETTE_DARK } from '@theme/types';\nexport const seed = PALETTE_DARK;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('reaches past the @theme barrel');
      },
    );
  });

  it('allows the sanctioned @game/diagnostics deep import', () => {
    withSeededFile(
      'src/components/__seed_ok.ts',
      "import { runEngineSelfCheck } from '@game/diagnostics';\nexport const seed = runEngineSelfCheck;\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('leaves the repository clean after every seeded case', () => {
    const result = runChecker();
    expect(result.output).toContain('No architecture violations');
    expect(result.status).toBe(0);
  });
});

describe('feature-based layers', () => {
  // Captured before the first seeded case runs, and compared by the last one. Jest
  // runs a file's `it` blocks in declaration order, so this lands after the clean
  // tree has been asserted and before anything has been planted.
  let TREE_BEFORE_SEEDS: readonly string[] = [];
  beforeAll(() => {
    TREE_BEFORE_SEEDS = newLayerRoots();
  });

  it('fails when one feature imports another', () => {
    withSeededFile(
      'src/features/gameplay/components/__seed.ts',
      "import { serveAd } from '@features/ads/services/ads';\nexport const seed = serveAd;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('features/gameplay/ must not import features/ads/');
      },
    );
  });

  it('fails when shared code imports a feature', () => {
    // This is the rule that makes `shared` mean "owned by nobody". A shared
    // component reaching into a feature is a feature wearing a disguise.
    withSeededFile(
      'src/shared/components/__seed.ts',
      "import { Hud } from '@features/gameplay/components/Hud';\nexport const seed = Hud;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('shared/ must not import features/gameplay/');
      },
    );
  });

  it('fails when infrastructure imports a feature', () => {
    withSeededFile(
      'src/infrastructure/storage/__seed.ts',
      "import { serveAd } from '@features/ads/services/ads';\nexport const seed = serveAd;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('infrastructure/ must not import features/ads/');
      },
    );
  });

  it('fails when shared code imports a store', () => {
    withSeededFile(
      'src/shared/components/__seed.ts',
      "import { useSettingsStore } from '@state/settingsStore';\nexport const seed = useSettingsStore;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('shared/ must not import state/');
      },
    );
  });

  it('fails when shared code imports infrastructure', () => {
    withSeededFile(
      'src/shared/components/__seed.ts',
      "import { loadSlice } from '@infrastructure/storage/storage';\nexport const seed = loadSlice;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('shared/ must not import infrastructure/');
      },
    );
  });

  it('fails when infrastructure imports a store', () => {
    // The `services -> state` ban, carried across the rename. `storage.ts` and
    // `sync.ts` are moving into `infrastructure/`, and both currently sit in the
    // middle of a cycle with `state/challengeStore`; this is what stops the move
    // from importing that cycle along with it.
    withSeededFile(
      'src/infrastructure/storage/__seed.ts',
      "import { useSettingsStore } from '@state/settingsStore';\nexport const seed = useSettingsStore;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('infrastructure/ must not import state/');
      },
    );
  });

  it('fails when a feature leaves its root by relative path', () => {
    // The rule that closes the checker-invisible gap. `targetLayer` ignores a
    // relative specifier that lands in another layer, so this edge would go
    // unnoticed forever if it were merely un-checked rather than banned.
    withSeededFile(
      'src/features/gameplay/components/__seed.ts',
      "import { Screen } from '../../../shared/components/Screen';\nexport const seed = Screen;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('by alias, not by relative path');
      },
    );
  });

  it('fails when the engine facade imports React', () => {
    withSeededFile(
      'src/features/gameplay/engine/__seed.ts',
      "import { useMemo } from 'react';\nexport const seed = useMemo;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('engine/ must only re-export @game');
        expect(result.output).toContain('"react"');
      },
    );
  });

  it('fails when the engine facade reaches past @game', () => {
    // The engine stays at `src/game` and this directory re-exports it. The moment
    // the facade gains a dependency of its own it stops being a thin surface and
    // becomes a second engine with none of the guarantees.
    withSeededFile(
      'src/features/gameplay/engine/__seed.ts',
      "import { Hud } from '@components/Hud';\nexport const seed = Hud;\n",
      (result) => {
        expect(result.status).toBe(1);
        expect(result.output).toContain('engine/ must only re-export @game');
      },
    );
  });

  it('allows the engine facade to re-export @game', () => {
    // A facade rule that forbids the only legal facade is not a boundary, it is an
    // obstacle — so the shape Phase 6 will actually create has to pass too.
    withSeededFile(
      'src/features/gameplay/engine/__seed_ok.ts',
      "export * from '@game';\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('allows the engine facade to deep-import the engine', () => {
    withSeededFile(
      'src/features/gameplay/engine/__seed_ok.ts',
      "export { encodeLevel } from '@game/codec';\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('allows a feature to import shared code', () => {
    // Dependencies point *down* into `shared`. Without this case, a rule that
    // banned the direction outright would look identical to one banning the
    // opposite, and both would satisfy every "fails when" test above.
    withSeededFile(
      'src/features/gameplay/components/__seed_ok.ts',
      "import { Screen } from '@shared/components/Screen';\nexport const seed = Screen;\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('allows a feature to reach its own sub-folders without a barrel', () => {
    withSeededFile(
      'src/features/gameplay/hooks/__seed_ok.ts',
      "import { solve } from '@features/gameplay/engine';\nexport const seed = solve;\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('allows infrastructure to import shared code', () => {
    withSeededFile(
      'src/infrastructure/sync/__seed_ok.ts',
      "import { Screen } from '@shared/components/Screen';\nexport const seed = Screen;\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('allows shared code to reach its own sub-folders by relative path', () => {
    withSeededFile(
      'src/shared/hooks/__seed_ok.ts',
      "import { Screen } from '../components/Screen';\nexport const seed = Screen;\n",
      (result) => {
        expect(result.status).toBe(0);
        expect(result.output).toContain('No architecture violations');
      },
    );
  });

  it('leaves the repository exactly as it found it', () => {
    // `src/features/**` is a layer, so an orphaned empty `src/features/gameplay/`
    // left behind by an earlier run would silently change what every later
    // assertion in this file means — and a green suite would then depend on
    // whether it happened to run first.
    //
    // This was originally written as "none of these three directories exist",
    // which was true only while they were empty scaffolding. `src/shared/` now
    // holds real production code, so that phrasing had become a false statement
    // about the project rather than a check on the test. The invariant actually
    // worth protecting is that *seeding* leaves no residue, which stays true
    // whether or not a root has real files in it.
    expect(newLayerRoots()).toEqual(TREE_BEFORE_SEEDS);
  });
});

describe('architecture checker hygiene', () => {
  it('scans the whole repository, not a fixture', () => {
    const result = runChecker();
    // A checker that only looked at a fixture would report a tiny number.
    expect(result.output).toMatch(/Checked [0-9]{3,} imports/);
  });

  it('resolves paths from the repository root', () => {
    // The checker resolves from process.cwd(); this asserts the harness is not
    // quietly making the script's job easier by running it somewhere else.
    expect(process.cwd()).toContain('arrow-escape-game');
  });
});

