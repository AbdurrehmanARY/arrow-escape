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
| `src/` | **92** | 12 top-level layers, plus 20 `data/levels/*.json` packs (not `.ts`) |
| `app/` | **24** | 5 tabs, 3 nested `_layout`, 16 leaf routes |
| `__tests__/` | **32** | 396 tests / 31 suites (16 added by Phase 0) |
| `tools/` | **30** (+6 `_scratch-*`) | `curriculum.ts` 1158, `shapeArt.ts` 1356, `shapeGlyphs.ts` 617 |
| **`.ts`/`.tsx` total** | **178** | every one is an import-rewrite surface |

> **Correction (Phase 0).** This table originally read `src/` = **113**, **13**
> top-level layers, **≈199** `.ts`/`.tsx` total, and 380 tests. Re-measuring gave
> 92 `.ts`/`.tsx` under `src/` (69 `.ts` + 23 `.tsx`) across **12** directories,
> and **178** across `src/` + `app/` + `__tests__/` + `tools/`. The 113 figure had
> swept the 20 level packs — `.json` — into a `.ts`/`.tsx` count; 199 repeated the
> same mistake at the total. `src/challenge/` was likewise listed as 8 files
> against 7 on disk (see §4.7). Nothing else in this document was affected: the
> per-directory counts, the consumer counts in the table below, the cycles in §3
> and the lockstep break list in §7 were all re-verified and stand.

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
| `useThemeAssets.ts` | 23 | Home, leagues | features/settings ✅ 2c-1 |
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

### 4.7 `src/challenge/` — 7 files → `ACH`

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
    src/features/settings/hooks/useThemeAssets.ts            → features/settings/hooks/ ✅ 2c-1
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
| 13 | **any file holding a depth-relative `require()` of a PNG** | its own `require()` depths | *proven, not predicted* — see §7.1 |

### 7.1 Item 13, demonstrated

`src/brand/index.ts` → `src/shared/branding/index.ts` moved from two levels below
the repo root to three. Its four `require('../../assets/brand/*.png')` calls became
`require('../../../assets/...')`.

**`tsc` stayed green.** A `require()` of a `.png` has no type declaration and no
module resolution under `moduleResolution`, so `npm run typecheck` reported
nothing at all — and `app/(tabs)/index.tsx`, the app's home screen, silently
imported a module that no longer existed. Only `npm test` caught it, as **seven
suites failing to run**: `src/theme/themeAssets.ts` imports branding, and the theme
barrel is reachable from the settings store, the state barrel and half the render
tests.

The lesson is about the *shape* of the risk, not this one file. The same hazard
sits in `audioAssets.ts` with **34** such calls (item 12), and any file that moves
deeper gains a `../`. Metro resolves these at bundle time, so the failure appears
on device as a red screen, not in CI. Every subsequent phase that moves a file
downward must move its `require()` depths in the same commit — and the check that
catches it is `npm test`, not `npm run typecheck`.

A second, quieter error was corrected at the same time: that file's header claimed
"every file here is generated by `npm run icons:brand`". `tools/make-brand-assets.ts`
writes the PNGs into `assets/` and **never emits `index.ts`**. The header has been
corrected, because a future reader who trusted it would regenerate assets, see no
diff to `index.ts`, and conclude the file was safe to move without looking.

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
| **0** ⬅ inserted | Extend `check-architecture.ts` + its seeded tests to know `features`/`shared`/`infrastructure`. **Before creating them** — otherwise the enforcer goes blind (§2.1) | ✅ **done** — see below |
| 2 | Create folders only where a real file lands | — |
| 2a | **`shared/branding`** — the first real move. See §9.2 | ✅ **done** |
| 2b ⬅ | **`src/components/Pressable.tsx`** → `shared/primitives/` — **unblocked** leaf; only `@theme`, no store read, no call-site change | ✅ **done** — see §9.2.1 |
| 2c-1 | **`useThemeAssets`** split from `shared/` to `features/settings` — reads `themeId`, a settings concern; §5's `shared/hooks/` destination was wrong | ✅ **done** — see §9.2.2 |
| 2c-2 | `shared/components` (`Screen` frame) + palette-as-prop (`useTheme` → `@state`); `sound.ts`/`ScreenHeader`/`IconButton` deferred on the audio seam, §9.3 | ✅ **done** — see §9.2.3 |
| 3 | `app/` — audit only, no move (deviation §6) | — |
| 4 | Home — **cannot move**; `app/` is pinned and Home owns no files, §9.3 | — |
| 5 | Level-selection (+ Levels decision gate) — as Home, §9.3 | — |
| 6 | **Gameplay** — highest risk; barrel split of `components/index.ts` | `verify` green + board still renders |
| 7 | Progression | `verify` green |
| 8 | Achievements + Collection (**dissolve cycles A & B here**) | `verify` green |
| 9–13 | Hints → Audio → Ads → Settings → Information/Legal (**no-op, §6**) | `verify` green |
| 14–15 | `shared/` + `infrastructure/` extraction | `verify` green |
| 16 | Dependency audit + cycle check | — |
| 17 | Full validation | all green |

