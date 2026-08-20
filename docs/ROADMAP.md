x# ArrowPath — Development Roadmap

> Each phase produces a **working build** and ends at an **approval gate**. Nothing proceeds automatically. Testing is on a physical Android device over USB.

---

## Phase 0 — Foundation ✅

**Deliverables:** GDD, TDD, PROJECT_MEMORY, ROADMAP, locked decisions.
**Gate:** direction approved — code started.

---

## Phase 1 — Core domain + scaffold ✅ _(awaiting your device test)_

**Objective:** the rules engine and project skeleton, provable by tests before any UI exists.
**Files:** Expo scaffold; `src/game/{types,board,rules,solver,hints,ascii,diagnostics,index}.ts`; `__tests__/game/*`; `src/screens/EngineCheckScreen.tsx`; `src/theme/`.
**Deliverables:** pure, fully unit-tested game logic (98 tests, 96% statement coverage on `src/game`) + an app shell that runs the engine self-check and a playable tangle on device.
**Unplanned outcome:** tap order provably cannot lose a level, so the difficulty model was rebuilt around _reading_ the board rather than planning it — see [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md). The arrow model was also revised from single cells to multi-cell snakes once reference screenshots settled the mechanic.
**Testing checklist:** `npm run verify` green; app boots on device; self-check reports 12/12; the tangle is playable and hearts drain on wrong taps.
**Completion criteria:** rules engine passes tests; app launches on your phone; mechanic confirmed to match the reference game.
**Gate.**

## Phase 2 — Playable board (one hardcoded level) ✅

**Objective:** the production renderer and the real feel of the mechanic.
**Files:** `Board.tsx`, `ArrowSnake.tsx`, `Hud.tsx`, `gameReducer.ts`, `GameScreen.tsx`; one embedded test level.
**Deliverables:** one SVG `<path>` per snake with round joins and caps so bodies look like the reference art; thread-out release animation driven by `strokeDashoffset`; red flash + blocker pulse + heart drain on a blocked tap; win and out-of-hearts states; restart — smooth on device.
**Risks:** tracing difficulty is partly a _rendering_ property — stroke width, corner radius, and cell size change how hard a board feels. The Phase 1 difficulty bands must be re-validated on device once this lands.
**Testing checklist:** taps resolve correctly; the tail visibly follows the head out; blocked feedback explains itself; hearts drain; 60fps.
**Gate.**

## Phase 3 — Level pipeline + first real levels ✅

**Objective:** stand up the generator/validator and produce curated early levels as JSON.
**Files:** `tools/generate.ts`, `tools/validate.ts`, `tools/shapes/*`, `src/data/levels/*.json`, level-integrity test.
**Deliverables:** JSON-driven levels loading in-game; automated "every level solvable" test.
**Design:** grow self-avoiding snakes inside a shape mask, reject any board whose blocking graph has a cycle, then tune `expectedBlindMistakes` and the tracing metrics to hit a difficulty band. Solvability checking is microseconds, so the generator can afford to discard aggressively.
**Gate.**

## Phase 4 — Game shell ✅

**Objective:** the app around the game.
**Files:** Splash, Main Menu, Level Select, progress/settings stores, storage service, navigation.
**Deliverables:** continue/level-select flow; progress saved & restored; offline.
**Gate.**

## Phase 5 — Hints, out-of-hearts, audio ✅

**Objective:** helping systems + feel.
**Files:** `hintStore`, hint UI + on-device solver hookup, out-of-hearts flow, `services/audio.ts`, SFX/BGM.
**Deliverables:** safe hints, the fail-and-restart flow, music/SFX with settings toggles.
**Note:** there is no deadlock flow to build — a board can never be ruined, only hearts spent. The fail screen must say so, or losing reads as unfair.
**Gate.**

## Phase 6 — Ads (rewarded, hints only) ✅

**Objective:** earn hints via rewarded ad with the offline policy.
**Files:** `services/ads.ts`, hint-earning flow, seed-hints + preload logic.
**Deliverables:** working rewarded flow (test IDs), graceful offline behaviour.
**Note:** first phase that needs a custom dev build — Expo Go cannot load the AdMob native module.
**Gate.**

## Phase 7 — Full 50-level set + curation ✅

**Objective:** the complete v0.1 difficulty curve.
**Files:** `levels/001–050.json`, curation notes.
**Deliverables:** 50 curated, solvable, difficulty-graded levels playable start to finish.
**Gate.**

## Phase 8 — Polish, settings, accessibility ✅

**Objective:** production feel.
**Files:** Settings screen, reduced-motion, transitions, theming, icon/splash.
**Deliverables:** polished UX; accessibility options; consistent theme.
**Gate.**

## Phase 9 — Release prep ✅

**Objective:** Play Store readiness.
**Files:** EAS production config, real ad IDs, store assets, versioning.
**Deliverables:** signed AAB, listing assets, staged-rollout plan.
**Gate — v0.1 release.**

## Phase 10 — First-run teaching + hardening ✅

**Objective:** close the gap between "code complete" and "ready for a stranger".
**Files:** `state/onboardingStore.ts`, `components/CoachCard.tsx`, `__tests__/state/*`, `__tests__/services/*`, `eslint.config.js`, `.prettierrc`.
**Deliverables:** three one-time coach moments that teach the rule a player cannot infer; tests for the reducer, progress selectors and the save envelope; ESLint and Prettier wired into `npm run verify`.
**Why this before more levels:** the roadmap gates level packs on playtesting the 50, and a playtester who does not understand the rule tests nothing useful.
**Gate.**

---

## Phases 11–21 — after the first gate

Added as the project grew past the original plan. The record of what each one
changed and why is in [PROJECT_MEMORY.md](PROJECT_MEMORY.md); current state and the
release checklist are in [PROGRESS.md](PROGRESS.md).

| Phase | Objective                                                   | State                 |
| ----- | ----------------------------------------------------------- | --------------------- |
| 11–14 | 600-level library, chapters, themes, expanded shape library | ✅                    |
| 15    | Walls, gates, shutters — a second difficulty axis           | ✅                    |
| 16    | Ten difficulty tiers                                        | ✅                    |
| 17    | Board scale and touch response                              | ✅                    |
| 18    | UI/UX overhaul and pause menu                               | ✅                    |
| 19    | Level design document for all 1,000 levels                  | ⏸ deferred by request |
| 20    | Performance pass                                            | ✅                    |
| 21    | Board density, heart synchronisation, audio system          | ✅                    |
| 22    | Device playtest and curve retune                            | ⛔ needs you          |
| 23    | Release prep — assets, ad IDs, signed AAB, listing          | ⛔ needs accounts     |

---

### After v0.1

Only once 50 levels are tested and approved do we begin additional level packs toward 600, and reconsider deferred features one at a time against the puzzle philosophy.
