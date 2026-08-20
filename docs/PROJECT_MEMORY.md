# PROJECT_MEMORY.md — ArrowPath

> **Authoritative source of project state.** Read this before starting any task. Update it after every completed phase.
> **Last updated:** full-coverage pass — every one of the 138 shapes now reaches a level (was 60), a duplicate shape id fixed, and a Dog silhouette added. Tiers and board sizes untouched throughout. Previously: end of Phase 22 — the board renders on Skia; frame drops on large boards resolved on device. Phase 19 (level design document) deferred by request.
> Release state and the full remaining checklist live in [PROGRESS.md](PROGRESS.md).

---

## Status

**Code-complete at 1,000 levels.** Playable end to end: 1,000 generated and
solver-verified levels drawing on **all 138** shapes in the library — every
silhouette reaches at least one level, guaranteed by construction rather than by
luck; see decision 120 — across **ten** difficulty tiers, six
themes, animation, hearts, hints, persistence, navigation, settings, first-run
teaching, a full audio layer, and an ads path that is implemented but switched off.

Boards are **packed**: every tier from easy to nightmare fills 79–90% of its
playable area, averaging 87% across the 928 packed levels. The 72 shutter levels
sit at 64% deliberately — see decision 86. Note that fill is measured against the
**mask**, not the grid, so a shaped level reads as emptier than its number — which
is what full shape coverage costs the low tiers (decision 121).

**Longest** snake length rises monotonically across all ten tiers, 4.0 to 26.2
cells, which is the axis difficulty actually lives on here. **Mean** length rises
3.0 to 10.3 from Tutorial to superHard; past that it is not a safe invariant even
when it happens to hold — see decision 119.

Audio is **fully wired**: 27 effects and 4 music beds, every one of them reached by
a real moment in the game. The files themselves are synthesised placeholders, so
what is missing is a composer rather than any code.

What is _not_ done is everything that needs your accounts or your assets — a Play
Store listing set, an AdMob account, a Supabase project and Google OAuth clients,
and artwork to replace the generated icon. Those are listed in
[RELEASE.md](RELEASE.md), [ADS_SETUP.md](ADS_SETUP.md) and
[AUTH_SETUP.md](AUTH_SETUP.md).

## The mechanic (settled)

Arrows are **snakes**: connected chains of cells with an arrowhead at one end.
Tapping sends the snake out through its head; the body threads out along the trail
the head clears. An arrow can leave **iff the straight ray from its head to the
edge is clear** — its own body never blocks it. A blocked tap changes nothing and
**costs a heart**; five spent hearts fails the level.

### The load-bearing consequence

**Tap order cannot lose a level.** A tap only ever removes a snake, and removing a
snake can never block another, so a free arrow stays free. Greedy always works and
a solvable board can never become stuck.

