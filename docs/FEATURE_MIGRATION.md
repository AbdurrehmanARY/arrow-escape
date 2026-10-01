# FEATURE_MIGRATION.md — Phase 1: Architecture Inventory

> **Phase 1 of the feature-based migration. Deliverable only — no code has changed.**
> Method: the reverse-dependency graph was **computed from the source** (all imports in
> `app/`, `src/`, `__tests__`, `tools/` resolved through aliases and relative paths),
> not inferred from filenames. Every "consumers" number below is measured.
>
> **Read [ARCHITECTURE.md](ARCHITECTURE.md) first.** A layer architecture is already in
> place and mechanically enforced. This document records what a *feature* migration
> would collide with, and was written to be read before any file moves.

---

## 1. Measured size of the migration

| area | files | notes |
|---|---|---|
| `src/` | **113** | 13 top-level layers |
| `app/` | **24** | 5 tabs, 3 nested `_layout`, 16 leaf routes |
| `__tests__/` | **32** | 380 tests / 31 suites |
| `tools/` | **30** (+6 `_scratch-*`) | `curriculum.ts` 1158, `shapeArt.ts` 1356, `shapeGlyphs.ts` 617 |
| **`.ts`/`.tsx` total** | **≈199** | every one is an import-rewrite surface |

**The five most-coupled files** — each is a blast radius, not a file move:

| file | LOC | consumers |
|---|---|---|
| `src/game/index.ts` | 23 | **47** (17 tests, 10 tools, 4 routes, `challenge/`, `components/levels/`, `data/levels/`, 3 hooks, 9 render, `state/gameReducer`) |
| `src/theme/index.ts` | 134 | **41** |
| `src/state/index.ts` | 19 | **27** |
| `src/components/index.ts` | 33 | **22** (every screen) |
| `src/challenge/index.ts` | 18 | **17** |

---

## 2. Conflict with the existing enforced architecture

`tools/check-architecture.ts` implements a hardcoded layer map. The **actual, enforced**
rules are:

```ts
game:       [react, react-native, expo, state, services, components, hooks, theme,
             tools, app, render, config, data, challenge, league, brand]
render:     [state, services, components, app, hooks]
components: [app, tools, render]
hooks:      [app, components]
state:      [app, render, components]
services:   [components, state, app, render, hooks]
tools:      [app, components, state, services, hooks]
data:       [services, state, components, app]
theme:      [state, services, components, game, app]
challenge:  [app, components, services, render]
league:     [app, components, services, render]
brand:      [app, components, services, state, render]
config:     [app, components, state, services, render]

DEEP_IMPORT_ALLOWED     = { game, services }
SANCTIONED_DEEP_IMPORTS = { '@game/diagnostics', '@render/SkiaBoard' }
```

### 2.1 After the migration, the enforcer goes **blind**, not red

`layerOf()` returns the second segment of `src/<X>`. So `src/features/**` → `features`,
`src/shared/**` → `shared`, `src/infrastructure/**` → `infrastructure`. None is a key in
`FORBIDDEN`, and none is in `targetLayer`'s alias whitelist — so **no rule applies to any
migrated file**. The checker would print `No architecture violations.` and exit `0`
while enforcing nothing.

Worse: `game/` purity is gated on `if (from === 'game' && isPlatform(spec))`. Move the
engine to `src/features/gameplay/engine/` and `from` becomes `features` — the
**pure-TypeScript guarantee that the entire off-device level pipeline depends on stops
being verified**, silently.

**Consequence: Phase 0 must re-arm the validator for the new layers *before* any file
moves.** This is the single most important sequencing requirement in this plan.

### 2.2 The documented matrix is stricter than the enforced one

`ARCHITECTURE.md` §3 says `may import is exhaustive` and lists `state/` as importing
only `services/`, `game/`, `data/`. **Four `state/` files import layers that table
forbids, and the checker passes them** because `FORBIDDEN['state']` is only
`[app, render, components]`:

| file | imports | doc says | checker says |
|---|---|---|---|
| `src/state/challengeStore.ts` | `@challenge` | ❌ forbidden | ✅ allowed |
| `src/state/leagueStore.ts` | `@league` | ❌ forbidden | ✅ allowed |
| `src/state/settingsStore.ts` | `@theme` | ❌ forbidden | ✅ allowed |
| `src/state/progressStore.ts` | `@config` | ❌ forbidden | ✅ allowed |

`state → challenge` being permitted is what makes the cycles in §3 finite rather than
immediate. **Record as a pre-existing defect; do not "fix" it during the migration.**

---

## 3. Cycles found (real, not theoretical)

Both route through one file: **`src/challenge/rewards.ts` (276 LOC)** is the only file in
`challenge/` that imports stores, and it imports three of them.

```
CYCLE A:  src/state/challengeStore.ts
        → @challenge (challenge/index.ts)
        → challenge/rewards.ts
        → src/state/challengeStore.ts                        ✔ cycle

CYCLE B:  src/services/sync.ts
        → @challenge (challenge/index.ts)
        → challenge/rewards.ts
        → src/state/challengeStore.ts
        → @services/sync                                     ✔ cycle
```

`challenge/rewards.ts` also imports `state/progressStore` and `state/leagueStore`.
**It is a UI-facing calculation living in a domain folder, and it is the migration's
natural break point** — moving it into `features/achievements/` and inverting its store
reads is what dissolves both cycles.

---

## 4. Feature ownership — full per-file inventory

**Destination legend.** `GP` `features/gameplay/` · `GPE` `…/engine/` · `GPC`
`…/components/` · `GPH` `…/hooks/` · `GPS` `…/store/` · `SH` `shared/` · `INF`
`infrastructure/` · `AUD` `features/audio/` · `ADS` `features/ads/` · `HINT`
`features/hints/` · `PROG` `features/progression/` · `ACH` `features/achievements/` ·
`LEA` `features/league/` · `LSEL` `features/level-selection/` · `LEV` `features/levels/` ·
`CFG` `features/settings/` · `HOME`/`COLL`/`ACC` · **`KEEP`** = stays put (pinned layer,
documented deviation).

### 4.1 `src/game/` — 9 files → **KEEP (pinned)**

| file | LOC | consumers | destination |
|---|---|---|---|
| `index.ts` | 23 | **47** | KEEP — the `@game` contract |
| `types.ts` | 280 | 8 | KEEP |
| `board.ts` | 320 | 5 | KEEP |
| `rules.ts` | 230 | 4 | KEEP |
| `solver.ts` | 477 | 3 | KEEP |
| `codec.ts` | 217 | 11 | KEEP |
| `diagnostics.ts` | 272 | 2 | KEEP — sanctioned deep import |
| `hints.ts` | 62 | 2 | KEEP |
| `ascii.ts` | 206 | 2 | KEEP |

**Reason:** `src/game/` purity is `AGENTS.md`'s "one rule that matters most", the coverage
gate's target (`jest.config.js:40-43`), and what 10 `tools/` files run off-device.
Moving it breaks all three. `GP/GPE` may re-export it; it must not absorb it.

### 4.2 `src/render/` — 14 files → `GPE` (with caveats)

| file | LOC | consumers | destination | note |
|---|---|---|---|---|
| `SkiaBoard.tsx` | 366 | **1** (`play/[id].tsx`) | GPC | sanctioned deep import — must stay in the allow-list |
| `scene.ts` | 306 | 6 | GPE | |
| `skiaScene.ts` | 293 | 3 | GPE | |
| `gestures/useBoardGestures.ts` | 304 | 2 | GPH | |
| `arrows/ArrowNode.tsx` | 257 | 2 | GPC | |
| `arrowGeometry.ts` | 209 | 5 | GPE | ⚠ **`tools/bench.ts` + `tools/preview-themes.ts` import it** |
| `view/useBoardCamera.ts` | 205 | 2 | GPH | |
| `camera.ts` | 126 | 4 | GPE | |
| `hitTest.ts` | 119 | 4 | GPE | |
| `cameraPresets.ts` | 107 | 2 | GPE | |
| `effects/PressOverlay.tsx` | 71 | 2 | GPC | |
| `effects/DepartingDotsNode.tsx` | 43 | 2 | GPC | |
| `index.ts` | 37 | 1 | GPE | |
| `timings.ts` | 35 | 2 | GPE | |

