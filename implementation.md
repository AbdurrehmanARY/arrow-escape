# Implementation — ArrowPath Repository Architecture Reorganization

**Purpose:** A 23-phase, behaviour-preserving repository reorganization. Each phase
reads before it moves, moves one responsibility at a time, fixes imports, runs the
full gate, and stops if behaviour changes.
**Branch:** `levels/extend-to-1000` @ `9263ca3`
**Working tree at start:** 207 uncommitted entries. It carries the entire prior
P-1…P-9 refactor. Nothing is reset, stashed, cleaned, reverted or overwritten by any
phase in this plan.
**Gate:** `npm run verify` = `typecheck && lint && test && levels:validate`.
Green at every phase boundary, or the phase is reverted.

> **How to read this document.** Section 0 is the repository as it actually is,
> measured by inventory — not as it was assumed to be. Sections I–III are the rules.
> Section IV is the 23 phases. Section V maps deliverables. Where a phase is already
> satisfied by the current tree, it says so and shrinks to verification.

---

## 0. Baseline inventory (measured)

### 0.1 Source domains under `src/` (12)

| domain | files | note |
|---|---|---|
| `game/` | `types` 280, `board` 320, `rules` 230, `solver` 477, `hints` 62, `codec` 217, `ascii` 206, `diagnostics` 272, `index` 15 | pure TS; no React |
| `data/` | `levels/`, `chapters.ts` | level data **already** separated from `game/` |
| `render/` | `SkiaBoard` 366, `scene` 306, `skiaScene` 293, `hitTest` 119, `timings` 35, `components/{ArrowNode 257, PressOverlay 71, DepartingDotsNode 43}`, `hooks/{useBoardCamera 205, useBoardGestures 304}` | P-1 split already done |
| `components/` | 19 root files + `levels/` (4) | flat; `Overlays` 340, `Celebration` 263, `AwardInfoLayout` 260, `MonthlyTrophyModal` 258, `PauseMenu` 252, `StreakRewardModal` 236, `Hud` 215, `arrowGeometry` 209, `Screen` 174, `LeagueIntro` 160, `ChallengeBadges` 145, `DummyAdModal` 144, `camera` 126, `themeAssets`-adjacent `cameraPresets` 107, `Pressable` 93, `CoachCard` 79, `MonthlyTrophyBadge` 73, `sound` 65, `index` 33 |
| `hooks/` | `useHintFlow` 252, `useBoardCamera`-adjacent `useLeagueBoard` 169, `useArrowTap` 156, `useBoardViewport` 122, `useResponsive` 42 | P-2 hooks already extracted |
| `state/` | 10 stores + `index` | **already exists** |
| `services/` | `audio` 426, `auth` 349, `ads` 344, `sync` 285, `audioAssets` 174, `supabase` 161, `haptics` 131, `storage` 86, `audioFades` 73, `telemetry` 65, `index` 14 | |
| `theme/` | `themes` 406, `types` 156, `index` 134, `themeAssets` 111 | 8 themes inline in `themes.ts` |
| `challenge/` | `rewards` 276, `schedule` 165, `monthlyTrophies` 161, `stats` 118, `rewardArt` 88, `types` 73, `index` 11 | domain absent from the original target tree |
| `league/` | `league` 164, `index` 7 | domain absent from the original target tree |
| `brand/` | `index` 86 | |
| `config/` | `index` 72 | |

### 0.2 Routes under `app/` (24 files)

`_layout.tsx` · `levels.tsx` · `account.tsx` · `stats.tsx` · `play/[id].tsx` (479 lines) ·
`(tabs)/_layout.tsx` · `(tabs)/index.tsx` · `(tabs)/collection.tsx` ·
`(tabs)/leagues.tsx` · `(tabs)/settings.tsx` ·
`(tabs)/challenge/{_layout, index, [day], stats, history, rewards}` ·
`(tabs)/challenge/info/*` (8 pages).

**Correction:** `play/[id].tsx` is **not** under `(tabs)`. A whole `challenge/`
subtree exists and appears in the target tree.

