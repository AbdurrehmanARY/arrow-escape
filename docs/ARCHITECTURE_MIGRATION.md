# ARCHITECTURE_MIGRATION.md — Phase 1 Inventory

> **Deliverable of Phase 1** of [implementation.md](../implementation.md).
> **Method:** measured, not assumed. Every number below came from an inventory command
> against the tree at `levels/extend-to-1000` @ `9263ca3`, working tree at 207 entries.
> **Rule for this document:** this phase moves no files. It only states where every
> significant file should go, and why — or states that it should stay.

---

## 1. Headline findings

Five of these contradict the target tree the reorganization was originally drafted
against. They are the reason the plan was corrected before any move.

### F1 — `src/game/` is pure, and provably so

Every import inside `src/game/` is relative to `./`. Zero imports of React, React
Native, Expo, Skia, Zustand or any `@` alias. The engine's purity guarantee — the one
the project's whole off-device tooling story rests on — **currently holds**.

```
1  ./ascii      4  ./board     1  ./hints
3  ./rules      2  ./solver    4  ./types
```

**Consequence:** Phase 4 has no purity repair to do. Its only job is to not break this.

### F2 — There is a real circular dependency: `services/sync.ts` <-> `state/progressStore.ts`

```
src/state/progressStore.ts:23   import { syncProgress } from '@services/sync';
src/services/sync.ts:38         import type { LevelRecord } from '@state/progressStore';
```

`sync.ts` reaches up into `state/` to borrow a type. The matrix in
[ARCHITECTURE.md](ARCHITECTURE.md) says `services/` must **not** import `state/`. This
is a genuine architecture violation, independent of any file move.

It is *type-only*, so `import type` is erased at compile time and it does not produce
a runtime cycle. That makes it safe to fix by **inverting the ownership**: move
`LevelRecord` to a type module both sides can import (it is a persistence record, so
`src/services/storage.ts` is the natural home), leaving no runtime edge at all.

**This is the single highest-value fix in the whole migration** and it was not in the
original 23-phase plan. It is added to Phase 3.

### F3 — `src/render/scene.ts` imports from `src/components/`

```
src/render/scene.ts:  import { buildArrowGeometry, cellCentre, type Point }
                         from '../components/arrowGeometry';
```

`render/` must not import `components/`. `arrowGeometry.ts` (209 lines) is **pure
geometry maths** — it is not a component, and it is already shared with the off-device
theme preview. It belongs beside the render maths, not in the UI layer.

**Consequence:** Phase 9 moves `arrowGeometry.ts` (and probably `camera.ts` +
`cameraPresets.ts`) into `src/render/` rather than into a `components/ui/` subgroup.
This removes a layer violation *and* a relative cross-directory import in one move.

### F4 — The barrels are bypassed, and two of them are wrong

| import form | count | verdict |
|---|---|---|
| `@game` (bare) | 27 | correct — this is the pattern that works |
| `@game/codec` (deep) | 13 | **forced** — see below |
| `@state/*` (deep) | 36 total, **0** bare | barrel exists and is entirely unused |
| `@services/*` (deep) | 35 total, **0** bare | barrel exists and is largely unused |
| `@components/*` (deep) | 4 | minor |
| `@theme/*` (deep) | 0 | correct |

`src/game/index.ts` exports `types, board, rules, solver, hints, ascii` — **not
`codec`, not `diagnostics`**. The 13 deep `@game/codec` imports are therefore *forced*,
not careless. Phase 3 must fix the barrel before the ban can mean anything.

`src/state/index.ts` exports **8 of 10** stores; `streakStore` and `energyStore` are
missing. `src/services/index.ts` exports only `storage`, `audio`, `ads`.

**Alias counts repo-wide** (`app/`, `src/`, `__tests__/`, `tools/`), for reference:
`@game` 41, `@theme` 37, `@state` 36, `@services` 35, `@components` 25, `@challenge` 16,
`@data` 12, `@expo` 10, `@shopify` 6, `@config` 5, `@league` 3, `@supabase` 3,
`@brand` 2, `@render` 1.

### F5 — `@screens/*` is dead in both configs

Declared in `tsconfig.json` **and** `jest.config.js`, pointing at `src/screens/*`.
That directory **does not exist** and the alias has **0 usages**. Note
`docs/ROADMAP.md:17` still lists `src/screens/EngineCheckScreen.tsx` as a Phase 1
deliverable — the docs describe a directory the tree no longer has. Delete the alias
from both files.

---

## 2. Scale of the tree

| area | count |
|---|---|
| `src/` domains | 12 |
| `app/` routes | 24 |
| `__tests__/` files | 31 (9 subdirs + `helpers.ts`) |
| `tools/` scripts | 28 (6 of them `_scratch-*`) |
| `docs/` files | 14 |
| audio assets | 31 (4 music + 27 sfx) |
| level packs | 20 JSON packs, 1,000 levels |