⚠ Moving this folder breaks **two tools** and the `@render/SkiaBoard` sanction. See §7.

### 4.3 `src/components/` — 21 files

| file | LOC | consumers | destination | owning feature |
|---|---|---|---|---|
| `Overlays.tsx` | 340 | barrel → `play` | GPC | gameplay |
| `Celebration.tsx` | 263 | barrel → `play` | GPC | gameplay |
| `PauseMenu.tsx` | 252 | barrel → `play` | GPC | gameplay |
| `Hud.tsx` | 215 | barrel, **+2 tests import it deep** | GPC | gameplay ⚠ |
| `Screen.tsx` | 174 | ~20 screens | SH | shared chrome |
| `Pressable.tsx` | 93 | **14** | SH | shared primitive |
| `sound.ts` | 65 | **14** | SH | shared primitive |
| `index.ts` | 33 | **22** | SH (split) | ⚠ barrel currently mixes all features |
| `AwardInfoLayout.tsx` | 260 | barrel | ACH | achievements |
| `MonthlyTrophyModal.tsx` | 258 | barrel | ACH | achievements |
| `ChallengeBadges.tsx` | 145 | `challenge/stats.tsx` | ACH | achievements |
| `MonthlyTrophyBadge.tsx` | 73 | Home, challenge, collection | ACH | achievements |
| `AwardInfoPage.tsx` | 45 | 8 info routes | ACH | achievements |
| `LeagueIntro.tsx` | 160 | `(tabs)/leagues.tsx` | LEA | league |
| `levels/ChapterGrid.tsx` | 141 | barrel | LSEL | level-selection |
| `levels/ChapterList.tsx` | 113 | barrel | LSEL | level-selection |
| `levels/LevelTile.tsx` | 111 | barrel | LSEL | level-selection |
| `levels/JumpToLevel.tsx` | 96 | barrel | LSEL | level-selection |
| `StreakRewardModal.tsx` | 236 | **barrel only — dead** | delete (deferred) | — |
| `DummyAdModal.tsx` | 144 | **barrel only — dead** | delete (deferred) | — |
| `CoachCard.tsx` | 79 | **comment + barrel — dead** | delete (deferred) | — |

> **The single most important finding in this inventory.** `src/components/index.ts` is
> imported by **all 22 screens**, and it re-exports gameplay-only components
> (`Hud`, `Overlays`, `Celebration`, `PauseMenu`) plus three dead ones. Every screen
> therefore pulls the entire gameplay UI and all dead code into its module graph. A
> feature migration that splits this barrel is the highest-value change available —
> and the one most likely to break something, because all 22 screens import from it.

### 4.4 `src/hooks/` — 7 files

| file | LOC | consumers | destination |
|---|---|---|---|
| `useHintFlow.ts` | 252 | `play/[id].tsx` | HINT |
| `useLeagueBoard.ts` | 168 | `(tabs)/leagues.tsx` | LEA |
| `useArrowTap.ts` | 156 | `play/[id].tsx` | GPH |
| `useBoardViewport.ts` | 121 | `play/[id].tsx` | GPH |
| `useResponsive.ts` | 42 | **0 — dead** | delete (deferred) |
| `useThemeAssets.ts` | 23 | Home, leagues | SH |
| `index.ts` | 21 | **0 — barrel unused** | delete (deferred) |

⚠ All 6 real imports of these hooks are **relative** (`../../src/hooks/…`) from `app/`.
The barrel exists and is used by nobody.

### 4.5 `src/state/` — 11 files

