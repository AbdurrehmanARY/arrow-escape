# ARCHITECTURE_FINAL.md — Phase 23 Final Audit

> **Deliverable of Phase 23** of [implementation.md](../implementation.md).
> Read [ARCHITECTURE.md](ARCHITECTURE.md) for the rules this tree now obeys and
> [ARCHITECTURE_MIGRATION.md](ARCHITECTURE_MIGRATION.md) for the measured inventory
> this audit closes out.
> **Branch:** `levels/extend-to-1000` @ `9263ca3`
> **Rule:** every claim here was measured against the tree, not recalled from the
> plan. Where the plan said something different, the measurement won and the plan
> was corrected.

---

## 1. What the migration did

Eleven phases changed files. Four were confirmed no-ops by measurement and were
deliberately left alone.

| phase | outcome |
|---|---|
| 1 inventory | delivered — `ARCHITECTURE_MIGRATION.md` |
| 2 rules | delivered — `ARCHITECTURE.md` |
| 3 boundaries | **7 defects fixed**, 30 barrel bypasses swept |
| 4 `game/` | **no-op** — already pure and cohesive; nothing moved |
| 5 level data | **no-op** — separation already correct |
| 6 `tools/` | classifier added, `_scratch-*` recorded (see §6) |
| 7–8 `render/` | foldered into `arrows/`, `effects/`, `view/`, `gestures/` + barrel |
| 9 components | 3 maths files moved **out** into `render/` |
| 10 `Overlays` | **declined** — see §5 |
| 11 play screen | audited, no move — see §5 |
| 12 hooks | barrel added |
| 13 state | **declined** — the real defect was the barrel, fixed in Phase 3 |
| 14 services | `audio/` folder + barrel |
| 15 audio assets | classification only — see §6 |
| 16 theme | **declined** — see §5 |
| 17 theme assets | **zero bytes changed** — see §5 |
| 18 theme contract | deferred — see §6 |
| 19 config/utils | **created nothing** — no file justified a new home |
| 20 tests | `__tests__/architecture/` added |
| 21 enforcement | `tools/check-architecture.ts` + `npm run architecture:check` |
| 22 verify | green, see §7 |
| 23 audit | this document |

### The tree now

```
src/
|-- game/       types board rules solver hints codec ascii diagnostics index
|-- data/       levels/ chapters index
|-- render/     SkiaBoard scene skiaScene arrowGeometry camera cameraPresets
|               hitTest timings index
|               arrows/ArrowNode  effects/{PressOverlay,DepartingDotsNode}
|               view/useBoardCamera  gestures/useBoardGestures
|-- components/ 19 UI files + levels/ (4)
|-- hooks/      useArrowTap useBoardViewport useHintFlow useLeagueBoard
|               useThemeAssets index
|-- state/      10 stores + index
|-- services/   audio/{audio,audioAssets,audioFades,index} ads auth haptics
|               storage supabase sync telemetry index
|-- theme/      themes types themeAssets index
|-- challenge/  rewards schedule monthlyTrophies stats types rewardArt index
|-- league/  brand/  config/
```

---

## 2. The seven Phase-3 defects, all fixed

| # | defect | fix |
|---|---|---|
| 1 | `sync.ts` -> `state/progressStore` -> `sync.ts` cycle | `LevelRecord` moved to `services/storage`, re-exported by the store |
| 2 | `@game/codec` not in the barrel, forcing 13 deep imports | `codec` exported from `game/index.ts`; 13 imports rewritten |
| 3 | `state/index.ts` exported 8 of 10 stores | `streakStore` and `energyStore` added |
| 4 | `services/index.ts` exported 3 of 10 modules | **left minimal on purpose** — see §4 |
| 5 | dead `@screens/*` alias in `tsconfig.json` and `jest.config.js` | deleted from both |
| 6 | 30 barrel bypasses across `app/` | swept; `@data` and `@render` barrels created |
| 7 | `challenge/index.ts` omitted `monthlyTrophies` | added, so the barrel stops lying |

### Two inversions the inventory missed

The Phase 1 inventory found one layer inversion (`render` -> `components`). Writing
the checker found two more, both the same shape — a low layer reading a store that
its caller already had:

- `services/haptics.ts` imported `useSettingsStore` to decide whether to vibrate.
  Every call site already passed `haptics` in explicitly, so the store read was dead
  weight with a real cost. Now `undefined` means "yes", which is what the `catch`
  used to fall back to.
- `theme/themeAssets.ts` imported the store to read `themeId`. The registry
  `getThemeAssets` is pure and stayed; the `useThemeAssets` hook moved to
  `src/hooks/`, because reading a store is `hooks/`'s job.

