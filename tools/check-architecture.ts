/**
 * check-architecture.ts — enforce the layer boundaries in docs/ARCHITECTURE.md.
 *
 * Purpose:      Stop the repository drifting across its own layers. The rules in
 *               docs/ARCHITECTURE.md are only worth writing down if something
 *               checks them; this is that something, so a violation fails in CI
 *               instead of being caught in review months later.
 * Responsibilities:
 *               - Resolve every import in app/, src/, __tests__/ and tools/ to the
 *                 layer it belongs to.
 *               - Assert no forbidden edge exists (ARCHITECTURE.md §3).
 *               - Assert no import reaches past a barrel (§2).
 * Notes:        **This is a separate script from `validate.ts` on purpose.**
 *               `levels:validate` is wired into `npm run verify` and its job is
 *               proving the level library is sound; folding architecture checks
 *               into it would mean a boundary break and a corrupt level pack
 *               share one failure message and one exit code. They are different
 *               failures with different owners.
 *
 *               **Every rule here has a seeded test in __tests__/architecture/.**
 *               A check nobody has seen fail is a check nobody can trust, so the
 *               test suite plants each violation in turn and asserts this script
 *               catches it. If you change a rule here, its test must change too.
 *
 * Run: `npm run architecture:check`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN = ['app', 'src', '__tests__', 'tools'] as const;

/** Import specifier matches, including multi-line braces. */
const IMPORT_RE = /import\s+(?:type\s+)?[\s\S]*?from\s*'([^']+)'|import\s+'([^']+)'/g;

const SOURCE_EXT = new Set(['.ts', '.tsx']);

/**
 * Bare module specifiers that mean "a platform", not "a layer".
 *
 * Notes: `isPlatform()` further down is the single source of truth for what counts
 * as a platform package. This pattern only answers "is this import a layer edge at
 * all?" — anything it matches is deliberately not one, and `game/`'s purity is then
 * checked separately against `isPlatform`.
 */
const EXTERNAL = /^(react|react-native|expo|expo-[a-z-]+|@expo\/|@shopify\/|zustand|@supabase\/|@react-native-|node:)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE_EXT.has(full.slice(full.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

/** The top-level layer a file belongs to, e.g. `src/game` -> `game`. */
function layerOf(file: string): string | null {
  const rel = relative(ROOT, file).split(sep);
  const [top, second] = rel;
  if (top === 'src' && second !== undefined) return second;
  if (top === 'app') return 'app';
  if (top === 'tools') return 'tools';
  return null;
}

/** The layer an import specifier points at, or null if it is not a layer edge. */
function targetLayer(from: string, spec: string): string | null {
  if (EXTERNAL.test(spec)) return null;
  if (spec.startsWith('@')) {
    const alias = spec.slice(1).split('/')[0];
    if (alias === undefined) return null;
    if (
      ['game', 'render', 'components', 'theme', 'state', 'services', 'config',
        'data', 'challenge', 'league', 'brand'].includes(alias)
    ) {
      return alias;
    }
    return null;
  }
  if (spec.startsWith('.')) {
    const fromDir = join(relative(ROOT, from), '..');
    const [top, second] = relative(ROOT, join(fromDir, spec)).split(sep);
    if (second === undefined) return null;
    if (top === 'src') return second;
    // A relative import that climbs out of `src/` into `tools/` is still a layer
    // edge, and the one that matters most: the pure engine must never reach the
    // off-device tooling. Returning `tools` here is what makes that catchable.
    if (top === 'tools') return 'tools';
  }
  return null;
}

/** ARCHITECTURE.md §3. Layers a given layer may never import. */
const FORBIDDEN: Record<string, string[]> = {
  game: ['react', 'react-native', 'expo', 'state', 'services', 'components', 'hooks', 'theme', 'tools', 'app', 'render', 'config', 'data', 'challenge', 'league', 'brand'],
  render: ['state', 'services', 'components', 'app', 'hooks'],
  components: ['app', 'tools', 'render'],
  hooks: ['app', 'components'],
  // NOTE: `hooks -> render` is deliberately ALLOWED, not forgotten. The board
  // viewport hook asks the renderer how much room a board needs
  // (`computeBoardLayout`) and what zoom a tier opens at (`initialScaleForTier`).
  // That is the one place a hook legitimately needs render geometry, and it
  // points downward through `@render`, never up.
  state: ['app', 'render', 'components'],
  services: ['components', 'state', 'app', 'render', 'hooks'],
  tools: ['app', 'components', 'state', 'services', 'hooks'],
  data: ['services', 'state', 'components', 'app'],
  theme: ['state', 'services', 'components', 'game', 'app'],
  challenge: ['app', 'components', 'services', 'render'],
  league: ['app', 'components', 'services', 'render'],
  brand: ['app', 'components', 'services', 'state', 'render'],
  config: ['app', 'components', 'state', 'services', 'render'],
};

/**
 * ARCHITECTURE.md §2. Layers that must be reached through their own barrel.
 *
 * `services` is exempt, and deliberately so. Its barrel is minimal by design:
 * adding `supabase` to it would pull `expo-secure-store` and the Supabase client
 * into every store that touches `storage`, and adding `audioAssets` would
 * contradict that file's own header. A deep `@services/x` is the intended API
 * there, not a violation — so the rule is waived rather than "fixed" into a
 * regression. See ARCHITECTURE.md §2.
 */
const DEEP_IMPORT_ALLOWED = new Set(['game', 'services']);

/**
 * Imports that are allowed to reach past a barrel anyway, with a reason each.
 *
 * ARCHITECTURE.md §2. An entry here is a deliberate exception, not an oversight —
 * each one names why the file belongs where it is rather than in the barrel.
 */
const SANCTIONED_DEEP_IMPORTS = new Set([
  // The engine self-check. Developer-facing, and must never be pulled into a
  // production screen by accident — so it stays OUT of the barrel on purpose.
  '@game/diagnostics',
  // The Skia board itself. A top-level surface the play screen mounts, not a
  // helper that composes with the rest of the render maths. See render/index.ts.
  '@render/SkiaBoard',
]);

/**
 * The platform packages `game/` must never touch.
 *
 * Purpose:      These are not layers, so `targetLayer` returns null for them and the
 *               forbidden-edge check would never see them — which is exactly how
 *               `import { useMemo } from 'react'` inside `game/` slips through.
 *               They are checked separately, against this list, below.
 * Notes:        `src/game` is pure TypeScript. If this list ever produces a
 *               violation, the engine has stopped being runnable off-device, and
 *               that is the guarantee the whole level pipeline depends on.
 */
const PLATFORM = [
  'react', 'react-native', 'expo', 'zustand', 'node:fs', 'node:path',
];

const violations: string[] = [];
let checked = 0;

/** True when a specifier is a platform package (React, Expo, Skia, Node builtins). */
function isPlatform(spec: string): boolean {
  return (
    PLATFORM.includes(spec) ||
    /^(react-native|expo|node:)/.test(spec) ||
    /^@(expo|shopify|supabase|react-native|react-google-mobile-ads|react-native-google-mobile-ads|react-native-reanimated|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-svg|react-native-worklets|react-native-async-storage)\//.test(spec)
  );
}

for (const dir of SCAN) {
  for (const file of walk(join(ROOT, dir))) {
    const source = readFileSync(file, 'utf8');
    const from = layerOf(file);
    const rel = relative(ROOT, file).split(sep).join('/');

    for (const match of source.matchAll(IMPORT_RE)) {
      const spec = match[1] ?? match[2];
      if (!spec) continue;
      checked += 1;

      // `game/` is the one layer with a hard purity requirement, and it is checked
      // FIRST, before the layer-edge guard below. Platform packages are
      // deliberately not layers, so `targetLayer` returns null for `react` — and a
      // check placed after that guard never runs, which is precisely the bug this
      // ordering avoids. The engine's off-device guarantee depends on it.
      if (from === 'game' && isPlatform(spec)) {
        violations.push(
          `${rel}: game/ must stay pure — it cannot import "${spec}" (ARCHITECTURE.md §1)`,
        );
        continue;
      }

      const target = targetLayer(file, spec);
      if (!target || !from) continue;

      const banned = FORBIDDEN[from];
      if (banned && banned.includes(target)) {
        violations.push(`${rel}: ${from}/ must not import ${target}/ ("${spec}")`);
        continue;
      }

      if (target === from) continue;
      if (DEEP_IMPORT_ALLOWED.has(target)) continue;
      if (SANCTIONED_DEEP_IMPORTS.has(spec)) continue;
      // The `@` is part of the prefix. Without it this compares
      // `'@theme/types'.startsWith('theme/')`, which is false for every alias and
      // the barrel rule silently never fires — a checker that looks right and
      // enforces nothing.
      if (spec.startsWith(`@${target}/`)) {
        violations.push(
          `${rel}: reaches past the @${target} barrel ("${spec}") — add it to the barrel instead`,
        );
      }
    }
  }
}

console.log(`Checked ${checked} imports across ${SCAN.join(', ')}.`);

if (violations.length > 0) {
  console.error('');
  console.error(`${violations.length} architecture violation(s):`);
  for (const v of violations.slice(0, 30)) console.error(`  x ${v}`);
  if (violations.length > 30) console.error(`  ... and ${violations.length - 30} more`);
  console.error('');
  console.error('See docs/ARCHITECTURE.md.');
  process.exit(1);
}

console.log('No architecture violations.');