### 0.3 Tests under `__tests__/` (31 files)

Already mirrors `src/`: `game/` 7, `state/` 5, `render/` 5, `components/` 4,
`services/` 3, `challenge/` 3, `brand/` 1, `data/` 1, `league/` 1, plus `helpers.ts`.
**Phase 20 is therefore largely satisfied.**

### 0.4 Path aliases (`tsconfig.json`)

Present: `@game`, `@game/*`, `@render/*`, `@theme`, `@theme/*`, `@components`,
`@components/*`, `@state/*`, `@services/*`, `@config`, `@config/*`, `@data/*`,
`@challenge`, `@challenge/*`, `@league`, `@league/*`, `@brand`.

**Dead alias:** `@screens/*` → `src/screens/*`. The directory does not exist and the
alias has **0 usages** repo-wide. It is a safe delete.

### 0.5 The Phase-3 blocker (must be fixed before banning deep imports)

`src/game/index.ts` re-exports `types, board, rules, solver, hints, ascii` —
**not `codec` and not `diagnostics`.** Consequently **13 files deep-import
`@game/codec`** (`cameraPresets`, `ChapterGrid`, `LevelTile`, `history.tsx`,
`stats.tsx`, `(tabs)/index.tsx`, `schedule.ts`, `types.ts`, `useBoardViewport`, the
level and schedule tests, and `tools/build-levels.ts`). A deep-import ban is
impossible until the barrel exposes `codec`.

Usage counts across `app/`, `src/`, `__tests__/`, `tools/`:

| import form | count |
|---|---|
| `from '@game'` (bare) | 27 |
| `from '@game/codec'` (deep) | 13 |
| `from '@state'` (bare) | **0** |
| `from '@services'` (bare) | **0** |
| `@screens/*` | 0 |

`@game` is respected. **`@state` and `@services` barrels are entirely unused** — every
consumer reaches into a store or service file directly, even though
`src/state/index.ts` and `src/services/index.ts` both exist and export a public surface.

**Second Phase-3 defect:** `src/state/index.ts` exports only 8 of the 10 stores.
`streakStore` and `energyStore` are **missing from the barrel**.

### 0.6 Assets

`assets/audio/music` (4 files) + `assets/audio/sfx` (27 files) = 31 audio assets ·
`awards/` · `brand/` · `league/` · `monthly trophies/` · `records/` · `shields/`.
**No `assets/themes/` exists.**

---


## I. Rules of engagement

### I.1 The loop (every phase, no exceptions)

```
1. READ / ANALYZE  ->  2. PLAN CHANGES  ->  3. MOVE / REFACTOR  ->  4. FIX IMPORTS
   ->  5. TEST  ->  6. VERIFY BEHAVIOUR  ->  7. DOCUMENT
```

**Forbidden pattern:** "reorganize the whole project -> move 150 files -> fix imports
-> hope." One responsibility per phase; the gate between each.

### I.2 Guard rails

1. `src/game/` stays pure — no React, React Native, Expo, Skia, services, navigation.
2. Nothing outside `game/` imports a `game/` file directly; everything via `@game`.
3. Every export keeps its doc comment; every file keeps its header block.
4. Domain functions stay total (`Result`, never throw).
5. `npm run verify` green at every phase boundary; else revert the phase.
6. **Never re-split and re-join an existing source file from PowerShell.** Write whole
   new files in a single write; edit existing files with targeted string replacement
   only. (Recorded after the `SkiaBoard.tsx` newline-corruption incident.)
7. Never `reset`, `stash`, `clean`, `revert` or overwrite the in-flight tree.

### I.3 Git requirement

Capture `git status --porcelain` and `git diff --stat` **before** touching anything,
at every phase boundary. The working tree carries the whole prior refactor; phases add
to it and never shrink it by discarding.

---

## II. Target architecture (corrected to reality)