| file | LOC | consumers | destination |
|---|---|---|---|
| `progressStore.ts` | 190 | 3 | PROG |
| `authStore.ts` | 143 | 1 | ACC / INF |
| `leagueStore.ts` | 138 | 4 | LEA |
| `gameReducer.ts` | 134 | 1 | GPS |
| `settingsStore.ts` | 123 | barrel only | CFG |
| `challengeStore.ts` | 112 | 3 | ACH |
| `energyStore.ts` | 100 | 2 | PROG |
| `streakStore.ts` | 91 | 2 | PROG |
| `onboardingStore.ts` | 88 | **barrel only — dead** | delete (deferred) |
| `hintStore.ts` | 80 | 2 | HINT |
| `index.ts` | 19 | **27** | split into per-feature barrels |

⚠ `ARCHITECTURE.md` §3 says live board state stays out of the global store;
`gameReducer.ts` correctly does. Preserve that boundary when it moves to `GPS`.

### 4.6 `src/services/` — 12 files

| file | LOC | consumers | destination |
|---|---|---|---|
| `audio/audio.ts` | 426 | 1 | AUD |
| `audio/audioAssets.ts` | 174 | audio, **haptics** | AUD |
| `audio/audioFades.ts` | 73 | 1 | AUD |
| `audio/index.ts` | 21 | 1 | AUD |
| `auth.ts` | 349 | 2 | ACC / INF |
| `sync.ts` | 285 | 6 | INF |
| `supabase.ts` | 161 | 4 | INF |
| `haptics.ts` | 138 | 3 | SH or INF |
| `storage.ts` | 107 | **12** | INF |
| `telemetry.ts` | 65 | 2 | INF |
| `index.ts` | 14 | **0** | delete (deferred) |
| `ads.ts` | 344 | 4 | ADS |

⚠ `audioAssets.ts` holds **34 `require()` literals re-anchored one `../` level last
session**. `require()` paths are static — Metro cannot resolve them dynamically — so
another move re-breaks all 34 by hand. **Recommendation: do not move audio assets.**

### 4.7 `src/challenge/` — 8 files → `ACH`

| file | LOC | consumers | note |
|---|---|---|---|
| `rewards.ts` | 276 | 1 | ⚠ **cycle hub** (§3) |
| `schedule.ts` | 165 | 5 | |
| `monthlyTrophies.ts` | 161 | 1 | |
| `stats.ts` | 118 | 1 | |
| `types.ts` | 73 | 3 | |
| `index.ts` | 18 | **17** | |
| `rewardArt.ts` | 88 | **0 — dead** | delete (deferred) |

### 4.8 `src/league/`, `src/data/`, `src/theme/`, `src/brand/`, `src/config/`

| file | LOC | consumers | destination |
|---|---|---|---|
| `league/league.ts` | 164 | 2 | LEA |
| `league/index.ts` | 7 | 3 | LEA |
| `data/index.ts` | 16 | **12** | LEV **or KEEP** |
| `data/chapters.ts` | 90 | 1 | LEV |
| `data/levels/index.ts` | 89 | 3 | LEV ⚠ imported by `tools/bench.ts` |
| `data/levels/pack-01…20.json` | — | via `levels/index` | LEV ⚠ |
| `theme/themes.ts` | 406 | 4 | **KEEP** |
| `theme/types.ts` | 156 | 3 | KEEP |
| `theme/index.ts` | 134 | **41** | KEEP |
| `theme/themeAssets.ts` | 110 | 2 | KEEP |
| `brand/index.ts` | 86 | 4 | SH or KEEP |
| `config/index.ts` | 72 | 6 | **KEEP** ⚠ aliased by 6 files |

### 4.9 `app/` — 24 routes

