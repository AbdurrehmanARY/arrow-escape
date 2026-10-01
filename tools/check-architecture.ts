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
 *               The `features/`, `shared/` and `infrastructure/` layers are the
 *               feature-based migration described in docs/FEATURE_MIGRATION.md.
 *               They are enforced here **before** any file moves into them. Adding
 *               the folders without the rules would have been worse than useless:
 *               `layerOf` reads the second path segment, so a `src/features`
 *               directory resolves to a layer named `features`, which no
 *               `FORBIDDEN` key mentions and no alias maps — the checker would
 *               have printed "No architecture violations." and exited 0 while
 *               enforcing nothing at all.
 *
 * Run: `npm run architecture:check`
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

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

/**
 * The layer a file belongs to, e.g. `src/game` -> `game`.
 *
 * Notes:   A **feature is a layer in its own right**: `src/features/gameplay/x.ts`
 *          resolves to `features/gameplay`, not to a flat `features`. That is the
 *          whole point of the split — `features/gameplay` importing
 *          `features/ads` is exactly the coupling feature ownership exists to
 *          stop, and a single flat `features` key cannot express it, because every
 *          feature would then be allowed to import every other one.
 */
function layerOf(file: string): string | null {
  const rel = relative(ROOT, file).split(sep);
  const [top, second, third] = rel;
  if (top === 'src' && second !== undefined) {
    if (second === 'features' && third !== undefined) return `features/${third}`;
    return second;
  }
  if (top === 'app') return 'app';
  if (top === 'tools') return 'tools';
  return null;
}

/** The `src/` sub-roots that own an entire subtree, with the feature compound case. */
const OWNED_ROOTS = new Set(['shared', 'infrastructure']);

/**
 * The root a file must not leave by relative path, or null when it has none.
 *
 * Purpose: `targetLayer` only resolves a relative specifier when it lands back in
 *          the *same* layer, so a relative import that crosses into another layer
 *          is invisible to every rule above. That is not a hypothetical: the
 *          repository's two import cycles both run through
 *          `src/challenge/rewards.ts -> '../state/challengeStore'`, which the
 *          checker has never once looked at. Legacy layers keep that blind spot —
 *          turning it on for them would surface `tools -> src/game`, which is
 *          legitimate — but the new roots do not get to start their life with it.
 *
 * Returns:    An absolute path fragment such as `\features\gameplay\`, or null.
 */
function ownedRoot(file: string): string | null {
  const rel = relative(ROOT, file).split(sep);
  const [top, second, third] = rel;
  if (top !== 'src' || second === undefined) return null;
  if (OWNED_ROOTS.has(second)) return `${sep}${second}${sep}`;
  if (second === 'features' && third !== undefined) return `${sep}features${sep}${third}${sep}`;
  return null;
}

/**
 * True for the pure engine's re-export facade, `src/features/gameplay/engine/`.
 *
 * Purpose: The engine stays physically at `src/game` — it is guarded by a purity
 *          rule, a jest coverage gate keyed on that exact path, and ten off-device
 *          `tools/` importers, and moving all three at once buys nothing — so
 *          `features/gameplay/engine/` re-exports it instead. A facade that
 *          quietly grows a helper function, or reaches for a platform package, has
 *          stopped being a facade and has started being a second engine with none
 *          of the guarantees, so this is checked directly rather than assumed.
 */
function isEngineFacade(file: string): boolean {
  const rel = relative(ROOT, file).split(sep);
  return rel[0] === 'src' && rel[1] === 'features' && rel[2] === 'gameplay' && rel[3] === 'engine';
}

/** Aliases that name a layer. Anything else beginning with `@` is a package. */
const LAYER_ALIASES = new Set([
  'game', 'render', 'components', 'theme', 'state', 'services', 'config',
  'data', 'challenge', 'league', 'brand', 'shared', 'infrastructure', 'features',
]);