**`src/data/levels/` holds 20 JSON packs plus `index.ts`; `src/data/chapters.ts`.**
The level-data / game-logic separation is already correct, so Phase 5 is a
documentation task, not a move.

---

## 3. File-by-file migration map

`Phase` refers to the phase in [implementation.md](../implementation.md).
`Risk` is the risk of performing that move.

### 3.1 `src/game/` — pure engine (Phase 4)

| file | lines | responsibility | proposed | phase | risk |
|---|---|---|---|---|---|
| `solver.ts` | 477 | search / solvability proof | **stays** | 4 | — |
| `board.ts` | 320 | grid, rays, occupancy | **stays whole** — cohesive, do not split | 4 | med |
| `types.ts` | 280 | shared domain types | **stays** | 4 | — |
| `diagnostics.ts` | 272 | engine self-check | **stays**; add to barrel | 3 | low |
| `rules.ts` | 230 | tap resolution, hearts, status | **stays** | 4 | — |
| `codec.ts` | 217 | level encode/decode | **stays**; add to barrel | 3 | low |
| `ascii.ts` | 206 | debug / serialised board | **stays** | 4 | — |
| `hints.ts` | 62 | hint selection | **stays** | 4 | — |
| `index.ts` | 15 | public surface | **extend** with `codec` | 3 | low |

**Phase 4 verdict: no file needs to move.** The original plan proposed splitting
`board.ts` into geometry/raycast folders. Measurement says it is 320 cohesive lines
with no internal seam worth cutting, and splitting it for symmetry with a target
picture would be churn against the plan's own stated principle.

### 3.2 `src/render/` — Skia board (Phases 7, 8)

| file | lines | proposed | phase | risk |
|---|---|---|---|---|
| `SkiaBoard.tsx` | 366 | **stays** — the board renderer | 7 | — |
| `useBoardGestures.ts` | 304 | `render/gestures/` | 7 | med |
| `scene.ts` | 306 | **stays** | 7 | — |
| `skiaScene.ts` | 293 | **stays** | 7 | — |
| `components/ArrowNode.tsx` | 257 | `render/arrows/` | 7 | med |
| `useBoardCamera.ts` | 205 | `render/camera/` | 7 | med |
| `hitTest.ts` | 119 | **stays** | 7 | — |
| `components/PressOverlay.tsx` | 71 | `render/effects/` | 7 | med |
| `components/DepartingDotsNode.tsx` | 43 | `render/effects/` | 7 | med |
| `timings.ts` | 35 | **stays** | 7 | — |
| new `index.ts` | — | barrel | 7 | low |

**P-1 already did this split.** Phases 7–8 are optional renames plus a barrel, not
restructuring. The `scene.ts` -> `components/arrowGeometry` edge (F3) is the one real
defect here, and it is fixed in Phase 9.

### 3.3 `src/components/` — UI (Phases 9, 10)

| file | lines | responsibility | proposed | phase | risk |
|---|---|---|---|---|---|
| `arrowGeometry.ts` | 209 | pure geometry maths | **`src/render/`** — not UI (F3) | 9 | med |
| `camera.ts` | 126 | camera maths | **`src/render/`** | 9 | med |
| `cameraPresets.ts` | 107 | per-tier camera config | **`src/render/`** | 9 | med |
| `Overlays.tsx` | 340 | win/fail/stuck/confirm overlays | `components/game/overlays/` — **optional** | 10 | med |
| `Celebration.tsx` | 263 | win celebration | `components/game/` | 9 | low |
| `AwardInfoLayout.tsx` | 260 | award info card shell | `components/awards/` | 9 | low |
| `MonthlyTrophyModal.tsx` | 258 | trophy modal | `components/awards/` | 9 | low |
| `PauseMenu.tsx` | 252 | pause overlay | `components/game/overlays/` | 9 | low |
| `StreakRewardModal.tsx` | 236 | streak reward | `components/game/` | 9 | low |
| `Hud.tsx` | 215 | in-play HUD | `components/game/` | 9 | low |
| `Screen.tsx` | 174 | screen shell + safe area | `components/ui/` | 9 | low |
| `LeagueIntro.tsx` | 160 | league explainer | `components/leagues/` | 9 | low |
| `ChallengeBadges.tsx` | 145 | challenge badges | `components/awards/` | 9 | low |
| `DummyAdModal.tsx` | 144 | rewarded-ad placeholder | `components/game/` | 9 | low |
| `Pressable.tsx` | 93 | press wrapper + sound | `components/ui/` | 9 | low |
| `CoachCard.tsx` | 79 | first-run teaching | `components/game/` | 9 | low |
| `MonthlyTrophyBadge.tsx` | 73 | trophy badge | `components/awards/` | 9 | low |
| `sound.ts` | 65 | click / sheet sound hooks | `components/ui/` | 9 | low |
| `levels/` (4 files) | — | chapter/level browsing | **stays** — already split | 9 | — |
| `index.ts` | 33 | barrel | **update** | 9 | low |