**This is the argument for writing the checker rather than only writing the rules.**
A review finds what it looks for; a checker finds what it was told to look for, and
it found two things nobody had listed.

---

## 3. The checker earned its keep four times

`tools/check-architecture.ts` was written believing the tree was nearly clean. It was
not, and every one of these was found by the checker, not by inspection:

1. **`game -> react` was unenforceable.** The purity check sat *after*
   `if (!target || !from) continue`, and `react` is deliberately not a layer, so the
   guard fired first and the rule never ran. A checker that looks correct and
   enforces nothing is worse than no checker, because it reports "clean". Moved
   above the guard.
2. **The barrel rule compared `'@theme/types'.startsWith('theme/')`** — the `@` is
   part of the alias, so this was false for every alias in the repo and the rule
   silently never fired. It reported zero violations while enforcing nothing.
3. **Relative imports climbing into `tools/` were invisible**, so `game` reaching the
   off-device tooling could not be caught. Now detected.
4. **30 real barrel bypasses**, which had been deferred in Phase 1 as "low priority".

Each was found by a seeded test in `__tests__/architecture/architecture.test.ts`. A
validator nobody has watched fail is a validator nobody can trust, so every rule is
planted in a real file and the checker has to catch it.

---

## 4. Deliberate exceptions, with reasons

Rules that were **not** enforced, because enforcing them would have caused a
regression. Each is a decision, not an oversight.

### `services/` is exempt from the barrel rule

`services/index.ts` exports only `storage`, `audio`, `ads`. Adding `supabase`,
`sync` or `auth` to it would pull `expo-secure-store` and the Supabase client into
every store that touches `storage` — ten Zustand stores, on the app's launch path.
`audioAssets` is excluded because that file's own header says it is the private
wiring. A deep `@services/x` is the intended API here.

### `hooks -> render` is allowed

`useBoardViewport` asks the renderer how much room a board needs
(`computeBoardLayout`) and what zoom a tier opens at (`initialScaleForTier`). That is
the one legitimate reason for a hook to need render geometry, and it points
downward through `@render`.

### `@game/diagnostics` and `@render/SkiaBoard` bypass their barrels

Both are named in `SANCTIONED_DEEP_IMPORTS` with the reason inline. `diagnostics` is
developer-facing and must never be pulled into a production screen by accident — so
it is kept *out* of the barrel deliberately. `SkiaBoard` is a top-level surface the
play screen mounts, not a helper that composes with the scene maths.

### `tools -> render` is allowed

`bench.ts` and `preview-themes.ts` draw boards off-device using the exact module the
app draws with. That is the point of both tools, and it is a downward edge.

---

## 5. Phases declined, and why

Four phases were planned as restructures. Measurement said the work was not worth
doing, and the plan's own principle — *create a directory only when a real file
belongs in it* — says not to do it anyway.

### Phase 4 — `game/` (no-op)

Zero external imports; every import is relative to `./`. `board.ts` is 320 cohesive
lines and was going to be split into geometry/raycast folders for symmetry with the
target picture. Splitting a file that has one responsibility, for the sake of a
diagram, is churn. **Nothing moved.**

### Phase 10 — `Overlays.tsx` (declined)

340 lines, the largest UI candidate. But `Action` and `Sheet` are module-private
helpers, not duplicates of anything, so the split would be a folder tree around one
file. The justification would be line count, which is not a reason.

### Phase 13 — `state/` (declined)

10 stores and a reducer, 80–194 lines each. Four sub-folders would add path depth
without adding clarity. The actual defect — a barrel exporting only 8 of 10 — was
fixed in Phase 3, which is where it belonged.

### Phase 16 — `theme/` (declined, highest-risk move in the plan)

`themes.ts` is 406 lines holding all 8 themes inline (`paper`, `arrow`, `midnight`,
`noodles`, `bold`, `blueprint`, `graphite`, `kineticNeon`) and is read by every
screen through `@theme`. Splitting it into `presets/*.ts` means changing the one
public surface 37 files depend on, for a file that has no cohesion problem — a
theme preset is a data record, and all 8 belong to one registry. **The risk was real
and the benefit was not.** Doing this needs a device, not a test suite.

### Phase 17 — theme assets (zero bytes)

`assets/themes/` does not exist, and the art in `assets/{awards,league,shields,brand,
monthly trophies,records}` is largely theme-invariant. Creating
`assets/themes/<theme>/` would mean duplicating byte-identical files to make folders
look symmetrical. Recorded as centralised; nothing moved.

