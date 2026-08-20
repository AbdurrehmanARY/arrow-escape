# PROGRESS.md — ArrowPath

> **What this is:** the state of the project against a production release, with
> nothing marked done that has not been built, tested and measured.
> **Last updated:** end of Phase 21 — density, heart synchronisation, audio system.

---

## Development phase

**Phase 21 of 23 — 21 of 24 phases complete, 87%.**

Counting phases 0 through 23: nineteen are done, Phase 19 is deferred by request,
and Phases 22 and 23 remain. **Treat the percentage as a position, not a
measurement.** The phases are not equal sizes, and the three that are left are
dominated by work that needs your accounts, your ears and your hardware rather than
more code — so the last 13% will not take 13% of the effort, in either direction.

|        | Phase                                              | State                  |
| ------ | -------------------------------------------------- | ---------------------- |
| 0–10   | Foundation through first-run teaching              | ✅ shipped to gate     |
| 11–14  | 600-level library, chapters, themes, shape library | ✅                     |
| —      | extended to a 1,000-level library (20 packs, 20 chapters) | ✅          |
| 15–17  | Gates, shutters, ten tiers, board scale and touch  | ✅                     |
| 18     | UI/UX overhaul, pause menu                         | ✅                     |
| 19     | Level design document for all 1,000 levels         | ⏸ deferred by request  |
| 20     | Performance pass                                   | ✅                     |
| **21** | **Density, heart sync, audio system**              | **✅ this pass**       |
| 22     | Device playtest and curve retune                   | ⛔ blocked on you      |
| 23     | Release prep — assets, ad IDs, signed AAB, listing | ⛔ blocked on accounts |

**The honest summary:** the game is code-complete and every automated check is
green. What stands between here and the Play Store is not engineering. It is 31
audio files, an AdMob account, a Play Console listing, and a human playing 1,000
levels to find out whether the difficulty curve is real.

---

## Completed features

### The rules engine

- Snake arrows, ray-based escape, hearts, win/lose/stuck states.
- **Provably solvable levels**: 1,000 of 1,000 verified by the solver at build time, and
  the recorded solution for each replayed and checked.
- Two gate types. `opens` adds depth without breaking anything; `shuts` deliberately
  breaks monotonicity, which is what makes 40 levels about _order_ rather than
  reading. `GameStatus` carries `stuck` for the deadlocks that creates.
- Walls and obstacles.
- Total functions throughout: invalid input returns a typed `Result`, never a throw.
- `src/game/` is pure TypeScript — no React, no I/O — so the same code runs the
  game on the phone and validates levels off-device.

### The level library

- **1,000 levels**, 10 tiers, 125,664 arrows.
- 64 distinct silhouettes used, from a library of 137. The rest of the boards are
  open rectangles — that ratio is the direct cost of packing to four-fifths, since
  a silhouette can only ever fill part of its grid.
- Deterministic: every level's seed derives from its id, so a rebuild is
  byte-identical.
- Constructive solvability. Boards are packed centre-outward and each snake is kept
  only if an end's ray is clear of what is already placed — and because the peel
  order is exactly the reverse of the placement order, the check made at build time
  _is_ the check the rules make at play time. The board cannot contain a cycle.
- Build time: **249 seconds** for all 1,000.

### Presentation

- Six themes, light and dark.
- Reanimated arrow movement at constant speed, duration scaled to distance
  travelled.
- Pan/pinch/zoom viewport with an absolute zoom floor, so a cell on a 50×50 board
  can always be brought to its designed size.
- Level-complete celebration: confetti, banner, victory sting.
- Pause menu, one row of play-screen chrome, progress bar.
- Accessibility: per-arrow handles, colour-blind-safe gate palette with shape cues,
  reduced-motion setting.

### Systems

- Progress, hints, settings and onboarding persisted through a versioned save
  envelope.
- Full audio layer: 27 effects, 4 music beds, cross-fades, ducking, voice limiting,
  per-sound gain, master/music/effects volumes and separate mutes.