**Phase 10 is explicitly optional.** `Overlays.tsx` at 340 lines is the largest
candidate, but its `Action` and `Sheet` helpers are module-private, not duplicated
elsewhere. If it is split, the justification is cohesion — not line count, and not
symmetry with the target tree.

### 3.4 `src/state/` — Zustand + reducer (Phase 13)

| file | lines | proposed | phase | risk |
|---|---|---|---|---|
| `progressStore.ts` | 194 | `state/progress/` — **also fix F2 cycle** | 3, 13 | **high** |
| `authStore.ts` | 143 | `state/session/` | 13 | med |
| `leagueStore.ts` | 138 | `state/progress/` or own | 13 | med |
| `gameReducer.ts` | 134 | `state/game/` | 13 | med |
| `settingsStore.ts` | 123 | `state/settings/` | 13 | low |
| `challengeStore.ts` | 112 | `state/progress/` | 13 | med |
| `energyStore.ts` | 100 | `state/game/` | 13 | low |
| `streakStore.ts` | 91 | `state/progress/` | 13 | low |
| `onboardingStore.ts` | 88 | `state/session/` | 13 | low |
| `hintStore.ts` | 80 | `state/game/` | 13 | low |
| `index.ts` | 13 | **add the 2 missing stores** | 3 | low |

**Phase 13 is optional.** 10 stores + 1 reducer at these sizes do not need four
sub-folders. The *defect* here is the incomplete barrel, and that is a Phase 3 job.

### 3.5 `src/services/` — I/O (Phase 14)

| file | lines | proposed | phase | risk |
|---|---|---|---|---|
| `audio.ts` | 426 | `services/audio/` | 14 | med |
| `auth.ts` | 349 | `services/auth/` | 14 | med |
| `ads.ts` | 344 | `services/ads/` | 14 | low |
| `sync.ts` | 285 | `services/sync/` — **fix F2 cycle** | 3, 14 | **high** |
| `audioAssets.ts` | 174 | `services/audio/` | 14 | med |
| `supabase.ts` | 161 | `services/auth/` | 14 | med |
| `haptics.ts` | 131 | **stays** (small) | 14 | — |
| `storage.ts` | 86 | **stays**; candidate home for `LevelRecord` | 3, 14 | med |
| `audioFades.ts` | 73 | `services/audio/` | 14 | med |
| `telemetry.ts` | 65 | **stays** (small) | 14 | — |
| `index.ts` | 14 | **complete it** | 3 | low |

**Do not invent `music.ts` / `sfx.ts` / `voice.ts`.** They do not exist. Audio is
already three cohesive files; the only structural change is a folder around them.

### 3.6 `src/hooks/` — orchestration (Phase 12)

| file | lines | responsibility | proposed | risk |
|---|---|---|---|---|
| `useHintFlow.ts` | 252 | hint availability + rewarded flow | `hooks/game/` | low |
| `useLeagueBoard.ts` | 169 | league board wiring | `hooks/game/` | low |
| `useArrowTap.ts` | 156 | tap -> release, sfx, haptics | `hooks/game/` | low |
| `useBoardViewport.ts` | 122 | board fit / zoom | `hooks/board/` | low |
| `useResponsive.ts` | 42 | screen size breakpoints | `hooks/ui/` | low |
| new `index.ts` | — | barrel | low | low |

All five are already single-responsibility. This phase is a folder move plus a barrel.

### 3.7 `src/theme/` — presentation contract (Phases 16, 18)

| file | lines | proposed | phase | risk |
|---|---|---|---|---|
| `themes.ts` | 406 | `theme/presets/<8 themes>.ts` | 16 | **high** |
| `types.ts` | 156 | `theme/types.ts` — **stays** | 16 | low |
| `index.ts` | 134 | barrel; **surface must not change** | 16 | med |
| `themeAssets.ts` | 111 | `theme/assets.ts` — resolve duplicate families | 16, 17 | med |

The highest-risk move in the plan. `themes.ts` carries all 8 theme definitions inline
and is read by every screen; a split that changes the `@theme` surface changes the app.
**Assets are not reorganized** — `assets/themes/` does not exist and Phase 17 will most
likely change zero bytes.

### 3.8 Real domains with no phase (keep as they are)

| domain | files | verdict |
|---|---|---|
| `src/challenge/` | `rewards` 276, `schedule` 165, `monthlyTrophies` 161, `stats` 118, `rewardArt` 88, `types` 73, `index` 11 | **keep** — absent from the original target tree entirely |
| `src/league/` | `league` 164, `index` 7 | **keep** — same |
| `src/brand/` | `index` 86 | **keep** — same |
| `src/config/` | `index` 72 | **keep** — Phase 19 creates nothing |
| `src/data/` | 20 packs + `index` + `chapters` | **keep** — separation already correct |