| route | LOC | src deps | feature |
|---|---|---|---|
| `play/[id].tsx` | **475** | components, challenge, config, data, game, 3 hooks, `@render/SkiaBoard`, ads, audio, state, theme | GP |
| `(tabs)/leagues.tsx` | 440 | components, hooks×2, audio, sync, state, theme | LEA |
| `(tabs)/challenge/index.tsx` | 432 | challenge, components, audio, state, theme | ACH |
| `(tabs)/collection.tsx` | 418 | challenge, components, audio, state, theme | COLL |
| `account.tsx` | 417 | components, auth, supabase, sync, state, theme | ACC |
| `(tabs)/settings.tsx` | 383 | brand, components, config, audio, state, theme | CFG |
| `(tabs)/index.tsx` | 281 | brand, challenge, components, data, game, hooks, league, audio, state, theme | HOME |
| `stats.tsx` | 278 | components, data, game, state, theme | PROG |
| `(tabs)/challenge/rewards.tsx` | 178 | challenge, components, theme | ACH |
| `(tabs)/challenge/history.tsx` | 177 | challenge, components, game, state, theme | ACH |
| `(tabs)/challenge/stats.tsx` | 173 | challenge, components, state, theme | ACH |
| `_layout.tsx` | 163 | ads, audio, state | app shell |
| `(tabs)/challenge/[day].tsx` | 140 | challenge, components, data, `@game/codec`, state, theme | ACH |
| `(tabs)/_layout.tsx` | 128 | challenge, components, audio, state, theme | app shell |
| `levels.tsx` | 83 | components, config, data, state | LSEL |
| `(tabs)/challenge/_layout.tsx` | 21 | (none) | app shell |
| `challenge/info/*.tsx` ×8 | 7 each | `@components` only | ACH |

### 4.10 `tools/` — 30 files → **KEEP**

| tool | src deps |
|---|---|
| `curriculum.ts` (1158), `validate.ts`, `build-levels.ts`, `generate.ts`, `bench.ts`, `preview-themes.ts`, `probe-tiers.ts`, `probe-density.ts`, `check-curriculum.ts`, `_scratch-*` (4 of 6) | `@game`, `@game/codec`, `@data/levels`, `@render/arrowGeometry`, `@theme` |
| 20 asset/one-off scripts | none |

### 4.11 `__tests__/` — 32 files → mirror `src/`

Already mirrors `src/` 1:1. `architecture/architecture.test.ts` (200 LOC) seeds violations
against `src/game/__seed_violation.ts`, `src/render/__seed_violation.ts` (importing
`@components/Hud`), and `@services/storage` — **all three paths change or break if their
targets move.**

---

## 5. Migration map (OLD → NEW)

```
KEEP (pinned, documented deviation):
  src/game/**              src/game/**
  src/theme/**             src/theme/**
  src/config/**            src/config/**
  src/data/**              src/data/**
  src/render/**            src/render/**
  app/**                   app/**
  tools/**                 tools/**
  assets/**                assets/**

MOVE:
  src/components/{Overlays,Celebration,PauseMenu,Hud}.tsx  → features/gameplay/components/
  src/components/levels/*.tsx                              → features/level-selection/components/
  src/components/{AwardInfo*,MonthlyTrophy*,ChallengeBadges}.tsx → features/achievements/components/
  src/components/LeagueIntro.tsx                           → features/league/components/
  src/components/{Screen,Pressable,sound}.tsx              → shared/components/
  src/hooks/{useArrowTap,useBoardViewport}.ts               → features/gameplay/hooks/
  src/hooks/useHintFlow.ts                                 → features/hints/hooks/
  src/hooks/useLeagueBoard.ts                              → features/league/hooks/
  src/hooks/useThemeAssets.ts                              → shared/hooks/
  src/state/{progress,streak,energy}Store.ts               → features/progression/store/
  src/state/hintStore.ts                                   → features/hints/store/
  src/state/challengeStore.ts                              → features/achievements/store/
  src/state/leagueStore.ts                                 → features/league/store/
  src/state/settingsStore.ts                               → features/settings/store/
  src/state/authStore.ts                                   → features/account/store/
  src/state/gameReducer.ts                                 → features/gameplay/store/
  src/services/audio/**                                    → features/audio/services/
  src/services/ads.ts                                      → features/ads/services/
  src/services/{storage,sync,supabase,telemetry}.ts        → infrastructure/{storage,sync,database,analytics}/
  src/services/haptics.ts                                  → shared/primitives/
  src/challenge/**                                         → features/achievements/{services,types}/
  src/league/**                                            → features/league/services/
  src/brand/index.ts                                       → shared/branding/

DELETE (candidates, deferred — see §8):
  src/challenge/rewardArt.ts, src/hooks/useResponsive.ts,
  src/hooks/index.ts, src/services/index.ts,
  src/state/onboardingStore.ts,
  src/components/{CoachCard,DummyAdModal,StreakRewardModal}.tsx,
  tools/_scratch-*.ts (6)
```