- Rewarded-ad path for hints, implemented and switched off.
- First-run coach cards, including two that fire _before_ the first tap because a
  gate cannot be inferred by watching.

### Engineering

- 246 tests across 16 suites; coverage thresholds on `src/game/` enforced in CI
  config.
- `npm run verify` = typecheck + lint + tests + level revalidation. **Now about 15
  minutes**, up from 40 seconds — one sweep solves all 600 packed boards, which is
  70,000 arrows rather than 20,000.
- Off-device tooling: `bench`, `levels:probe`, `levels:check`, `levels:validate`,
  `shapes:inspect`, `levels:preview`.

---

## What this pass changed

### Board density — the headline number

Measured against the **playable area** rather than the grid. That distinction is
the whole metric on a shaped level: a pumpkin cannot fill a rectangle, and against
the grid those boards read as 48% full when they are in fact 84% full and look it.

| Tier        | Fill | Avg snake | Longest snake |
| ----------- | ---- | --------- | ------------- |
| tutorial    | 78%  | 3.0       | 4.1           |
| easy        | 87%  | 3.4       | 5.0           |
| casual      | 89%  | 4.8       | 7.9           |
| medium      | 90%  | 5.8       | 10.9          |
| tricky      | 90%  | 6.9       | 12.8          |
| hard        | 87%  | 7.6       | 14.4          |
| superHard   | 81%  | 10.3      | 18.0          |
| extremeHard | 81%  | 10.9      | 21.4          |
| brutal      | 80%  | 11.0      | 23.5          |
| nightmare   | 79%  | 11.3      | 26.1          |

**Every tier from easy to nightmare is in the 80–90% band** (nightmare at 79%
rounds into it). Across the 560 packed levels the average is 88%, and the number
below 80% fell from 266 to 58.

Tutorial sits at 78% on purpose. The first twenty boards are teaching levels, and
they are readable at a glance precisely because they are not full.

**A consequence worth knowing about: the early game got harder.** "Dense across
all difficulties" includes Easy, and packing those boards took the first fifty
levels from a handful of expected blind mistakes to about 156, against 576 for the
last fifty. The game still climbs — it climbs about 3.7× rather than the 5× it
used to — but the floor rose, not the ceiling. Levels 1–20 are still explicitly
held gentle and a test enforces it. Levels 21–50 are now genuinely dense boards,
and that is the first thing to judge on device.

**The 40 shutter levels sit at 66%, also on purpose.** A `shuts` gate asks the
player to work out an order, and an order can only be read off a board sparse
enough to see the dependencies in. Packing them would hide the one thing they
exist to teach.

### Difficulty progression

Both snake-length columns above are **strictly monotone across all ten tiers** —
3.0 → 11.3 average, 4.1 → 26.1 longest — and that is the axis this game's
difficulty lives on. Reading a board means tracing a snake through a tangle.

One thing to know, because the build log shows it: `expectedBlindMistakes` is
_not_ monotone across the top four tiers (674 / 624 / 519 / 592). That metric
models a **random tapper**, who does not trace at all, so it is blind to snake
length — the one axis those four tiers actually vary on. They are all ~50×50
because density was made the priority and 50 is where density and size stop
fighting; past it, covering four-fifths of a 60×60 grid needs upwards of 250
snakes, which is more than the renderer should carry.

### Heart synchronisation — fixed, and the cause was mine

The reducer arithmetic was always right. **The tap never reached it.** In the
performance pass I moved hit-testing into a gesture worklet — a `useCallback`
carrying `'worklet'`, containing a nested worklet closure, reading a shared array.
When that fails to workletize the handler throws and the tap silently does nothing,
which from the outside looks exactly like a frozen heart counter.

Hit-testing is back on the JS thread, where the benchmark puts it under 0.01ms.
`__tests__/components/heartsUi.test.tsx` now drives the real gesture surface and
asserts 5→4→3→2→1→0, plus that a clearing tap costs nothing.

### Build reliability

Two failures that had nothing to do with levels and everything to do with the
build:

- `levels:build` **deleted `src/data/levels/` at startup** and rewrote it minutes
  later, so Metro could not resolve `@data/levels` for that entire window. That is
  how it was found — it broke the running dev server. Old packs now survive until
  the new ones are written.
- Proving a shutter board _unsolvable_ costs the full search budget, and the
  generator makes dozens of doomed candidates per level. One 23×25 shutter level
  measured **309 seconds on its own**. Candidates are now screened at 4,000 states
  and only survivors re-proved at the full 200,000, so the guarantee is unchanged
  and the build finishes in 194s instead of never.

---

## Remaining tasks

### Blocking a production release

- [ ] **31 audio files.** Every call site is wired and the game is silent without
      them. Specification, formats and mixing constraints in
      [`assets/audio/README.md`](../assets/audio/README.md); enabling each is
      uncommenting one line in `src/services/audioAssets.ts`. - [ ] 4 music beds — `menu`, `gameplay` (seamless loops), `victory`,
      `failure` (stings) - [ ] 12 gameplay effects - [ ] 5 UI effects - [ ] 5 progress effects - [ ] 2 failure effects - [ ] 3 miscellaneous effects
- [ ] **Set `UNLOCK_ALL_LEVELS` to `false`** in `src/config/index.ts`. It is `true`
      today: every level is open and both the menu and level select show a TESTING
      badge.
- [ ] **AdMob account and real ad unit IDs** — [ADS_SETUP.md](ADS_SETUP.md).
- [ ] **Play Console listing** — icon, feature graphic, screenshots, description,
      content rating, privacy policy — [RELEASE.md](RELEASE.md).
- [ ] **Signed production AAB** via EAS, and a staged-rollout plan.
- [ ] **Version and build number** set for the first submission.

### Needs a physical device

- [ ] **Play the 1,000 levels.** The curve has never been validated by a human.
      `expectedBlindMistakes` models a random tapper; a real player reads
      partially, so true difficulty sits somewhere below the model. Expect to
      retune `tools/curriculum.ts` afterwards.
- [ ] **Judge the packed boards.** 80–90% fill was your call and it is delivered;
      whether it reads as satisfying or as noise is a question only playing
      answers.
- [ ] **Frame rate on a mid-range Android device** at 50×50 with ~160 snakes.
      [PERFORMANCE.md](PERFORMANCE.md) has the budget; the engine measures under
      0.01ms per tap, so anything felt is in the renderer.
- [ ] **Confirm the audio mix on a phone speaker** once files exist — the gains in
      `SFX_GAIN` are reasoned, not heard.
- [ ] **Prove the ads path against a real SDK.** It has never run; installing it
      breaks Expo Go, so the first dev-client build is where it gets tested.
- [ ] **Check the smallest screen you have** — 928 of 1,000 boards need zoom and pan.

### Engineering, non-blocking

- [ ] Component tests for the remaining screens. The board's tap surface and
      `ArrowSnake`'s memo are now covered; everything else relies on the bundle
      building. Decision 79 in [PROJECT_MEMORY.md](PROJECT_MEMORY.md) is what that
      gap cost once already.
- [ ] Audio service tests — currently only its _absence_ is proven harmless.
- [ ] Phase 19: the level design document covering all 1,000 levels (deferred; two
      questions still open on fields and format).
- [ ] Revisit `MAX_PACKED_SIZE = 50` if the top four tiers feel too alike on
      device. Raising it trades density for board size — they fight past 50.
- [ ] `npm audit` reports moderate advisories from the Expo dependency tree; none
      are in code paths this app uses.

---

## Risks

- **The curve is unvalidated by humans.** Provable solvability is not
  playability.
- **Tracing difficulty is partly a rendering property.** Stroke weight, cell size
  and corner radius change how hard a board feels. Retune on device, not in the
  abstract.
- **The top four tiers are all ~50×50** and differ only in snake length and gate
  frequency. If that reads as flat, the lever is `MAX_PACKED_SIZE`, and it costs
  density.
- **The audio layer has never made a sound.** What is proven is that its absence is
  harmless; what is unproven is everything else about it.
