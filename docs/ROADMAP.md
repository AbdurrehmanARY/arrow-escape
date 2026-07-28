# ArrowPath — Development Roadmap

> Each phase produces a **working build** and ends at an **approval gate**. Nothing proceeds automatically. Testing is on a physical Android device over USB.

---

## Phase 0 — Foundation ✅
**Deliverables:** GDD, TDD, PROJECT_MEMORY, ROADMAP, locked decisions.
**Gate:** direction approved — code started.

---

## Phase 1 — Core domain + scaffold ✅ *(awaiting your device test)*
**Objective:** the rules engine and project skeleton, provable by tests before any UI exists.
**Files:** Expo scaffold; `src/game/{types,board,rules,solver,hints,ascii,diagnostics,index}.ts`; `__tests__/game/*`; `src/screens/EngineCheckScreen.tsx`; `src/theme/`.
**Deliverables:** pure, fully unit-tested game logic (80 tests, 92% statement coverage on `src/game`) + an app shell that runs the engine self-check on device.
**Unplanned outcome:** the core rule as written admits no decisions — see [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md). Both rule variants are implemented so the call can be made by playing.
**Testing checklist:** `npm run verify` green; app boots on device; self-check reports 8/8; both variants playable.
**Completion criteria:** rules engine passes tests; app launches on your phone; **rule variant chosen.**
**Gate.**

## Phase 2 — Playable board (one hardcoded level)
**Objective:** see and play the mechanic end-to-end, in the chosen variant.
**Files:** `Board.tsx`, `ArrowView.tsx`, `gameReducer.ts`, `GameScreen.tsx`; one embedded test level.
**Deliverables:** SVG arrows, tap to release, blocked shake, release animation, win detection, restart — smooth on device.
**Testing checklist:** taps resolve correctly; blocked feedback; win screen; 60fps.
**Gate.**

## Phase 3 — Level pipeline + first real levels
**Objective:** stand up the generator/validator and produce curated early levels as JSON.
**Files:** `tools/generate.ts`, `tools/validate.ts`, `tools/shapes/*`, `src/data/levels/*.json`, level-integrity test.
**Deliverables:** JSON-driven levels loading in-game; automated "every level solvable" test.
**Note:** the generator's rejection rate depends heavily on the Phase 1 rule decision.
**Gate.**

## Phase 4 — Game shell
**Objective:** the app around the game.
**Files:** Splash, Main Menu, Level Select, progress/settings stores, storage service, navigation.
**Deliverables:** continue/level-select flow; progress saved & restored; offline.
**Gate.**

## Phase 5 — Hints, deadlock, audio
**Objective:** helping systems + feel.
**Files:** `hintStore`, hint UI + on-device solver hookup, deadlock flow, `services/audio.ts`, SFX/BGM.
**Deliverables:** safe hints, deadlock recovery, music/SFX with settings toggles.
**Note:** deadlock UX is load-bearing under `slide-and-stop` and near-vestigial under `escape-only`.
**Gate.**

## Phase 6 — Ads (rewarded, hints only)
**Objective:** earn hints via rewarded ad with the offline policy.
**Files:** `services/ads.ts`, hint-earning flow, seed-hints + preload logic.
**Deliverables:** working rewarded flow (test IDs), graceful offline behaviour.
**Note:** first phase that needs a custom dev build — Expo Go cannot load the AdMob native module.
**Gate.**

## Phase 7 — Full 50-level set + curation
**Objective:** the complete v0.1 difficulty curve.
**Files:** `levels/001–050.json`, curation notes.
**Deliverables:** 50 curated, solvable, difficulty-graded levels playable start to finish.
**Gate.**

## Phase 8 — Polish, settings, accessibility
**Objective:** production feel.
**Files:** Settings screen, reduced-motion, transitions, theming, icon/splash.
**Deliverables:** polished UX; accessibility options; consistent theme.
**Gate.**

## Phase 9 — Release prep
**Objective:** Play Store readiness.
**Files:** EAS production config, real ad IDs, store assets, versioning.
**Deliverables:** signed AAB, listing assets, staged-rollout plan.
**Gate — v0.1 release.**

---

### After v0.1
Only once 50 levels are tested and approved do we begin additional level packs toward 600, and reconsider deferred features one at a time against the puzzle philosophy.