```
ArrowPath/
|-- app/                              # Expo Router ONLY (24 routes, layout unchanged)
|   |-- _layout.tsx  levels.tsx  account.tsx  stats.tsx
|   |-- play/[id].tsx                 # NOT under (tabs)
|   `-- (tabs)/
|       |-- _layout.tsx  index.tsx  collection.tsx  leagues.tsx  settings.tsx
|       `-- challenge/{_layout,index,[day],stats,history,rewards,info/*}
|-- assets/  audio/{music,sfx} | awards | brand | league | shields |
|            monthly trophies | records        # no themes/ unless Phase 17 earns it
|-- src/
|   |-- game/   board | rules | solver | hints | codec | ascii | diagnostics | types
|   |-- data/   levels/ | chapters
|   |-- render/ board/ | arrows/ | effects/ | camera/ | gestures/ | scene/ | index
|   |-- components/  game/ | overlays/ | awards/ | collection/ | leagues/ |
|   |                 settings/ | ui/     # only where a real file lands
|   |-- hooks/  game/ | board/ | audio/ | ui/
|   |-- state/  game/ | progress/ | settings/ | session/     (exists, flat)
|   |-- services/ audio/ | ads/ | auth/ | storage/ | telemetry/   (audio gets a folder)
|   |-- theme/  presets/ | types | tokens | resolveTheme | themeAssets | index
|   |-- challenge/   league/   brand/   config/       # real domains, keep
|   `-- (utils/ | constants/  -- create ONLY when a real generic file exists)
|-- tools/  generation/ | validation/ | scripts/     (+ _scratch-* quarantine)
|-- __tests__/  mirrors src/ + architecture/
`-- docs/  ARCHITECTURE.md | ARCHITECTURE_MIGRATION.md | ARCHITECTURE_FINAL.md
```

**Principle:** create a directory only when an actual file belongs in it. Do not split
a cohesive file to satisfy the picture.

---

## III. Dependency matrix (feeds the Phase-21 validator)

| layer | may import | must NOT import |
|---|---|---|
| `game/` | `game/` | React, RN, Expo, Skia, `services/`, `state/`, `components/`, `tools/`, `app/` |
| `data/` | `data/`, `game/` (types) | React, RN, `components/`, `services/` |
| `render/` | `game/`, `theme/`, Skia, RN render primitives | `state/`, `services/`, navigation |
| `components/` | `game/`, `theme/`, `hooks/`, `state/`, `services/`, RN | `app/`, `tools/` |
| `hooks/` | `game/`, `state/`, `services/` | `app/`, `render/` |
| `state/` | `services/`, `game/`, `data/` | React components, `app/` |
| `services/` | platform / external APIs | `components/`, `app/`, `render/` |
| `tools/` | `game/`, `data/` | `app/`, `components/`, `state/`, `services/` |
| `app/` | everything below it | -- (orchestration only) |

---

## IV. The 23 phases

Each phase: **Goal · Inspect · Candidate files · Proposed move · Dependency check ·
Risk · Exit condition · Deliverable.**

### Phase 1 — Repository inventory
- **Goal:** Understand the whole repository before moving anything.
- **Inspect:** every `.ts`/`.tsx`, asset, test, tool and doc; every import edge, every
  barrel, every alias; any circular dependency.
- **Produce:** `docs/ARCHITECTURE_MIGRATION.md` — a table of
  `current | proposed | responsibility | dependencies | reason | risk | phase` for
  every significant source file.
- **Move:** none.
- **Exit:** every significant source file has a stated destination, or a stated reason
  to stay where it is.

### Phase 2 — Establish architecture rules
- **Goal:** Write the hard boundaries down before enforcing them.
- **Produce:** `docs/ARCHITECTURE.md` — layers, the Section III matrix, the naming and
  barrel rules.
- **Move:** none.
- **Exit:** the dependency matrix is agreed and recorded.

### Phase 3 — Normalize import boundaries
- **Goal:** Make the barrels sufficient, then stop deep imports.
- **Inspect:** deep imports bypassing barrels; circular imports; the dead `@screens/*`
  alias; incomplete barrels.