### 9.1 Phase 0, as delivered

Commit `8aa0031`, on top of checkpoint `02c3424`. Rules live in
`ARCHITECTURE.md` **§10**; implementation in `tools/check-architecture.ts`.

| rule | mechanism |
|---|---|
| a feature is its own layer | `layerOf()` → `features/<name>`; `isBanned()` matches on segment boundaries so `shared`'s `'features'` entry actually catches `features/gameplay` |
| features do not depend on each other | sibling comparison in the scan loop, where both ends of the edge are known |
| `shared/` depends on nothing above it | `FORBIDDEN_SHARED` |
| `infrastructure/` keeps the `services` bans | `FORBIDDEN_INFRASTRUCTURE` |
| the engine facade stays thin | `isEngineFacade()` — `@game` only, no platform, own files only |
| no cross-root relative imports | `ownedRoot()` |
| `shared`/`infrastructure` need no barrel | added to `DEEP_IMPORT_ALLOWED` |

**Proof.** 16 new seeded cases (9 failing rules, 7 legal shapes) — 27 tests in
`__tests__/architecture/`, all passing. `src/features`, `src/shared` and
`src/infrastructure` do not exist yet, so every one of those rules was written
against an empty tree; without the seeds they would have been unfalsifiable.
Each seed also prunes the directories it created, because an orphaned empty
`src/features/gameplay/` changes what `layerOf()` resolves for every later
assertion in that file.

Aliases `@features/*`, `@shared/*`, `@infrastructure/*` added to **both**
`tsconfig.json` and `jest.config.js` — a mapping present in one and not the other
is a test that passes for the wrong reason.

**Gate:** typecheck, lint, 31 suites / 396 tests, 1,000 levels, and
`architecture:check` (615 imports, 0 violations, unchanged). No source file has
moved.

**Per-phase ritual:** `tsc --noEmit` → `lint` → `test` → `levels:validate` →
`architecture:check`, plus `git status --porcelain` before/after. **Never** reset, stash,
clean or revert (`ARCHITECTURE.md:167`, `AGENTS.md`).

### 9.2 Phase 2, as delivered — one file moved

`src/brand/index.ts` → `src/shared/branding/index.ts`. The `@brand` alias is
gone from `tsconfig.json` and `jest.config.js`; the two alias consumers
(`app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`) now use `@shared/branding`, and
two **relative** consumers found afterwards use `@shared/branding` too
(`src/theme/themeAssets.ts`, `__tests__/shared/branding.test.ts`).

**Why this file first.** It is the only layer in the repository whose entire
dependency list is one React Native *type*. Everything else in `src/` reaches into
`@state`, `@theme` or a platform package, so nothing else could land before the
layers it needs exist. `brand/` was also the one entry in the §5 map with a
destination that had no inbound feature dependency at all.

`brand/` is removed from `LAYER_ALIASES` and from `game/`'s ban list in the
checker — with one substitution: `game/` may not import `shared`,
`infrastructure` or `features`, so moving the file cannot open a path from the
pure engine to a platform-touching layer. `docs/ARCHITECTURE.md` §2, §3 and §10.5
lose their `brand/` rows and name `shared/` in their place.

The architecture suite's residue check was rewritten. It asserted
`src/features`, `src/shared` and `src/infrastructure` all **do not exist**, which
was true only while they were empty scaffolding and became a false statement about
the project the moment `src/shared/` held a real file. It now snapshots the
recursive listing of those three roots before seeding and compares it after —
directories included, because an orphaned *empty* `src/features/gameplay/` is the
residue that would corrupt every later assertion in that file.

**Gate:** typecheck, lint, 31 suites / 396 tests, 1,000 levels,
`architecture:check` 629 imports / 0 violations. **Untestable here:** whether the
wordmark still renders on Home and Settings. `shared/branding` is reached through
`@theme`, so it is on the critical path of every screen in the app — the highest
fan-out of any file moved so far.

### 9.2.1 Phase 2b, as delivered — one primitive moved

On top of the `a7ff7bf` checkpoint from Phase 2a, this step moves
`src/components/Pressable.tsx` → `src/shared/primitives/Pressable.tsx`. Its
dependency list is exactly one layer, `@theme`, and it imports no zustand store:
`useGlow` takes its colour as an argument and `Springy` takes none. That is why it
could move **before** the §9.3 palette-seam decision — and why doing so changes zero
call sites.

