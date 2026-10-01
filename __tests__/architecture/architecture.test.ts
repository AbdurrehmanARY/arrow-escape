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
 */

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CHECKER = join(process.cwd(), 'tools', 'check-architecture.ts');

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
 * Plant a file, run the checker, then remove it whatever happens.
 *
 * The cleanup is in a `finally` on purpose: an assertion that throws mid-test
 * must not leave a deliberately-broken file sitting in `src/`.
 */
function withSeededFile(relativePath: string, contents: string, check: (r: Result) => void): void {
  const full = join(process.cwd(), relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents, 'utf8');
  try {
    check(runChecker());
  } finally {
    rmSync(full, { force: true });
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