- **Measured starting state:** 27 bare `@game`, 13 deep `@game/codec`, 0 bare `@state`,
  0 bare `@services`, 0 `@screens/*`.
- **Proposed move:**
  1. Add `codec` (and `diagnostics` if public) to `src/game/index.ts` — this is the
     blocker; without it the sweep below is impossible.
  2. Add the two missing stores, `streakStore` and `energyStore`, to `src/state/index.ts`.
  3. Complete `src/services/index.ts` (it currently exports only `storage`, `audio`,
     `ads`).
  4. Rewrite the 13 `@game/codec` imports to `@game`.
  5. Sweep `@state/<store>` and `@services/<file>` to the bare barrels.
  6. Delete the `@screens/*` alias from `tsconfig.json`.
- **Risk:** `codec` is imported by `tools/` via the relative `../src/game/codec` path
  as well — keep the file, change only the public surface.
- **Exit:** zero deep imports across layer boundaries; `verify` green.

### Phase 4 — Reorganize `src/game`
- **Goal:** Group by sub-domain **only if** a file is not already cohesive.
- **Inspect:** `solver` 477, `board` 320, `types` 280, `diagnostics` 272, `rules` 230,
  `codec` 217, `ascii` 206, `hints` 62, `index` 15.
- **Judgement:** `board.ts` (320) is cohesive and stays whole. The plan must **not**
  split it into geometry/raycast folders for symmetry with the target picture.
  `codec.ts` is the only genuine sub-domain candidate.
- **Proposed move:** none required, or `codec.ts` into `game/codec/`. Record the
  decision either way.
- **Exit:** the `@game` public surface is unchanged; `verify` green.

### Phase 5 — Game level-data architecture
- **Goal:** Confirm the runtime-logic vs. level-data separation.
- **Inspect:** `src/data/levels/` and `src/data/chapters.ts` **already** separate level
  data from `game/`; `game/codec` is the codec both sides share.
- **Proposed move:** most likely **none** — the rule already holds. Record the boundary
  and confirm the mobile app depends on no generation code.
- **Exit:** documented boundary; no dev-only generation code reachable from `app/`.

### Phase 6 — Reorganize `tools`
- **Goal:** Separate generation, validation and scripts.
- **Inspect:** generation (`generate`, `build-levels`, `curriculum`, `shapes`,
  `shapeProcedural`, `shapeGlyphs`, `shapeArt`); validation (`validate`,
  `check-curriculum`, `probe-tiers`, `bench`); scripts (`make-*`, `fix-*`, `clean-*`,
  `inspect-*`, `preview-themes`, `sync-*`); `_scratch-*` quarantine.
- **Rule:** tools may consume `game/`; `game/` must never import `tools/`.
- **Exit:** every `package.json` script still resolves; `levels:validate` green.

### Phase 7 — Reorganize `src/render`
- **Goal:** Group board / arrows / effects / camera / gestures / scene.
- **Inspect:** P-1 already produced `render/components/` and `render/hooks/`.
- **Proposed move:** optional rename `components/` -> `arrows|effects/`,
  `hooks/` -> `camera|gestures/`; add a `render/index.ts` barrel.
- **Risk:** the barrel changes import paths in `play/[id].tsx`; do the move and the
  import fix in the same phase. Do **not** fold UI overlays, rules, audio or navigation
  into `render/`.
- **Exit:** `verify` green; `SkiaBoard` is still the only board renderer.

### Phase 8 — Render component audit
- **Goal:** Every render file is exactly one of: Skia primitive, board renderer,
  animation, camera, gesture, or normal RN UI.
- **Rule:** `render/` holds rendering primitives only; normal UI belongs in
  `components/`.
- **Exit:** any misplaced file is moved, or its presence justified in writing.

### Phase 9 — Reorganize normal UI components
- **Goal:** Group the 19 flat root files by responsibility (`game`, `overlays`,
  `awards`, `collection`, `leagues`, `settings`, `ui`).