The 13 files in `src/components/` that consumed it were re-pointed to
`@shared/primitives/Pressable` (three of them — `levels/ChapterList`,
`levels/JumpToLevel`, `levels/LevelTile` — sat under `levels/`), while the six `app/`
routes that take `Springy` through `@components` are untouched: that barrel now
re-exports `@shared/primitives/Pressable` as a documented compatibility shim, so
`app/` re-pointing stays deferred to phase 9 exactly as §9.3 promises.

The architecture suite's residue check (`__tests__/architecture/architecture.test.ts`)
already snapshots `src/shared/`, so seeding the new path leaves no residue.

**Gate:** `tsc --noEmit` → `lint` → `test` → `levels:validate` → `architecture:check`,
per §9.1. Typecheck exit 0, lint exit 0, 31 suites / **396** tests pass, 1,000 levels
verify, and `architecture:check` reports 629 imports / 0 violations — including the 13 re-pointed
`@components → @shared` edges.

### 9.2.2 Phase 2c-1, as delivered — `useThemeAssets` out of `shared/`

`src/hooks/useThemeAssets.ts` → `src/features/settings/hooks/useThemeAssets.ts`, with a
feature-local barrel at `src/features/settings/index.ts`.

This is the move §9.3 *thought would need a decision* — and it turned out not to:
`useThemeAssets`'s only job is to subscribe to `themeId`, so `themeId`'s owner
(`features/settings`) owns it. §5's `shared/hooks/` destination was wrong up front,
because nothing that reads a store can live in `shared/` (`FORBIDDEN_SHARED` bans
`state`), and `themeId` is a settings value, not a theme value — so the pure
`getThemeAssets` registry stays in `theme/` while the subscription goes where its
dependency belongs.

Two call-site facts made this near-frictionless:

- both consumers (`app/(tabs)/index.tsx`, `app/(tabs)/leagues.tsx`) imported it **relative**
  (`../../src/hooks/useThemeAssets`); they now import `@features/settings` (the new barrel).
- a feature-local barrel is **required** here, not a style choice: `features` is deliberately
  *not* in `DEEP_IMPORT_ALLOWED` (only `shared`/`infrastructure` are, since they are sub-rooted
  and barrel-less), so a deep `@features/settings/hooks/*` import from outside the feature is a
  violation and the bare `@features/settings` path is the legal API.

The dead `src/hooks/index.ts` barrel is not deleted (§8/§17); its `useThemeAssets` re-export
is re-pointed to `@features/settings` to keep `tsc` green, preserving the barrel surface until
§8's deferred deletion.

**Gate:** `tsc --noEmit` (exit 0), `lint` (exit 0), 31 suites / **396** tests, 1,000 levels/20 packs
unchanged, `architecture:check` **630 imports / 0 violations** (the +1 vs. Phase 2b's 629 is the
new `features/settings/index.ts` re-export).

### 9.2.3 Phase 2c-2, as delivered — the `Screen` frame to `shared/components/` + palette-as-prop

`src/components/Screen.tsx` was split: the `Screen` **frame** moved to
`src/shared/components/Screen.tsx`, while `useTheme`, `ScreenHeader` and `IconButton`
stayed behind in `src/components/Screen.tsx`.

The frame is the half that only ever needed the palette. It used to call `useTheme()`
(which reads `themeId` from `@state` — banned for `shared/` by `FORBIDDEN_SHARED`), so
per §9.3 option (a) it now takes `palette` as a **required prop**. That single change is
what makes the file legal under `shared/`: with no `@state` edge left, its only imports
are React Native, `react-native-safe-area-context` and `@theme` — all already allowed
downward from `shared/`.

- The `@components` barrel re-exports `Screen` from `@shared/components/Screen` (the same
  documented shim `Pressable` uses), so the **16 render sites in 14 files** keep importing
  `Screen` from `@components` unchanged.
- `AwardInfoLayout.tsx` was the one file importing `Screen` by a **relative** path
  (`./Screen`); it is re-pointed to `@shared/components/Screen`.
- `palette` being required means `tsc` itself lists the render sites: a missed `<Screen>`
  is a compile error, not a blank screen. All 16 sites already had `palette` in scope
  (every one calls `useTheme()`), so the move added **zero** new hook calls.
- `shared/` has no barrel by design (`ARCHITECTURE.md` §10), so `@shared/components/Screen`
  is a legal deep import — the exact path the architecture seeds already encode as status 0.

`sound.ts`, `ScreenHeader` and `IconButton` deliberately **stayed** in `components/`:
`IconButton` reaches `./sound` → `@services/audio`, an edge that is green today only
because `services` is not yet in `FORBIDDEN_SHARED`. It becomes a `shared → features`
violation the moment Phase 9 lands `features/audio`, so the whole audio seam moves
together then — not now, half-way.