---

## 6. Deviations — where the target architecture cannot be applied

```
File:        app/**  (24 routes)
Reason:      Expo Router is file-based: `main: "expo-router/entry"` resolves routes
             from `app/` at the repo root. The target wants `src/app/`. Moving it
             changes route resolution and touches Expo config — which §2/§17 of the
             brief require be preserved.
Decision:    Keep `app/` at root. Screens stay as thin route files; where a route is
             heavy (play/[id].tsx, 475 LOC) the feature owns the logic and the route
             re-exports it.
Alternative: Move to `src/app/` and set EXPO_ROUTER_APP_ROOT — rejected as an
             unnecessary Expo-config change in a "preserve config" task.

File:        src/game/** (9 files, 2,087 LOC)
Reason:      Moving it (a) disarms the purity check, whose guard is `from === 'game'`,
             (b) breaks the jest coverage gate keyed on `./src/game/`, (c) breaks 10
             `tools/` files that run the engine off-device, (d) rewrites 47 importers.
Decision:    Keep as a pinned pure domain layer. `features/gameplay/engine/` becomes a
             thin re-export, or is omitted.
Alternative: Full move + simultaneous rewrite of tsconfig, jest, checker, tools and
             tests. Rejected for risk: it trades the project's central correctness
             guarantee for folder symmetry.

File:        src/data/** (23 files)
Reason:      `@data` has 12 consumers and `data/levels/index.ts` is imported by
             `tools/bench.ts`. `@data` is also a tsconfig alias.
Decision:    Keep. Same reasoning as game/.
Alternative: `features/levels/data/` + alias retarget — possible, but the tool
             coupling makes it a tooling change, not a move.

File:        src/render/** (14 files)
Reason:      `@render/SkiaBoard` is a sanctioned deep import in the enforcer, and
             `arrowGeometry.ts` is imported by two tools.
Decision:    Keep. Feature folders consume it through `@render`.
Alternative: `features/gameplay/engine/render/` — rejected: it moves the sanction and
             the tool coupling for no clarity gain.

File:        src/config/**  and  src/brand/**
Reason:      `@config` is aliased and imported by 6 files incl. `services/ads.ts`;
             moving it into `app/config/` retargets an alias mid-flight.
Decision:    Keep `src/config/`. `src/brand/` → `shared/branding/` (low risk, 4 callers).
Alternative: `app/config/` as the target states — rejected.
```