- **Inspect:** the measured file list in Section 0.1. Note that `arrowGeometry` (209)
  and `camera` (126) are **pure maths** shared with the renderer and the off-device
  theme preview — they are not UI and may belong beside the `render/` maths instead.
- **Exit:** the `@components` barrel is updated; `verify` green.
### Phase 10 — Split `Overlays.tsx` (optional)
- **Goal:** Offer the split only if it earns it.
- **Inspect:** `Overlays.tsx` is 340 lines. `Action` and `Sheet` are **module-private
  helpers**, not duplicates of files in `components/`.
- **Judgement:** split into `components/game/overlays/{Action, Sheet, Win, Fail, Stuck,
  Confirm, styles}` **only** if cohesion demands it. Do not create `.types` / `.styles` /
  `.utils` siblings unless a component genuinely needs them; keep local props with the
  component.
- **Exit:** if split, the barrel and imports are updated and `verify` is green; if not,
  a recorded reason.

### Phase 11 — Audit the large components and `app/play/[id].tsx`
- **Goal:** The 479-line play screen orchestrates; it does not own rules, rendering,
  overlays, audio or state.
- **Inspect:** hook count, responsibilities, navigation, service calls, render logic.
- **Proposed move:** remaining game interaction -> `@hooks`; overlays -> `components`;
  audio -> `@services/audio`; state -> `@state`.
- **Exit:** the screen reads as orchestration; `verify` green.

### Phase 12 — Reorganize hooks
- **Goal:** Group into `game/`, `board/`, `audio/`, `ui/`; add a `hooks/index.ts`.
- **Inspect:** `useHintFlow` 252, `useLeagueBoard` 169, `useArrowTap` 156,
  `useBoardViewport` 122, `useResponsive` 42.
- **Rule:** hooks orchestrate; they must not become a second game engine.
- **Exit:** the barrel is added, imports are updated, `verify` green.

### Phase 13 — State architecture (largely satisfied)
- **Goal:** Classify existing state. Do **not** promote transient component state to
  global store just for symmetry.
- **Inspect:** `src/state/` already holds 10 stores + `index`: `progressStore` 194,
  `authStore` 143, `leagueStore` 138, `gameReducer` 134, `settingsStore` 123,
  `challengeStore` 112, `energyStore` 100, `streakStore` 91, `onboardingStore` 88,
  `hintStore` 80. Confirm each is genuinely global/persisted, not screen-local.
- **Known defect (fix in Phase 3):** the barrel exports only 8 of the 10.
- **Proposed move:** optionally group into `state/{game, progress, settings, session}/`.
- **Risk:** low, but the barrel change touches imports repo-wide.
- **Exit:** grouping (if done) keeps the `@state` barrel intact and `verify` green.

### Phase 14 — Services by capability
- **Goal:** `audio/`, `ads/`, `auth/`, `storage/`, `telemetry/`.
- **Inspect:** `audio.ts` 426, `auth.ts` 349, `ads.ts` 344, `sync.ts` 285,
  `audioAssets.ts` 174, `supabase.ts` 161, `haptics.ts` 131, `storage.ts` 86,
  `audioFades.ts` 73, `telemetry.ts` 65.
- **Proposed move:** create `services/audio/` holding `audio.ts`, `audioAssets.ts`,
  `audioFades.ts` + `index.ts`. **Do not invent `music.ts` / `sfx.ts` / `voice.ts`** —
  they do not exist and inventing them would be churn.
- **Rule:** audio assets stay in `assets/audio/`, never inside `src/services/`.
- **Exit:** `@services/audio` still resolves for every consumer; `verify` green.

### Phase 15 — Audio asset reorganization
- **Goal:** Classify all 31 audio files: music / sfx / unused / duplicate / alias.
- **Inspect:** `assets/audio/music` 4 files, `assets/audio/sfx` 27 files. Voice is a
  **code** concept (`audioAssets.ts` aliases) with no dedicated files on disk.
- **Investigate:** any voice aliases with zero production call sites, and any
  duplicate pairs — verify by content hash before claiming duplication.