`src/challenge/rewardArt.ts` (88 lines) is exported and never imported — a Phase 23
finding to confirm, not a move to make now.

### 3.9 `app/` — routes (no moves)

24 routes, all in place. `play/[id].tsx` (479 lines) is the only file large enough to
warrant attention, and it is **Phase 11** — a responsibility audit, not a move.
Nothing in `app/` is relocated; `src/screens/` never existed, contrary to the draft.

### 3.10 `tools/` (Phase 6)

| group | files | proposed | risk |
|---|---|---|---|
| generation | `shapeArt` 1356, `curriculum` 1158, `generate` 702, `shapeGlyphs` 617, `shapeProcedural` 365, `shapes` 355, `build-levels` 336 | `tools/generation/` | low |
| validation | `bench` 148, `validate` 131, `check-curriculum` 121, `probe-density` 104, `probe-tiers` 64 | `tools/validation/` | **med** — all are `package.json` scripts |
| assets | `make-brand-assets` 358, `preview-themes` 343, `make-sounds` 329, `make-icons` 290, `clean-image-backgrounds` 222, `make-app-images` 82, `sync-user-assets` 80, `inspect-shapes` 34 | `tools/assets/` | med — same reason |
| one-off fixes | `fix-png-headers` 38, `fix-all-jpg-extensions` 20, `fix-jpg-extensions` 12 | **quarantine or delete** | low |
| scratch | `_scratch-*` x6 (214 lines total) | **delete or quarantine** | low |

Every move here breaks a `package.json` script path unless all script entries are
updated in the same phase. `npm run verify` calls `levels:validate` ->
`tools/validate.ts`, so that one is load-bearing for the gate.

---

## 4. Phase-by-phase readiness

| phase | status after Phase 1 |
|---|---|
| 1 inventory | **done — this document** |
| 2 architecture rules | **done — [ARCHITECTURE.md](ARCHITECTURE.md)** |
| 3 import boundaries | **5 concrete defects**: `codec` not in barrel, 2 stores missing from barrel, `services` barrel incomplete, dead `@screens/*` alias, **F2 cycle** |
| 4 `game/` | **no move required** — see 3.1 |
| 5 level data | **no move required** — separation already correct |
| 6 `tools/` | ready; blocked on script-path updates |
| 7–8 `render/` | optional renames + barrel; F3 dependency noted |
| 9 components | ready; 3 maths files relocate to `render/` |
| 10 `Overlays` | **optional** |
| 11 play screen | audit only |
| 12 hooks | ready, low risk |
| 13 state | **optional**; the real defect is Phase 3 |
| 14 services | ready; F2 fix lands here |
| 15 audio assets | classification pending; duplication claims need hash verification |
| 16 theme | **highest risk in the plan** |
| 17 theme assets | likely zero-byte |
| 18 theme contract | ready |
| 19 config/utils | creates nothing |
| 20 tests | already mirror `src/`; add `architecture/` |
| 21 enforcement | ready — rules now written in ARCHITECTURE.md §3 |
| 22–23 verify + audit | last |

## 5. Changes this inventory made to the plan

1. **Added to Phase 3:** fix the F2 circular dependency (`sync.ts` <->
   `progressStore.ts`). It is a live architecture violation, type-only, and the fix is
   to relocate `LevelRecord` out of `state/`.
2. **Revised Phase 9:** `arrowGeometry`, `camera`, `cameraPresets` move **into
   `render/`**, not into a `components/ui/` subgroup.
3. **Confirmed Phases 4 and 5 as no-ops** rather than restructures.
4. **Demoted Phase 13** from "restructure" to "optional; fix the barrel."
5. **Demoted Phase 10** to optional.
6. **Noted `docs/ROADMAP.md:17` is stale** — it references `src/screens/`, which is gone.
7. **Added the `_scratch-*` and `fix-*` tool quarantine** to Phase 6.

## 6. Phase 1 and 2 validation

No source file was modified by either phase. Both deliverables are new documentation.

| command | result |
|---|---|
| `npx tsc --noEmit` | **PASS**, exit 0, no output |
| `npx eslint . --max-warnings=0` | **PASS**, exit 0 |
| `npx jest` | **PASS**, exit 0 — 30 suites, 369 tests, 0 snapshots |
| `npx tsx tools/validate.ts` | **PASS**, exit 0 — 928 boards need pan and zoom, largest 2700 cells, 125866 arrows |
| Android build | **not run** |
| On-device testing | **not run** — no device available, and neither phase changes behaviour |

**Next:** Phase 3. It is the first phase that edits source, and it now has five
specific, individually verifiable defects to fix.