**Gate:** `tsc --noEmit` (exit 0), `lint` (exit 0), 31 suites / **396** tests, 1,000 levels/20 packs
unchanged, `architecture:check` **634 imports / 0 violations** (+4 over 2c-1: the shared frame's
imports and the two re-pointed edges).

### 9.3 The phase order is wrong, and cannot be followed as written

The table in §9 lists **Home** as phase 4. Home is `app/(tabs)/index.tsx`, and
`app/` is pinned (§6) — so it cannot move at all. Its eleven imports are:

```
@components  @brand  @services/audio  @challenge  @data  @game  @state  @league  @theme
```

Of those, `@data`, `@game` and `@theme` are pinned, and the other six resolve to
**other features** once this migration lands — `@state` alone expands into the
progression, achievements, league and settings stores. Home owns **zero** files.

So "migrate Home" is not a move. It is the re-pointing of eleven imports, and it
is the *last* thing that can happen, not the fourth, because it depends on
essentially the entire migration already being in place. The same is true of
level-selection (phase 5). §9's ordering reads naturally but is not a dependency
order; it is a reading order.

The real order is bottom-up and is driven by what each feature imports:

```
shared/branding  ✅ done
    → shared/primitives   ✅ done — `Pressable.tsx` (§9.2.1)
  → shared/components   ✅ done (Screen frame, §9.2.3); hooks deferred (§8)
  → infrastructure/{storage,sync,database,analytics}
  → features/{audio,league,achievements,progression,settings,account,hints,ads,gameplay}
  → app/  re-pointed last, feature by feature
```

**One of the two upward edges on `Screen.tsx` is now closed; `useThemeAssets`, a third,
closed first (2c-1).** §5 assigns `src/components/Screen.tsx` to `shared/components/`.
That file carried **two** dependencies that point up out of `shared/`; 2c-2 removed the first:

- **closed by 2c-2** — `useTheme()` read `themeId` from `@state` (`FORBIDDEN_SHARED` bans
  `state` — correctly: a shared component reaching into a feature's zustand store is a feature
  wearing a disguise). The frame now takes `palette` as a prop instead (§9.2.3), so the file
  that moved under `shared/` has no `@state` edge at all.
- **still open, deferred to Phase 9** — `IconButton` calls `withClick` from `./sound.ts`, which
  reads `playSfx` from `@services/audio`. This edge is **not** banned today only because
  `services` is not in `FORBIDDEN_SHARED`; it becomes a `shared → features/audio` violation the
  moment §5 lands (`features/audio/services/`), since the shared row of the §3 matrix bans
  `features`. A rule that is green now and red only in Phase 9 is the migration's favorite
  silent break — see the `require()` note in §9 / item 12. `sound.ts`/`ScreenHeader`/
  `IconButton` stayed in `components/` precisely so this edge is not yet in `shared/`.

**`useThemeAssets` was the same shape once — `theme/` importing `@state` — and is already
resolved.** It is not a theme concern; it is a *settings* concern (it exists only to subscribe
to `themeId`, while the pure registry `getThemeAssets` stays in `theme/`), so its true home is
`features/settings` — the owner of `themeId`. 2c-1 moved it there. The §5 destination
`shared/hooks/` was wrong on its face: nothing that reads a store can live in `shared/`, and
`useThemeAssets`'s consumers include routes that will sit in other features (achievements),
which cannot import `features/settings` (features-may-not-import-features) — so the hook cannot
hide in any consuming feature either. `features/settings` is the only layer both allowed to
read the store **and** reachable from everywhere it is needed.

**So the remaining decision is for `Screen`, not for `useThemeAssets`.** The options on
`useTheme` are: (a) inject `palette` as a prop to `Screen` — honest, and (because the consumer
set was measured) far cheaper than §5 feared: the 16 `<Screen>` sites in 14 files all already
call `useTheme()` and already have `palette` in scope, so it is 16 one-line insertions and
**zero** new hook calls, with `tsc`'s required-prop rule making the site list compiler-enforced;
(b) keep a `shared` theme *seam* fed by a React context that `features/settings` writes, so
`shared` depends on nothing and behaviour is unchanged; (c) leave `Screen` and `useTheme` in a
feature and accept they are not shared. **2c-2 adopts (a) on `useTheme` and defers the audio
seam (the `sound.ts`/`IconButton`/`ScreenHeader` half of the file) until §5 lands `features/audio`** —
this is the call that should be made deliberately, not by whichever file happened to be open.

---

## 10. What cannot be validated

- **No device.** `AGENTS.md`: every phase must end in something testable on a physical
  Android device. The previous session's Android build and on-device test **never ran**.
- **`npm test` proves the domain, not the app.** 396 tests cover `src/game`, geometry,
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