```
File:        assets/**
Reason:      `services/audio/audioAssets.ts` holds 34 static `require()` literals that
             were re-anchored one `../` level in the previous session. `require()` is
             static; Metro cannot resolve it dynamically, so each move is 34 manual
             edits and a silent-breakage surface.
Decision:    Do not move assets. Document `assets/` as the existing asset root.
Alternative: `assets/{images,audio,fonts}` per target — deferred indefinitely.

File:        features/information/  and  features/legal/
Reason:      THE APP HAS NO SUCH SCREENS. There is no About, Help, Credits, Privacy
             Policy or Terms route. The 8 `challenge/info/*.tsx` files are award-info
             pages, which belong to achievements.
Decision:    Do not create these features. Per §20, architecture must represent real
             responsibilities.
Alternative: None — creating them would produce empty folders.

File:        features/league/  and  the challenge/achievements split
Reason:      The target feature list OMITS League entirely, though the app has a
             Leagues tab, `src/league/` (2 files), `useLeagueBoard`, `LeagueIntro`,
             `leagueStore` (which imports `@league`), and `league.test.ts`.
             It also has no `challenge` feature despite Challenge being the largest
             tab (5 screens + 8 info screens + `src/challenge/` 8 files).
Decision:    ADD `features/league/` and map `src/challenge/**` → `features/achievements/`
             as documented deviations from the target tree.

File:        store/  (repo root)
Reason:      Root `store/` contains Play Store graphics (play-icon-1024.png), not a
             state store. Under the new tree, "store" means state.
Decision:    Document the collision. Rename to `store-assets/` if desired.
Alternative: Leave it and rely on this note.

File:        src/state/*Store → features/*/store/
Reason:      `ARCHITECTURE.md` §6 forbids promoting component-local state to a global
             store, and locked decision 4 keeps live board state out of the store.
Decision:    `gameReducer.ts` moves to `features/gameplay/store/` AS A REDUCER, not a
             Zustand store. Preserve that distinction.