Difficulty therefore lives entirely in **reading the board**. Wrong _reads_, not
wrong _plans_, are the failure mode. Full proof and the difficulty model are in
[MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

### …and the one exception, added in Phase 15

The paragraph above holds on **928 of the 1,000 levels**. The other 72 carry a
`shuts` gate — a cell that is open while its colour is on the board and seals for
good once the last of that colour leaves. That lets a tap _take a route away_,
which is the one thing that breaks monotonicity, so on those boards order matters,
deadlock is real, and `GameStatus` has a `stuck` value for it.

The distinction is enforced, not merely intended: `analyze` reports a
**`blunderRate`** — the share of legal taps that quietly lose the level — and the
level tests assert it is above zero on every shutter board and exactly zero on
every other one. Walls and `opens` gates are also available and are both fully
monotone; they buy dependency _depth_, not risk.

## Architecture decisions (locked for v0.1)

1. **Level pipeline = hybrid generate-and-curate.** Shape mask + plan → generator → solver/validator → level JSON. Every shipped level is verified solvable _and_ has its recorded solution replayed, in CI.
2. ~~**Rendering = react-native-svg**, one `<Polyline>` per snake with rounded joins. Not Skia — only one arrow animates at a time.~~ **Superseded — see decision 99.** The premise held; the scale it was decided at did not. Rendering is Skia, and "only one arrow animates at a time" is now the reason it is cheap.
3. **Animation = Reanimated 4** (+ `react-native-worklets`). Release is a dash-window slide along body-plus-exit-ray.
4. **State = Zustand (persistent) + `useReducer` (live board).** Live board state stays out of the global store.
5. **Storage = AsyncStorage**, versioned envelope, corruption-safe.
6. **Domain layer `game/` is pure TS** — the same code runs in-app and in off-device tooling.
7. **Ads = AdMob rewarded only, hints only**, loaded via guarded dynamic `require` so Expo Go still works.
8. **Framework = Expo SDK 57 (managed) + expo-router + EAS**, TypeScript strict.

### Added in Phases 1–9

9. **An arrow is a body, not a cell.** Validated as a connected, non-self-touching simple path.
10. **Head direction is inferred from the last segment, never stored** — no second source of truth to desync.
11. **An arrow never blocks itself.** Each segment vacates as the one ahead advances, which keeps spiral and hook shapes playable.
12. **`solve()` needs no search** — Kahn's algorithm on the blocking graph. Solvable iff acyclic. Microseconds per level, which is what makes CI validation of the whole library free.
13. **Difficulty = tracing load + guess pressure**, not planning depth. `expectedBlindMistakes` is the primary dial.
14. **Hints are "the first move of a winning line"**, so a hint provably cannot cost a heart.
15. **A theme is data.** Palette + ArrowStyle + BoardStyle, all ratios of one cell; **the renderer never branches on a theme's id**.
16. **Drawing maths is a pure module** (`arrowGeometry.ts`), unit-tested, and shared with the off-device theme preview.
17. ~~**Touch targets are real `Pressable` views**, one per occupied cell — not SVG `onPress`, which hit-tests inconsistently across platforms.~~ **Superseded — see 61 and 62.** The half about avoiding SVG `onPress` still holds; the `Pressable`-per-cell half was the cause of two separate touch bugs and is gone.
18. **Arrow counts in the curriculum are derived from mask capacity, never declared.** A snake occupies several cells; "18 arrows" inside a 56-cell heart is arithmetic, not design. `npm run levels:check` proves every plan fits before generating.
19. **High difficulty is many moderate snakes, not a few enormous ones.** A long rope is easy to follow; a dense field of similar short ones is where tracing genuinely hurts. Grids grow faster than bodies across the curve.
20. **Unlocking is derived from the completed set, never stored** — a stored "highest unlocked" can drift and lock a player out of levels they finished.
21. **Progress saves the moment a level is cleared**, not when the win overlay is dismissed.
22. **Audio degrades to silence.** Every call is a no-op when the asset is missing, so the game ships and plays without any audio files.
23. **`.npmrc` pins `legacy-peer-deps=true`.** Expo 57 ships a `react-dom` whose peer range excludes the pinned React; mixing strict and legacy installs against one tree prunes packages and silently breaks the babel/jest toolchains.
24. **Metro caches transformed code with the compiling plugin's version baked in.** Any dependency version change needs `npm run start:clear`, or you get an error naming two versions of a package that only exists once. `start:tunnel` clears by default.
25. **A `require` of a missing asset cannot be caught.** Metro resolves it at build time, so try/catch is wishful thinking and the app ships a broken module-graph entry. Optional assets go in an explicit registry (`services/audioAssets.ts`) that starts empty.
26. **Levels are stored as walks, not coordinate lists.** A body is a head plus one character per step (`"4,7:DDRR"`), which is roughly a quarter the size of `[[r,c],…]`. All 1,000 levels are 2.7 MB.
27. **Levels ship in packs of 50, not one file each.** Metro charges real overhead per module and nothing ever needs a level in isolation. 20 modules instead of 1,000, decoded on demand and cached.
28. **Silhouettes are bitmaps, not formulas.** A circle is an inequality; a guitar is not. 74 hand-drawn 16x16 outlines, supersampled to any board size — point sampling loses thin features like a crown's points at small sizes.
29. **Masks are repaired after sampling.** Isolated cells and regions too small to hold a snake are pruned, so reported capacity is capacity the generator can actually reach. Without it, generation starves for reasons that look mysterious.
30. **The generator repairs unsolvable boards rather than resampling.** Solvability needs an acyclic blocking graph, and at Extreme densities nearly every random board has a cycle. Reversing a body flips that arrow's exit direction without touching the silhouette, and every cycle contains a stuck arrow — so flipping stuck arrows breaks cycles far more often than it creates them. This turned a hard build failure at level 157 into all 600 levels in 28 seconds.
31. **Difficulty is mixed, not monotonic, after level 20.** A predictable ramp is what makes a long game feel like a treadmill. Tiers are drawn from a weighted mix that shifts across the game, so the average climbs while any single level is a surprise. The last ten are forced to Extreme so the game does not end on a shrug.
32. **Oversized boards have a minimum cell size and pan instead of shrinking.** Fitting a 27x30 board to a phone gives ~12dp cells: unreadable and untappable. Cells stay at 26dp and the viewport scrolls.
33. **Touch stays exact at every zoom level for free**, because the per-cell targets live inside the transformed view. No coordinate conversion by hand, which is where this normally breaks.
34. **The grid is one tiled SVG pattern, not one node per cell.** An 810-cell board would otherwise cost more in grid nodes than in every arrow combined.
35. **1,000 levels are grouped into 20 chapters**, matching the pack layout exactly so a chapter is also the unit of data loaded. A chapter opens once the previous one has been _started_, not finished — gating on completion would strand a player stuck on one board behind 550 levels they cannot touch.
36. **Chapter names are fixed, not derived.** Contents shift whenever the curriculum is retuned; a chapter a player remembers finishing must not silently rename itself between builds.
37. **The app icon is generated from the game's own arrow geometry** (`tools/make-icons.ts`), rasterised with `pngjs` — a thick rounded line is a distance test, a head is three half-plane tests, and 4x4 supersampling handles the edges. It is centred on its _drawn_ bounds rather than its path coordinates, because the stroke radius and arrowhead overhang by different amounts per axis.
38. **The pan/zoom camera maths is a pure module** (`components/camera.ts`), because it runs as a worklet where a debugger is little help, and an off-by-one in the overhang lets a player lose a 27x30 board off-screen.
39. **The win overlay waits 900ms.** The last snake threading out is the most satisfying moment in the game, and covering it instantly threw that away. The celebration fires immediately; the overlay follows.
40. **Confetti is one shared value read by sixty derived styles**, not sixty animations. Each piece's path is projectile motion — launch angle, speed, gravity — on constants fixed at spawn, because linear fades read as a screensaver.
41. **The celebration is derived from the win, not mirrored into state.** An `active` prop that goes false and true again on replay re-fires it; a separate nonce would have been a second signal meaning the same thing, and a second thing to get out of step.
42. **Perfect-read streaks count replays.** The streak is a statement about how someone is playing _now_ rather than a permanent record, which is what makes it worth chasing. It is only shown from two upward — announcing "streak: 1" on every clean level cheapens it.
43. **No double-tap gesture on the board, ever.** The board is covered edge to edge in tap targets, so a double-tap cannot be told apart from two deliberate taps on an arrow — and since a wrong tap costs a heart, that ambiguity was charging two hearts for one gesture. Fit-to-screen is a button. Any future board gesture must survive the same question.
44. **Tap feedback comes from `resolveTap`, never from the safe-move set.** They answer different questions, and `findAllSafeMoves` returns nothing at all on an unsolvable board, so every tap would have played the collision sound.
45. **`UNLOCK_ALL_LEVELS` is read in exactly one place** (`playableUpTo`). `highestUnlocked` stays pure and honest about real progress, so the flag cannot corrupt a save and turning it off needs no migration. While on, the menu and level select both show a TESTING badge — a build flag that looks like production is how one ships by accident.
46. **The invisible tutorial is not fully possible here.** The GDD asks the design to teach with no text (§6), which works for rules a player can infer by watching. Nothing about a board of ropes reveals that the arrowhead is what matters. Three one-time coach cards, each fired by the situation it explains, are the smallest honest compromise.

### Added in Phases 15–17

47. **Order is made to matter by taking a route away, not by moving an arrow.** The long-standing answer to "can this game have planning in it" was "only by letting blocked arrows move", which costs the no-dead-ends guarantee, the microsecond solver and every existing level. A gate that _shuts_ achieves the same thing — a tap that adds a constraint — with no change to what a tap does and no change to any level that does not use one.
48. **Gate polarity is one word, and it is the difference between two games.** `opens` is monotone: it blocks until its colour has left, so greedy still always works and it buys depth only. `shuts` is the inverse and breaks monotonicity on purpose. Both share all their machinery.
49. **`stuck` is not folded into `failed`.** A player who deadlocks a shutter board still holds every heart, and showing them a spent-hearts screen would teach the wrong lesson about what went wrong. Separate status, separate overlay, and the fail copy's promise that "the board behind this is still winnable" is now conditional — it can be false, and the player can check.
50. **A shutter board can be lost several taps before it looks lost**, so `isDoomed` runs after every move and surfaces the overlay early. It costs nothing on the 560 levels with no shutter: it returns false without looking at the board.
51. **`solve` branches on `hasShutters`.** Kahn's peel without them, depth-first search memoised on the surviving arrow set with them, under a budget that reports `unknown` rather than `unsolvable`. An unproven board must never ship as a proved one.
52. **The blocking graph must not skip self-edges for gates.** Skipping self is right for a body lying across its own ray and exactly wrong for an arrow whose own colour keys the gate in front of it. `castRay` had it right; the solver disagreed, and only a property test found it.
53. **Colour is the one thing in this game that carries information.** It links an arrow to the gate it controls, so it is drawn from a colour-blind-safe set and gates carry a shape cue as well. It also makes arrows easier to tell apart, which makes a level _easier_ — so a level only spends a colour where a gate earns it back.
54. **Ten tiers, five colour pips.** Five tiers over 600 levels made "Hard" span a range wide enough to mean nothing. Ten bands are narrow enough that the label is a promise — but ten distinguishable dot colours do not exist in a palette that also works for colour-blind players, so the pips pair up and the tier _name_ carries the precision.
55. **A failed snake start must not consume an arrow slot.** Invisible at bodies of 2–6 and ruinous at 5–14: on a 30x30 board most starts paint themselves into a corner, so boards came out at half their intended density. Fixing it took nightmare levels from 70 to 161 average blind mistakes.
56. **A silhouette caps how hard a level can be, and capacity dominates islands.** Arrows in separate regions can never block each other, so a fragmenting shape raises how many are free at once; and a narrow shape on a 28x28 board simply holds fewer snakes. Filtering the demanding tiers on islands _alone_ made them easier, because it left a pool of detailed but thin outlines. Both filters together, measured rather than declared.
57. **Glyphs are strokes, not bitmaps.** A `1` drawn at 16x16 is a two-pixel column: sampled to a 9-wide board it is either gone or four cells thick, and no single drawing survives both ends. A stroke is a distance function, so thickness is chosen at the target size — at least a cell wide, never wide enough to fill in the counter of an `O`.
58. **Procedural shapes perforate the board rather than outlining it.** A bitmap says where the board ends; a honeycomb or a maze carves corridors through the middle, so snakes must bend constantly — a difficulty device dressed as decoration.
59. **The two gate coach cards fire before the first tap**, unlike every other card, which explains something that has already happened. A gate cannot be inferred by watching, and a shutter would otherwise be met by losing a level with every heart still in hand.

### Added in the board-scale and touch pass

60. **A `Pan` gesture with no activation threshold silently eats taps.** Gesture-handler cancels whatever is underneath the moment a pan claims the touch, and a pan with no offset claims it on the first pixel of movement — which every real tap has. This was the cause of "I have to tap more than once", and it looked like a rendering or hit-testing problem for a long time. `PAN_SLOP` is now shared between the pan's activation offset and the tap's `maxDistance`, so there is no band of movement that is neither.
61. **Never mix React Native `Pressable`s with gesture-handler gestures over the same area.** The two touch systems do not negotiate. This is the second bug traced to that combination (the first charged two hearts for one double-tap), and the board now has no `Pressable` on it at all.
62. **Board hit testing is arithmetic, not views.** One tap surface plus a cell lookup, instead of a view per occupied cell — a thousand fewer views on a 60x60 board, and it arbitrates correctly with pan and pinch. Near-misses within ~0.85 of a cell select the nearest snake, which is what makes a small cell tappable at all.
63. **Press feedback is a shared value, not state.** An arrow dims on touch-_down_, read inside each snake's animated style. A `useState` would re-render a hundred-snake board twice per tap — to acknowledge a tap, which is the one thing that must not cost frames.
64. **Taps during the exit animation are accepted, not dropped.** The old guard's stated reason — that the board was "mid-change" — was never true; `applyOutcome` runs when the tap is accepted, so only the drawing lags. Refusing them cost real taps, and slowing the animation to 720ms would have made every second tap vanish.
65. **Board size and difficulty are not independent, and the coupling is violent.** Raising Medium from 14x14 to 30x30 multiplied its arrow count fivefold; `expectedBlindMistakes` grows faster than area, so a 40x40 Hard board measured **697** against a target of 45, and the top three tiers could not be generated at all. Big boards had to become _sparser_ boards. Any size change requires re-deriving every fill and every blind target — `npm run levels:probe` does it in seconds instead of the half hour a full build now takes.
66. **Max zoom must have an absolute floor, not only a multiple of fit.** `3.5x fit` is generous on a board that nearly fits and meaningless on one that does not: a 60x60 board fits at 0.23, so the ceiling was 0.8 and the player could never see a cell at its designed size — on exactly the boards where reading one arrowhead matters most.
67. **Sampling a periodic field at cell centres aliases catastrophically.** When a pattern's period is commensurate with the grid, every sample lands in the same phase: `starTiling` at 16x16 and `lattice` at 20x20 came out _completely empty_, every sample a hundredth below the threshold. Field shapes are supersampled like the bitmaps now, and a mask that still comes out near-empty falls back to the open board rather than producing an ungeneratable level.
68. **The repair pass has to scale with the board.** A fixed forty flips is right for a knot of four and hopeless for a knot of sixty; level 21 simply failed to build. It now flips a quarter of the knot per round, with a budget proportional to arrow count, and drops back to single flips for the last quarter of its rounds.

### Added in the UI pass

69. **The play screen has one row of chrome, not two.** Back, settings and the hint count were three tap targets along the top edge of a screen whose only verb is "tap an arrow", and none of them was ever wanted mid-move. They are behind a single pause button now.
70. **A pause menu is worth building even with no clock to stop.** "Pause" is a slight misnomer — nothing is running — but it is the word players look for when they want to stop and do something else, and a truer one would be accurate and useless.
71. **Restart is not the primary action on the pause sheet.** It is the most destructive option there, and a sheet that opens with the destructive option highlighted trains people to tap it by reflex. Tapping the scrim resumes, because nobody opens a pause menu meaning to lose their place.
72. **The HUD needs a progress bar now that boards are 60x60.** An arrows-left count says nothing without knowing the starting number, and on a board four screens wide "am I nearly done" was a question nothing on screen could answer.
73. **Three screens had each hand-rolled the same header**, including three copies of a `width: 44` spacer to fake optical centring against the back button. `ScreenHeader` centres on the layout instead, so the title does not shift depending on what is in the right-hand slot.

### Added in the performance pass

74. **The engine is not the bottleneck and never was.** `npm run bench` puts every per-tap domain call on the worst board in the library under a hundredth of a millisecond. That is the dividend from keeping `game/` pure — it was written to be testable off-device and turns out to be cheap for the same reasons. Every real cost is in the renderer.
75. **A broken `memo` has no symptoms.** `ArrowSnake`'s had been dead since the touch rewrite because the board passed it a fresh closure per arrow per render, so every tap re-rendered every snake. Nothing logged, nothing warned, no test failed — it was only slow. Props handed to a memoised component must be referentially stable, and that is now enforced by a render-counting test with a negative control rather than by hoping.
76. **Nothing in the board may scale with cell count.** At 3,600 cells the two things that once did — the grid and the touch targets — are a single tiled `<Pattern>` and a single tap surface. The accessibility handles are per _arrow_ and memoised on the arrow set.
77. **A node budget is not a style decision.** Above 45 snakes arrows drop their shadow and highlight: full-length polylines that are most of the draw cost, carry no information, and are invisible on the boards big enough to trigger it. It lives in the renderer rather than the theme, because a theme says what an arrow looks like and this says what the renderer can afford to spend saying it.
78. ~~**Occupancy must be copied to the UI thread on every tap, not throttled.**~~ **Reversed** — the copy is gone entirely. See decision 79.

### Added in the density, audio and heart-sync pass

79. **Hit testing does not belong on the UI thread.** Moving `arrowAtPoint` into a worklet was a performance fix for a problem that did not exist — `npm run bench` measures the lookup at under 0.01ms — and it cost correctness: a `useCallback` carrying `'worklet'` with a nested worklet closure over a shared array does not reliably workletize, and when it fails the gesture handler throws and **the tap silently does nothing**. The symptom reported was "the hearts do not go down", which is what a swallowed tap looks like from the outside. Hit testing is plain JS again, and `__tests__/components/heartsUi.test.tsx` drives the real gesture surface and asserts 5-4-3-2-1-0.
80. **A silent no-op is the worst failure mode a gesture can have.** The reducer arithmetic was correct the whole time and every reducer test passed; nothing between the finger and the reducer had a test. A component test through the real tap surface would have caught this on the day it was introduced, and now does.
81. **A build must not delete its output before it has a replacement.** `levels:build` cleared `src/data/levels/` at startup and rewrote it minutes later, so for the whole of that window Metro could not resolve `@data/levels` and the running dev server was broken — which is exactly how it was found. Stale packs are swept _after_ the new ones are written.
82. **Proving a shutter board unsolvable costs the full search budget, and the generator makes dozens of doomed candidates per level.** One 23x25 shutter level was measured at **309 seconds on its own**, against ~100ms for the packed 50x50 boards either side of it. Candidates are screened at `SCREEN_BUDGET` (4,000 states) and only survivors are re-proved at the full 200,000 before shipping, which is what makes a small budget a scheduling decision rather than a loosening of the guarantee. The full build went from not finishing to about three minutes.
83. **Coverage measured against the grid mostly reports which shape was chosen.** Shaped levels read as 48% full against the rectangle and 84% full against their own silhouette — identical to the free boards beside them, and looking it. A pumpkin cannot fill a rectangle, so the grid is the wrong denominator and the metric was inventing a problem that was not there.
84. **The "usable fraction" of a mask depends on which grower runs, and using one number for both throttled the biggest tiers.** 0.6 describes a _random_ self-avoiding walk stranding pockets. `growPackedBoard` places centre-outward and reaches ~87%. Sizing packed plans at 0.6 made `arrowsFor` cap nightmare at 114 arrows on a board with room for 180.
85. **Raising the minimum body length is not a density lever on its own.** It also divides the capacity cap, so the first attempt traded a 24% longer snake for 25% fewer of them and nightmare coverage went _down_, 77% to 72%. The two constants have to move together.
86. **Packing the early levels raised the floor of the whole game.** "Dense across all difficulties" includes Easy, and it took the first fifty levels from a handful of expected blind mistakes to about 156 against 576 for the last fifty — the curve still climbs, at roughly 3.7x rather than 5x, but it starts much higher. Levels 1-20 are explicitly exempt and a test holds them under twelve.
87. **`expectedBlindMistakes` cannot order the top four tiers, and that is a fact about the metric.** It models a player tapping at random, who never traces a snake, so it responds to how many arrows are free at once. At a fixed density longer snakes mean _fewer_ arrows, so the number falls as the board gets harder to read: the top four measure 674 / 624 / 519 / 592. They are ordered by snake length instead — 4.1 to 26.2 cells at the longest, monotone at every step, which is the axis difficulty actually lives on here. Mean length is _not_ a safe invariant across those four; see decision 119.
88. **Shutter levels are the one deliberate exception to the density target.** A `shuts` gate asks the player to work out an _order_, and an order can only be read off a board sparse enough to see the dependencies in. Packing them would hide the single thing they exist to teach.
89. **Every audio call is a no-op when the file is missing, and that is a build-time property rather than a runtime one.** Metro resolves `require` when it bundles, so a `try/catch` around a missing asset does not help — the app ships with a broken module that can take the native side down. The registry is explicit and starts empty; enabling a sound is uncommenting one line.
90. **Voice limiting is what "no overlapping distortion" actually requires.** Two copies of one short effect a few milliseconds apart do not sound like two events, they sum and clip. This game produces that easily — several arrows can leave at once and a player can tap faster than a sound is long — so the same effect will not retrigger inside `RETRIGGER_GAP_MS`.
91. **A mute and a volume of zero are not the same setting.** Someone who mutes music and later unmutes it expects their level back, not silence.
92. **Volume is a five-step segmented control, not a slider.** A slider needs a native dependency, and adding one to this toolchain has broken it twice. Five steps is the resolution anyone actually uses.

### Added in the development-build pass

93. **Expo Go and a development build are both kept, and neither replaces the other.** Expo Go is faster for gameplay and level work and needs no build step; a development build is the only way to run anything native, which is the whole ads path. Installing `expo-dev-client` changes what bare `expo start` targets, so `start:go` and `dev` exist as explicit scripts and the default is not relied on.
94. **`expo-dev-client` is a `dependency`, not a `devDependency`, and it still does not ship.** Autolinking reads `dependencies`, so moving it would break the debug build it exists for. It stays out of release builds because `expo-dev-launcher`'s Gradle wiring is `debugImplementation`; a release build only picks it up if `expo.devlauncher.configureInRelease=true`, which is not set. Verified in the package's own `android/build.gradle` rather than inferred from the docs, which do not say.
95. **`newArchEnabled` was an invalid property, not a setting.** The New Architecture is always on in SDK 55+ and cannot be disabled, so the flag failed config-schema validation while doing nothing. Removing it changed no behaviour — but it was one of two `expo-doctor` failures standing between this project and a native build.
96. **`expo-audio` needs `expo-asset` and Expo Go was hiding it.** Expo Go bundles `expo-asset` already, so the missing peer dependency was invisible; outside Expo Go — which is precisely what a development build is — it can crash. This is the class of bug development builds exist to surface, and it was found by `npx expo-doctor` before a single build ran.
97. **`npx expo-doctor` is the gate for native builds, the way `npm run verify` is for the JS.** It caught both of the above in one run. Worth running after any dependency or app-config change, not just before a release.
98. **Every EAS script goes through `npx --yes eas-cli@latest`, never a bare `eas`.** EAS CLI is a separate program rather than a project dependency, so `eas` is only on PATH after a global install — and a script that assumes one fails with `'eas' is not recognized` on a clean machine, which is exactly what happened. `npx eas` does not work either: the package is `eas-cli`, and `npx eas` fails with "could not determine executable to run". The npx form needs no installation and is the alternative Expo documents; putting it inside npm scripts answers the docs' own caveat about having to remember it.

### Added in the Skia migration

99. **The board renders on a Skia canvas, not in SVG.** Decision 2 chose `react-native-svg` and explicitly rejected Skia, on the reasoning that "only one arrow animates at a time". That premise was never wrong — it is still true, and it is now the _argument for_ Skia rather than against it. What changed underneath it was scale: boards went from 12x12 with ~20 arrows to 50x54 with 180, and a 180-arrow board was roughly 1,600 native nodes. Everything at rest is now recorded into one `SkPicture` and replayed as a single draw; only the handful of arrows actually moving get a node each.
100. **The symptom that justified the rewrite was frame cost tracking _visible_ content, not board size.** Dragging was fine zoomed in on a big board and dropped frames zoomed out — the fingerprint of per-node rasterisation, since zooming out brings every remaining arrow inside the viewport. Two cheaper fixes were tried first and measured on device; neither helped, which is what turned Skia from a guess into a conclusion.
101. **The camera moved inside the canvas.** It was a transform on an `Animated.View` wrapping the whole level — up to 1456x1352dp. It is now a matrix on a Skia `<Group>`, so panning replays the same picture through a different transform and nothing is re-laid-out or re-rasterised. This is also what retired `renderToHardwareTextureAndroid`: there is no longer an oversized view to promote to a layer.
102. **Press feedback is an overlay, never a picture re-record.** Touch-down fires on every gesture including the start of a pan. Pulling the touched arrow out of the static picture to dim it would mean re-recording all 180 arrows per touch — exactly the per-touch cost the architecture exists to remove. Painting the board colour over it at partial alpha costs one extra draw and no re-record.
103. **A Skia canvas cannot be tested, so everything that can be decided without a GPU is decided outside it.** `scene.ts`, `hitTest.ts` and `timings.ts` are pure TypeScript with no Skia import — the same rule `src/game/` follows, for a sharper reason: an SVG tree can be rendered in Jest and queried, and a canvas answers no questions. Skia also cannot be loaded in Jest at all (`Cannot use import statement outside a module`), so anything left inside the renderer becomes permanently untestable.
104. **The riskiest part of the migration was hit testing, not drawing.** Under SVG the tap surface sat _inside_ the transformed view, so a touch arrived already in board coordinates and no conversion existed to get wrong. A Skia matrix does not move the view, so the inverse is now applied by hand. Getting it wrong does not crash and does not look broken — it selects the arrow _next to_ the one aimed at, costs a heart, and reads as the game cheating. `hitTesting.test.ts` asserts the round trip at every zoom and pan a player can reach.
105. **The arrowhead needs its own transform, because trimming a path does not move it.** The body is drawn by trimming, so its visible window slides along geometry that never moves; the head is a separate filled shape and stays put unless translated. Left alone the body threads out from under a stationary head — reported as "the arrow goes but not its head". It is translated along the same forward vector by the same distance the trim window has advanced.
106. **`react-native-svg` is gone entirely.** Nothing in the project imported it once the board moved, and no dependency needed it. Removing it took the JS bundle from 6.1MB to 5.9MB and takes its native library out of the APK — the more meaningful saving, since Skia's own native code added ~42MB to a universal APK.

### Added in the sound-wiring pass

107. **Twenty of the thirty-one bundled sounds were never played by anything.** They were declared, bundled, gain-balanced and mixed — and no code path reached them. Nothing reports this: an unplayed sound is indistinguishable from a quiet game, and `hasAudioAssets()` was true the whole time because it counts files, not call sites. The registry describing a sound and the app firing it are two separate pieces of work, and finishing the first one looks exactly like finishing both.
108. **The click belongs in the shared primitives, not at the call sites.** `buttonClick` reaches ~60 buttons through five components — `PillButton`, `IconButton`, `Action`, `Secondary` and the tab bar's one `screenListeners` — rather than through sixty `playSfx` calls next to sixty `onPress`. A rule that every new button must remember to make a noise is a rule that silently decays; wiring the primitive means a screen gets it by using the standard button.
109. **Sound fires before the handler, except where the handler is the mixer.** A handler that navigates can unmount the caller mid-call, so `withClick` plays first. The settings screen is the deliberate exception: its controls change the mixer the sound is about to play through, so enabling "Sound effects" or raising a volume from zero would fire its own confirmation into a still-muted mixer — the one control whose purpose is to make the game audible would be the only one giving no sign of working. `audible()` defers those by a macrotask.
110. **A win can have four things to say at once, and said together they are one loud noise.** A first clean clear of a tier-ending level that also earns an award fires `levelComplete`, `starCollect`, `achievement` and `difficultyUnlocked`. They are spaced `FANFARE_GAP_MS` apart so they can be counted, and the sequence is cancelled on unmount so tapping Next does not carry the rest of it into the next level.
111. **"Was this the first time?" has to be read before the write, not after.** `difficultyUnlocked` is keyed on `timesCleared === 0` sampled *before* `completeLevel` runs, and awards are counted either side of `recordResult`. Both are derived rather than stored — which is the right design and means the only honest way to detect a change is to measure across the mutation.
112. **The board reports touches; the screen decides what they sound like.** `SkiaBoard` gained `onPressArrow` and `onTapEmpty` rather than a `playSfx` import. This is the same separation the tap handler already documented, and it keeps the renderer free of an `expo-audio` dependency that Jest cannot load.
113. **A tap that hits nothing is not the same event as a tap that is blocked.** `wrongMove` fires on empty board, `collision` on a blocked arrow. They differ in what they cost the player — nothing versus a heart — and using one sound for both would teach that a missed tap costs a life.
114. **The hint notice was being set and never rendered.** `setHintNotice` had four call sites and its state variable was underscore-prefixed and unused, so tapping Hint with none left did nothing visible at all — indistinguishable from a dead button. Found while looking for somewhere honest to put `notification`, which is now the sound that accompanies it.
115. **`levelRestart` belonged to the restart, not to one of the four buttons that cause one.** It was fired from the pause menu's handler, so restarting from the Restart pill, the confirm dialog or either failure overlay was silent. It lives in `doRestart` now — the single place a restart actually happens.
116. **`countdown` was left unwired, deliberately.** There is no countdown anywhere in this game: no pre-level timer, no turn clock, no claim window. Every candidate site was either a per-minute display where a sound would be noise, or an existing moment that already has a voice. Inventing a trigger to reach a round number would have put a sound somewhere it is not earned, which is how an app starts to feel cheap.

### Added in the dog-silhouette pass

117. **A bitmap silhouette is not locked to 16x16, and the seated dog is the first one that needed more.** `sampleArt` reads the artwork's own dimensions, so the library's uniform 16x16 is a convention rather than a constraint. A seated side profile drawn at 16 collapses into an undifferentiated wedge: the neck, the front-leg gap and the tail all fall below one target cell and get voted away. Drawn at 32x32 they survive. The convention is still right for the other 68 bitmaps — a bold outline reads at any size, and uniformity is what lets a new shape be checked against the others at a glance — so this is an exception with a reason, not a new default.
118. **`MIN_CAPACITY_FOR_HARD_TIERS` is the gate a new shape actually has to clear, and it is easy to miss.** The first dog measured 50% fill at the 18x18 reference size against a 55% floor, which silently classified it `FRAGMENTING` and confined it to Tutorial, Easy and Casual — boards of 10 to 24 cells a side, where a detailed silhouette is exactly what does not read. Nothing fails or warns; the shape simply never appears anywhere it would look good. Raising the back and thickening the tail brought it to 61%. Any new shape wants checking against this before it is drawn in detail, not after.
119. **Mean snake length per tier is not a monotone invariant, and the test asserting it was passing on noise.** Adding one shape to the rotation reshuffles which silhouettes each level draws — 122 of 600 changed — and that alone inverted brutal and extremeHard, 11.03/10.85 becoming 11.00/10.85. The capped tiers specify overlapping body ranges (8-19, 9-22, 10-25, 11-28) and have only ~22 levels each to realise them, so which silhouettes a tier happens to draw moves its mean by more than the gap between adjacent tiers. The claim was split the same way decision 87 split the blind-mistake check: `longest` stays strictly monotone across all ten steps, which is the stronger claim and does hold; `mean` is monotone to superHard and then only required to stay well clear of the tiers below. **Board sizes and tiers were unaffected** — adding a shape consumes no extra RNG draws and seeds derive from level id, so unshaped levels rebuilt byte-identical.

### Added in the full-coverage pass

120. **A per-level coin flip cannot cover a shape library, however many levels it is given.** Rotation reached 60 of 138 shapes across 600 levels, and adding levels would not have fixed it: 98 of the 137 silhouettes are `FRAGMENTING`, so they are barred from every demanding tier, and 60 of those also need a board wider than twelve. Between them the two filters leave most of the library competing for shaped levels inside Tutorial, Easy and Casual. Shape choice therefore moved out of the generation loop into `assignShapes`, which sees all 580 levels at once and claims most-constrained-shape-first — a glyph that fits a handful of boards takes one before a circle that fits everywhere does. The RNG draw that decides *whether* a level is shaped stayed in its original position, so **tier moved 0 and size moved 0**: the curve is bit-for-bit what it was.
121. **Full coverage is paid for by the low tiers, because that is where the constrained shapes are allowed.** Shaped levels went 161 to 216, almost all of it in Easy (66% shaped) and Casual (64%), taking their arrow counts from 46.0 to 33.1 and 71.3 to 48.0. Mask fill held at ~88%, but fill is measured against the mask and a silhouette occupies only part of the grid — so those boards *look* emptier even though they are packed. This is the tradeoff `SHAPED_LEVEL_SHARE` was set to 0.25 to avoid, now taken deliberately in exchange for every shape being seen. Whether Easy and Casual read as too sparse is a device judgment, not a metric one. Levels landing in their target difficulty band went 154 to 213.
122. **Deciding things out of play order breaks a rule that only ever looked backwards.** `assignShapes` claims levels in *constraint* order, so by the time the fallback rotation reached level 297 it checked the level before it and picked the dog — which the claim pass had already given to 298. The old single-pass version never needed a forward check because nothing was ever decided ahead of it; lifting the decision out of the loop silently invalidated that assumption. Fixed three ways, because one was not enough: the rotation now avoids the next level's claimed shape as well as the previous one; a repair pass re-checks the *finished* sequence, since two claimed levels can still collide and the claim pass cannot see what it put next door; and the repair works by **swapping** two levels' shapes rather than reassigning one, so the multiset is preserved and fixing adjacency can never cost the coverage guarantee. The seam between onboarding and the main run is now checked too — the two halves choose shapes by completely different means, and nothing had been holding level 20 to 21 to the rule at all.
123. **`infinity` was defined twice and one of them had never rendered.** A bitmap in `shapeArt.ts` and a glyph in `shapeGlyphs.ts` shared the id. `maskFor` resolves glyphs before bitmaps, so the collision did not error — it silently made the bitmap unreachable while it still sat in `SHAPE_NAMES` inflating every count. `shapes.ts` claimed the ids were "asserted unique in the shape tests"; no such test existed. Renaming the bitmap to `infinityBand` recovered a shape that had been dead the whole time, and `check-curriculum.ts` now fails the build on both a duplicate id and a shape that reaches no level. The general lesson is the one worth keeping: a resolution order that falls through is a collision that cannot report itself.
124. **`@react-native-google-signin/google-signin` uses a guarded dynamic `require`.** Just like AdMob (`ads.ts`), `@react-native-google-signin/google-signin` reaches for native TurboModule `RNGoogleSignin` which is absent in Expo Go. Top-level static imports caused Expo Go to crash on launch with `TurboModuleRegistry.getEnforcing: RNGoogleSignin could not be found`. `src/services/auth.ts` now checks `TurboModuleRegistry.get('RNGoogleSignin')` before requiring the module, allowing Expo Go to run cleanly with auth safely disabled.
125. **The library grows by adding a *run*, not by widening a loop.** Extending 600 levels to 1,000 looked like changing `id <= 600` to `id <= 1000`. It is not: `assignShapes` (decision 120) spreads its most-constrained-first coverage guarantee across whatever drafts it is handed, so a longer draft list re-deals the claims and **56 of the first 600 levels changed silhouette** — arrow counts and names with them. `tools/curriculum.ts` now describes the library as a list of `RunSpec`s, each with its own seed, its own endgame and its own slice of the difficulty ramp, and each drafted and shape-assigned independently. Levels 1–600 rebuilt **byte-identical** (`md5sum` on packs 01–12, before and after), which is the property the build header has always promised and which nothing was actually checking.
126. **`1.15 - 0.85` is `0.29999999999999993`, and that was enough to break the freeze.** Parameterising the blind-mistake ramp as `from`/`to` and deriving the step by subtraction moved the last bit of every target in the main run. It changed no level a player could see — `targetBlindMistakes` is rounded to one decimal — but it changed 101 of 580 drafts, so "the old levels are identical" became untrue for a reason invisible in the output. The ramp is stated as `blindScaleFrom` plus `blindScaleStep` instead. The general point: when a refactor must preserve a bit-exact result, express the arithmetic the way the original expressed it, not the way that reads better.
127. **A hardcoded endgame bound is a trap when the endgame moves.** `isPlanningLevel` ended at `id <= 590` to keep shutters off the last ten levels. Level 600 is a multiple of 12, so raising that bound to cover the new levels would have quietly turned the old finale into a planning level. It now asks `RUNS` whether an id falls in *any* run's closing ten, so the exclusion follows the endgames rather than restating one of them.

### Reversed along the way

- **The SVG render layer was deleted in the Skia migration** — `BoardCanvas.tsx`, `ArrowSnake.tsx` and `BoardViewport.tsx`, along with `arrowSnakeMemo`, `heartsUi` and `hintGlow`, which all asserted against a mocked SVG element tree that no longer exists. `heartsUi` was the test that caught the swallowed-tap bug; its coverage is partially replaced by `__tests__/render/heartsThroughSkia.test.tsx`, which exercises the same chain minus the gesture-handler wiring. That gap is real and recorded here rather than glossed over.
- **The celebration was removed in the UI pass**, by request — `Celebration.tsx` and its sixty confetti pieces are gone. The 900ms win-overlay delay it shared the moment with was _kept_, and is now 1150ms: the particles were decoration, but the pause is what stops a modal landing on top of the last snake threading out. In git history at `acd4fa6`.
- The `slide-and-stop` rule variant was built, tested, then **removed** once the reference screenshots settled the mechanic. In git history at `b725e00`. Phase 15 revisited the same goal and reached it by a different route — see decision 47.
- A two-pass snake growth fallback (retry leftover corridors at a shorter minimum length) was written for the perforated shapes, then **removed**: the rebuild came back byte-identical, because arrow counts were already being met. The undershoot was structural, not density.
- Filtering demanding tiers on **island count alone** was tried and **reverted** — it made the top tiers measurably easier. See decision 56.
- The first curriculum declared arrow counts directly. 37 of 50 plans were physically impossible. Replaced with capacity-derived counts.

## Commands

| Command                              | Purpose                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `npm run verify`                     | typecheck + tests + level validation. Run before every commit |
| `npm start` / `npm run start:tunnel` | Expo dev server (use tunnel on this machine — see below)      |
| `npm run levels:check`               | prove every curriculum plan fits its shape                    |
| `npm run levels:build`               | regenerate all 1,000 levels (deterministic, ~4 min)           |
| `npm run levels:validate`            | re-verify the level JSON on disk                              |
| `npm run levels:preview`             | render every theme to an HTML page                            |

## Dev environment notes

Windows Firewall on this machine has **enabled Block rules for inbound `node.exe`**
on the Public profile, and the Ethernet adapter is categorised Public — so Expo Go
cannot reach the LAN dev server. The Wi-Fi adapter also has no DHCP lease
(`169.254.x.x`). **Use `npm run start:tunnel`.** Admin fix in
[TESTING.md](TESTING.md).

## Testing build

`UNLOCK_ALL_LEVELS` in `src/config/index.ts` is currently **true**. Every level is
open, level select carries a jump-to-number box, and both the menu and level
select show a TESTING badge. Set it to `false` for production; nothing else needs
changing.

## Pending work

Full breakdown, with the release checklist, in [PROGRESS.md](PROGRESS.md).

- **You:** play through on device. The things to judge are pacing, whether the
  packed boards read or overwhelm, and the 5-heart budget.
- **Phase 19 (deferred by request):** the level design document covering all 1,000
  levels. Two questions still open on its fields and format.
- **Assets:** all 31 audio files exist and all 31 are now played, but every one is
  **synthesised by `npm run sounds:build`, not recorded or composed** — clean and
  plain, in the register of early system sounds. Replacing any is dropping a file
  in and changing one line of `audioAssets.ts`. Icons and splash are likewise
  generated; rerun `npm run icons:build` after any brand change. The genuinely
  missing artwork is the **Play Store listing set** — 512×512 icon, 1024×500
  feature graphic, screenshots — which cannot be generated and blocks submission.
- **Accounts:** AdMob ([ADS_SETUP.md](ADS_SETUP.md)), Play Console ([RELEASE.md](RELEASE.md)).
- **Unproven on hardware:** the ads path has never run against a real SDK, and the
  1,000-level library has never been played end to end by a person.

## Risks

- **The curve is unvalidated by humans.** Every level is provably solvable and lands in its target band, but `expectedBlindMistakes` models a _random_ tapper, not a real one. A real player reads partially — better than random, worse than perfect — so the true difficulty is somewhere below the model. Expect to retune `tools/curriculum.ts` after playtesting.
- **Tracing difficulty is partly a rendering property.** Stroke weight, cell size, and corner radius change how hard a board feels. Retune the bands on device, not in the abstract.
- **Large boards on small phones.** Mastery levels are 12×12; on a narrow screen cells get small. Worth checking on the smallest device you have.
- **Ads are unexercised.** The code path is written but has never run against a real SDK, because installing it breaks Expo Go. First dev-client build is where that gets proven.

## Known issues / technical debt

- The ad service has no unit tests — a thin I/O wrapper whose only real behaviour is degrading gracefully, which is exercised by the app running without it. `services/audio.ts` is the same, but the layer *above* it is now covered: `__tests__/components/sound.test.tsx` pins `withClick`'s ordering and `useSheetSound`'s edge-triggering, which sit under every button in the app and whose failure mode is silence — something no other test would notice.
- **The mix has never been heard on a device.** Every sound is wired, spaced and gain-balanced on reasoning rather than on listening: `SFX_GAIN` was written before any file existed, and the fanfare spacing is an estimate. Expect to retune both on hardware — particularly `wrongMove`, which fires on any tap that misses and is the most likely to be found annoying.
- Component test coverage is thin but no longer absent: the board's tap surface and `ArrowSnake`'s memo are covered (`heartsUi`, `arrowSnakeMemo`). Every other screen is still covered only by the bundle building and by manual testing — and decision 79 is what that gap costs.
- `npm audit` reports moderate advisories from the Expo dependency tree; none are in code paths this app uses.
- The IDE's JSON schema flags `module: "preserve"` in `tsconfig.json`. Valid in TS 5.4+, inherited from `expo/tsconfig.base`; `tsc` accepts it.

---

_Update discipline: append to Completed, adjust Pending, log any new decisions/risks after each approved phase._