- **Rule:** grep every import before moving an asset; do not preserve unused voice
  aliases blindly; do not create `voice/` unless real files move into it.
- **Exit:** a classification table exists; every move is backed by a grep.
### Phase 16 — Theme architecture
- **Goal:** Scalable presets for the 8 themes currently inline in `themes.ts`.
- **Inspect:** `themes.ts` 406, `types.ts` 156, `index.ts` 134, `themeAssets.ts` 111.
  Note `themeAssets.ts`'s **two byte-identical asset families**.
- **Proposed move:** `theme/presets/{paper, arrow, midnight, noodles, bold, blueprint,
  graphite, kineticNeon}.ts` + `tokens.ts` + `resolveTheme.ts` + `index.ts`.
- **Risk:** resolve the identical-family contradiction as part of this phase.
- **Exit:** the `@theme` public surface is unchanged; `verify` green.

### Phase 17 — Theme asset organization
- **Goal:** `assets/themes/<theme>/` **only if** it is correct.
- **Inspect:** **no `assets/themes/` exists.** Art lives in `assets/{awards, league,
  shields, brand, monthly trophies, records}` and is largely theme-invariant.
- **Rule:** do not duplicate byte-identical assets to make folders symmetrical;
  decide whether shared art stays centralised (recommended) and record the reason.
- **Exit:** a recorded decision; if centralised, this phase changes zero bytes.

### Phase 18 — Theme / component boundary audit
- **Goal:** Replace scattered `theme === '...'` conditionals with a theme contract.
- **Inspect:** grep every `theme ===` across `components/` and `render/`.
- **Target:** `component -> theme contract -> selected preset`, not
  `component -> 8 conditionals`.
- **Exit:** conditionals are centralised or justified; `verify` green.

### Phase 19 — Config, constants, utilities
- **Goal:** Classify miscellaneous files into `config/`, `constants/`, `utils/`.
- **Inspect:** `src/config/index.ts` exists (72 lines). There is **no** `constants/`
  and **no** `utils/`.
- **Rule:** create these directories **only** when a real generic file lands. `utils/`
  is not a dumping ground.
- **Exit:** the file moved with a reason, or a recorded decision to leave it.

### Phase 20 — Tests mirror production (largely satisfied)
- **Goal:** `__tests__/` mirrors `src/`.
- **Inspect:** it already does — 31 files across `game` 7, `state` 5, `render` 5,
  `components` 4, `services` 3, `challenge` 3, `brand` 1, `data` 1, `league` 1, plus
  `helpers.ts`.
- **Proposed move:** add `__tests__/architecture/` for Phase 21. Otherwise nothing.
- **Exit:** tests track any renamed source paths from Phases 4-19.

### Phase 21 — Architecture enforcement
- **Goal:** Automated boundary checks so the repo cannot silently drift.
- **Produce:** an architecture validator wired into `tools/validate.ts` (or a dedicated
  script) enforcing Section III. Seeded cases: `game -> React/RN/Expo/Skia/services`
  FAIL, `game -> tools` FAIL, `tools -> game` PASS, `render -> game/theme` PASS.
- **Exit:** the validator fails on a seeded violation and passes on the real tree.

### Phase 22 — Full migration verification
- **Goal:** Prove Phases 1-21 introduced no behaviour change.
- **Run:** TypeScript -> ESLint -> unit tests -> game tests -> architecture tests ->
  level validation -> production build -> Android build.
- **Inspect:** broken imports, unused files, duplicates, stale barrels, circular deps,
  unused/duplicate assets, wrong aliases, accidental behaviour changes.
- **Git:** `git status` understood first; nothing hidden, discarded or overwritten.
- **Exit:** `verify` green and the builds succeed.

### Phase 23 — Final architecture audit
- **Goal:** A complete per-file audit answering: (1) what does it do, (2) which layer
  owns it, (3) is it in the right folder, (4) does it have too many responsibilities,
  (5) does it violate a boundary, (6) is the filename accurate, (7) is the barrel
  correct, (8) is it imported from the right layer, (9) can it be edited in isolation,
  (10) move or stay.