### Phase 19 — `config/`, `constants/`, `utils/` (created nothing)

`config/index.ts` already exists. No file justified a `constants/` or `utils/`
directory. `utils/` in particular is where dead code goes to be tolerated rather than
deleted.

---

## 6. Findings recorded, not acted on

Real, verified, and deliberately left for a decision that is not mine to make.

### Dead code

| file / symbol | evidence |
|---|---|
| `src/hooks/useResponsive.ts` | 42 lines, **zero callers**. The only other mention is my own comment in `hooks/index.ts`. Excluded from the barrel. |
| `playSting` in `services/audio` | only its own definition; nothing calls it |
| `src/challenge/rewardArt.ts` | 88 lines, exported, **no importers** — screens read `rewards.ts` |

These are deletions, and deleting working code is a product decision.

### Open-loop timers (pre-existing debt A-4, unchanged)

`services/audio.ts` fades music by adding a fixed `delta` per `setInterval` rather
than measuring elapsed time, and `components/DummyAdModal.tsx` counts a 1.25s ad
downdown the same way. Both stretch when the JS thread is busy. Recorded before this
migration and deliberately not fixed here: changing timing while moving code makes
the move impossible to verify.

### Theme asset duplication (pre-existing)

`theme/themeAssets.ts` contains two asset families that are identical in content, so
the file advertises a per-theme art system that does not exist. The two info-page
routes that were previously overriding assets with a theme branch no longer do, but
the duplicate family remains.

### `useBoardViewport` is also dead

Verified: `BoardViewport` has 5 references, all of them doc comments in other files.
`UseBoardViewportArgs` has zero external references. It was maintained through the
render moves regardless, because it is the only consumer of the relocated board
maths — dropping it would have left `computeBoardLayout` and `initialScaleForTier`
with no caller at all.

### Phase 18 — theme contract (deferred, real work remaining)

Grepping every `theme === '...'` conditional across `components/` and `render/` and
replacing them with a component-contracts-to-theme interface is genuine work that
changes rendering. It needs a device. Not attempted.

---

## 7. Verification

| command | result |
|---|---|
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npx eslint . --max-warnings=0` | **PASS**, exit 0 |
| `npx jest` | **PASS** — 31 suites, 380 tests (was 30 / 369; +11 architecture tests) |
| `npx tsx tools/validate.ts` | **PASS** — 20 packs, 1000 levels, 928 boards, 125866 arrows |
| `npx tsx tools/check-architecture.ts` | **PASS** — 615 imports, 0 violations |
| `npm run verify` (chained) | **PASS**, exit 0 |
| Android build | **not run** |
| On-device testing | **not run** — no device available |

**What the green suite does and does not prove.** 380 passing tests mean the moves
disturbed nothing the suite can observe: level byte-identity and solvability, heart
accounting through Skia, hit-testing at every reachable zoom, blocked-tap animation,
arrow visuals, shape cues, storage versioning, and — new — every architecture rule
firing on a seeded violation. It does **not** mean the app launches. No test renders
a screen end to end, and nothing here was run on a phone. Phases 16 and 18, which
were declined for exactly that reason, remain open for the same reason.

**Corruption checks after ~40 scripted rewrites.** The bulk import sweeps used
`Get-Content -Raw` / `Set-Content`, the pattern that previously corrupted
`SkiaBoard.tsx`. Verified afterwards: 0 stray trailing backslashes, 0 files with a
UTF-8 BOM, 0 leftover `__seed`/`__probe` files, and all rewritten files kept their
original line counts.

---

## 8. The rules, for the next person

1. **`src/game/` stays pure.** It is checked against a platform list *before* the
   layer guard, because a platform package is not a layer. Do not move that check
   down.
2. **Import through barrels.** `@data` and `@render` were created in this migration
   precisely because their absence forced consumers to know the file layout.
3. **A barrel that omits a module forces a rule violation.** Two barrels did exactly
   that here. When a consumer wants something the barrel does not export, add it to
   the barrel.
4. **Never re-split and re-join a source file from PowerShell.** It corrupted
   `SkiaBoard.tsx` once. Write whole new files in one write; edit with targeted
   replacement.
5. **Never `reset`, `stash`, `clean` or `revert` the working tree.** It carries
   in-flight work; the tree was at 207 entries before this migration began.
6. **Add a seeded test for every new rule.** Four rules in the checker were silently
   enforcing nothing until a test proved they fired.
7. **Do not create a directory to satisfy a diagram.** Four phases were declined on
   this basis and the tree is better for it.