/** The layer an import specifier points at, or null if it is not a layer edge. */
function targetLayer(from: string, spec: string): string | null {
  if (EXTERNAL.test(spec)) return null;
  if (spec.startsWith('@')) {
    const [alias, second] = spec.slice(1).split('/');
    if (alias === undefined) return null;
    if (!LAYER_ALIASES.has(alias)) return null;
    // `@features/gameplay/components/Hud` names the feature, not the root, so it
    // has to match `layerOf`'s compound form exactly or the two disagree about
    // which layer an edge belongs to and every rule silently stops applying.
    if (alias === 'features') return second === undefined ? null : `features/${second}`;
    return alias;
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
 * ARCHITECTURE.md §4. Layers `shared/` may never import.
 *
 * Purpose: `shared/` holds code with no owner — the point of it is that any feature
 *          can use it without asking. That only holds while it depends on nothing
 *          above it, so the ban is on `app`, any `features/*`, `infrastructure`,
 *          `tools` and `state` (a shared component reading a feature's zustand
 *          store is not shared, it is a feature wearing a disguise).
 * Notes:    The pinned layers stay reachable during the migration. Banning `game`,
 *          `render`, `data` and `components` here would be defensible once every
 *          caller has moved, and would be churn while half of them have not.
 */
const FORBIDDEN_SHARED = ['app', 'features', 'infrastructure', 'tools', 'state'];

/**
 * ARCHITECTURE.md §4. Layers `infrastructure/` may never import.
 *
 * Purpose: Platform adapters — storage, sync, the database client, analytics. This
 *          is the old `services` layer's ban list verbatim, plus `features` and
 *          `tools`, and the first half of that list is load-bearing: keeping
 *          `services -> state` banned means moving `storage.ts` and `sync.ts` into
 *          `infrastructure/` cannot quietly import the cycle those two files sit
 *          in the middle of today.
 */
const FORBIDDEN_INFRASTRUCTURE = [
  'app', 'features', 'tools', 'components', 'state', 'render', 'hooks',
];

/**
 * The layers a file may not import, for any layer including the new ones.
 *
 * Purpose: Features are resolved dynamically rather than through `FORBIDDEN`,
 *          because each one needs a ban list that names its *siblings*: a feature
 *          that cannot import any other feature still allows every pair of them to
 *          reach into each other, which is the coupling the migration exists to
 *          remove. Listing them as `features` here would be meaningless — the
 *          target of such an edge is `features/gameplay`, not `features`.
 */
/**
 * Whether an edge into `target` is banned by `banned`.
 *
 * Purpose: The new layers are compound — the target of an alias import is
 *          `features/gameplay`, not `features` — so an exact `includes` match
 *          would never fire for them. `shared/` bans `features`, and the target it
 *          has to catch is `features/gameplay`; testing those two strings for
 *          equality says they are different and the rule silently does nothing.
 *
 *          This does not change any existing rule. Every legacy entry in
 *          `FORBIDDEN` names a single segment, so `target === b` still matches and
 *          `target.startsWith(b + '/')` cannot accidentally fire: nothing resolves
 *          to a layer whose name is another layer's name followed by a slash.
 */
function isBanned(banned: string[], target: string): boolean {
  return banned.some((b) => target === b || target.startsWith(`${b}/`));
}

function forbiddenFor(from: string): string[] {
  if (from.startsWith('features/')) return ['app', 'tools'];
  if (from === 'shared') return FORBIDDEN_SHARED;
  if (from === 'infrastructure') return FORBIDDEN_INFRASTRUCTURE;
  return FORBIDDEN[from] ?? [];
}

/**
 * ARCHITECTURE.md §2. Layers that must be reached through their own barrel.
 *
 * `services` is exempt, and deliberately so. Its barrel is minimal by design:
 * adding `supabase` to it would pull `expo-secure-store` and the Supabase client
 * into every store that touches `storage`, and adding `audioAssets` would
 * contradict that file's own header. A deep `@services/x` is the intended API
 * there, not a violation — so the rule is waived rather than "fixed" into a
 * regression. See ARCHITECTURE.md §2.
 *
 * `shared` and `infrastructure` are exempt for a different reason: they are
 * sub-rooted by design (`shared/components`, `shared/hooks`,
 * `infrastructure/storage`, `infrastructure/sync`) and have no barrel at all.
 * Requiring one would mean inventing an `index.ts` whose only purpose is to make
 * this rule happy, which is the kind of file that ends up being the layer's
 * highest-blast-radius import. Intra-feature paths never reach this rule at all —
 * `target === from` short-circuits first — so a feature's own sub-folders stay
 * directly importable without any waiver.
 */
const DEEP_IMPORT_ALLOWED = new Set([
  'game', 'services', 'shared', 'infrastructure',
]);

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

      // The engine facade sits inside `features/gameplay` but is not part of it: it
      // is the engine's public surface and nothing else. It is checked before the
      // forbidden-edge rule so that a facade reaching for a platform package is
      // reported as a purity break rather than as an ordinary banned edge, which
      // is the distinction `game/` itself gets and the reason the check above has
      // to come first.
      //
      // Its own files may re-export each other relatively — a facade is allowed to
      // have more than one file, it just may not reach outside itself or sideways.
      if (isEngineFacade(file)) {
        const sideways =
          !spec.startsWith('.') ||
          !resolve(dirname(file), spec).includes(`${sep}features${sep}gameplay${sep}engine${sep}`);
        if (isPlatform(spec) || (targetLayer(file, spec) !== 'game' && sideways)) {
          violations.push(
            `${rel}: features/gameplay/engine/ must only re-export @game — it cannot import "${spec}" (ARCHITECTURE.md §4)`,
          );
          continue;
        }
      }

      // A relative import that leaves its own root is invisible to every rule
      // below, so it is rejected outright rather than merely un-checked. See
      // `ownedRoot` for why the legacy layers keep the blind spot.
      const owned = ownedRoot(file);
      if (owned && spec.startsWith('.')) {
        if (!resolve(dirname(file), spec).includes(owned)) {
          violations.push(
            `${rel}: must reach outside its own root by alias, not by relative path ("${spec}") — a cross-root relative import is not checkable`,
          );
          continue;
        }
      }

      const target = targetLayer(file, spec);
      if (!target || !from) continue;

      // Sibling features. `forbiddenFor` cannot express this: the banned target is
      // a specific feature, not a layer name, so it is matched here where both
      // sides of the edge are known.
      if (
        from.startsWith('features/') &&
        target.startsWith('features/') &&
        target !== from
      ) {
        violations.push(
          `${rel}: ${from}/ must not import ${target}/ ("${spec}") — features do not depend on each other (ARCHITECTURE.md §4)`,
        );
        continue;
      }

      const banned = forbiddenFor(from);
      if (isBanned(banned, target)) {
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