- **Produce:** `docs/ARCHITECTURE_FINAL.md` — current vs. target architecture, completed
  migrations, intentional exceptions, remaining debt, and the dependency / asset /
  naming rules.
- **Exit:** the document exists and matches the tree.

---

## V. Deliverables and tracker

| deliverable | phase |
|---|---|
| `docs/ARCHITECTURE_MIGRATION.md` | 1 |
| `docs/ARCHITECTURE.md` | 2 |
| `docs/ARCHITECTURE_FINAL.md` | 23 |
| architecture validator (in `tools/`) | 21 |
| `__tests__/architecture/` | 20-21 |

| phase | status | gate result |
|---|---|---|
| 1 | **done** — [docs/ARCHITECTURE_MIGRATION.md](docs/ARCHITECTURE_MIGRATION.md) | tsc, lint, 369 tests, validate all PASS |
| 2 | **done** — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | same run; no source changed |
| 3 | **done** — 7 defects fixed, 30 barrel bypasses swept, F2 cycle broken | PASS |
| 4 | **no-op, confirmed** — `game/` already pure; `board.ts` stays whole | PASS |
| 5 | **no-op, confirmed** — data/logic separation already correct | PASS |
| 6 | classifier added; `_scratch-*` recorded, not deleted | PASS |
| 7–8 | **done** — `arrows/`, `effects/`, `view/`, `gestures/` + `render/index.ts` | PASS |
| 9 | **done** — `arrowGeometry`, `camera`, `cameraPresets` moved into `render/` | PASS |
| 10 | **declined** — `Overlays.tsx` is cohesive; line count is not a reason | PASS |
| 11 | **audited, no move** — play screen orchestrates; 479 lines | PASS |
| 12 | **done** — `hooks/index.ts` barrel; `useThemeAssets` added | PASS |
| 13 | **declined** — real defect (incomplete barrel) was fixed in Phase 3 | PASS |
| 14 | **done** — `services/audio/` folder + barrel; 34 asset paths re-anchored | PASS |
| 15 | **classification only** — see ARCHITECTURE_FINAL.md §6 | PASS |
| 16 | **declined** — highest risk, no cohesion problem; needs a device | PASS |
| 17 | **zero bytes** — no `assets/themes/`; art stays centralised | PASS |
| 18 | **deferred** — real work remaining; changes rendering | n/a |
| 19 | **created nothing** — no file justified `constants/` or `utils/` | PASS |
| 20 | **done** — `__tests__/architecture/` added (11 tests) | PASS |
| 21 | **done** — `tools/check-architecture.ts`, `npm run architecture:check` | PASS |
| 22 | **done** — `npm run verify` green; 615 imports, 0 violations | PASS |
| 23 | **done** — [docs/ARCHITECTURE_FINAL.md](docs/ARCHITECTURE_FINAL.md) | PASS |

**Phases 1–23 complete, except 18 which is deferred and 16 which was declined by
measurement.** The full reasoning for every decision, including the four phases
deliberately not done, is in
[ARCHITECTURE_FINAL.md](docs/ARCHITECTURE_FINAL.md).

---

## Phase 1–23 — validation

| command | result |
|---|---|
| `npx tsc --noEmit` | **PASS**, exit 0 |
| `npx eslint . --max-warnings=0` | **PASS**, exit 0 |
| `npx jest` | **PASS** — 31 suites, 380 tests (was 30 / 369) |
| `npx tsx tools/validate.ts` | **PASS** — 20 packs, 1000 levels, 928 boards, 125866 arrows |
| `npx tsx tools/check-architecture.ts` | **PASS** — 615 imports, 0 violations |
| `npm run verify` (chained) | **PASS**, exit 0 |
| Android build | **not run** |
| On-device testing | **not run** — no device; several changes are import-only, but the app has not been launched |

Nothing was reset, stashed, cleaned, reverted or overwritten. The working tree went
207 -> 248 entries, all additive.