```

---

## 7. Lockstep break list — files that break without a compiler error

| # | move | breaks | why silent |
|---|---|---|---|
| 1 | `src/game/**` | `jest.config.js:40-43` coverage glob + threshold on `./src/game/` | Jest errors "coverage data not found" → `npm test` → `verify` fails |
| 2 | `src/game/index.ts` | `tsconfig.json:16`, `jest.config.js:16` (`@game` → `./src/game`) | alias resolves to a missing path |
| 3 | `src/game/**` | 10 `tools/` files (`validate`, `build-levels`, `generate`, `bench`, `preview-themes`, `probe-tiers`, `probe-density`, `check-curriculum`, `curriculum`, `_scratch-*`) | `levels:validate` is **inside** `verify` |
| 4 | `src/data/**` | `@data` alias, `jest.config.js:35-36`, `tools/bench.ts` | same |
| 5 | `src/render/SkiaBoard.tsx` | `SANCTIONED_DEEP_IMPORTS` + `play/[id].tsx:20` + `architecture.test.ts` | a sanction becomes a stale reference |
| 6 | `src/render/arrowGeometry.ts` | `tools/bench.ts`, `tools/preview-themes.ts` | tooling, not typechecked by the app build |
| 7 | `src/components/Hud.tsx` | `__tests__/render/heartsThroughSkia.test.tsx:66` (deep) + `architecture.test.ts:165` (**seeds a violation using `@components/Hud`**) | the seeded test passes for the wrong reason |
| 8 | `src/components/index.ts` | **all 22 screens** | one barrel, every screen |
| 9 | any `src/hooks/*` | 6 **relative** imports in `app/` (`index.tsx:22`, `leagues.tsx:18,19`, `play/[id].tsx:43,44,45`) | relative paths, not aliases |
| 10 | `src/services/storage.ts` | 12 consumers incl. 8 stores + `architecture.test.ts` seed | seeded test target |
| 11 | `src/theme/**` | **41** consumers | widest dependency in the repo |
| 12 | `services/audio/audioAssets.ts` | 34 `require()` literals | static paths Metro cannot resolve dynamically |

---

## 8. Dead code register (report only — per §17, not silently removed)

| symbol | LOC | evidence |
|---|---|---|
| `src/challenge/rewardArt.ts` | 88 | **0 importers** |
| `src/hooks/useResponsive.ts` | 42 | **0 importers** |
| `src/hooks/index.ts` | 21 | barrel, **0 importers** |
| `src/services/index.ts` | 14 | barrel, **0 importers** |
| `src/components/StreakRewardModal.tsx` | 236 | only `components/index.ts` re-export; no screen uses the symbol |
| `src/components/DummyAdModal.tsx` | 144 | same — **and `PROJECT_MEMORY.md` claims it renders for dev ads**; doc and code disagree |
| `src/components/CoachCard.tsx` | 79 | `play/[id].tsx:156-158`: *"Coach cards removed… remain for potential future use"* |
| `src/state/onboardingStore.ts` | 88 | `play/[id].tsx:157` comment + barrel only |
| `tools/_scratch-*.ts` | 6 files | scratch |
| `docs/ROADMAP.md:1` | — | typo: `x# ArrowPath` |

---

## 9. Proposed phases (adapted from §19)

| phase | work | gate |
|---|---|---|
| **1** | **This inventory.** Read-only. | ✅ done |
| **0** ⬅ inserted | Extend `check-architecture.ts` + its 11 seeded tests to know `features`/`shared`/`infrastructure`. **Before creating them** — otherwise the enforcer goes blind (§2.1) | `architecture:check` green **and** proven to fail on a seeded `features → infrastructure` violation |
| 2 | Create folders only where a real file lands | — |
| 3 | `app/` — audit only, no move (deviation §6) | — |
| 4 | Home | `verify` green |
| 5 | Level-selection (+ Levels decision gate) | `verify` green |
| 6 | **Gameplay** — highest risk; barrel split of `components/index.ts` | `verify` green + board still renders |
| 7 | Progression | `verify` green |
| 8 | Achievements + Collection (**dissolve cycles A & B here**) | `verify` green |
| 9–13 | Hints → Audio → Ads → Settings → Information/Legal (**no-op, §6**) | `verify` green |
| 14–15 | `shared/` + `infrastructure/` extraction | `verify` green |
| 16 | Dependency audit + cycle check | — |
| 17 | Full validation | all green |

**Per-phase ritual:** `tsc --noEmit` → `lint` → `test` → `levels:validate` →
`architecture:check`, plus `git status --porcelain` before/after. **Never** reset, stash,
clean or revert (`ARCHITECTURE.md:167`, `AGENTS.md`).

---

## 10. What cannot be validated

- **No device.** `AGENTS.md`: every phase must end in something testable on a physical
  Android device. The previous session's Android build and on-device test **never ran**.
- **`npm test` proves the domain, not the app.** 380 tests cover `src/game`, geometry,
  hit-testing, storage, stores. **No test renders a screen end-to-end.** A feature
  migration is precisely the kind of change those tests cannot see.
- Therefore phases 6–8 are validated by `tsc`/`jest`/the architecture checker **plus a
  device run**, and the device run is currently unavailable. This is the migration's
  single largest unmitigated risk.

---

## 11. Final report (Phase 1)

```
Files moved:                      0
Files deleted:                    0
Files renamed:                    0
Files unchanged:                  199
Features created:                 0
Shared modules created:           0
Infrastructure modules created:   0

TypeScript:                       PASS (npx tsc --noEmit, exit 0)
Lint:                             PASS (npm run lint, via verify)
Tests:                            PASS (31 suites / 380 tests, 14.6 s)
Levels:                           PASS (20 packs / 1000 levels, all solvable)
Architecture:                     PASS (615 imports, 0 violations)
Build / on-device:                NOT RUN — no device or Android SDK in this session

Circular dependencies:            2 real (challengeStore↔challenge, sync↔challengeStore)
Broken imports:                   0
Remaining architectural issues:   4 doc-vs-checker divergences (§2.2);
                                  1 barrel imported by all 22 screens (§4.3);
                                  10 dead files (§8)

Behavior changes:                 None — no code was modified.
```

---

## Open decisions

1. **§6 gameplay deviation** — `src/game/`/`src/data/`/`src/render/` pinned (`KEEP`) or moved?
2. **§6 information/legal** — confirm these features are omitted (no screens exist).
3. **§6 league + achievements** — approve adding `features/league/` (absent from the target).
4. **`implementation.md`** — it documents the *completed* layer migration. Overwrite, or keep this as `docs/FEATURE_MIGRATION.md`?
5. **§8 dead files** — delete during migration, or never?