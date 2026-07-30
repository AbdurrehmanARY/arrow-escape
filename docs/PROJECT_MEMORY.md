# PROJECT_MEMORY.md — ArrowPath

> **Authoritative source of project state.** Read this before starting any task. Update it after every completed phase.
> **Last updated:** end of Phase 18 — pause menu, celebration removed, one shared screen header.

---

## Status

**Code-complete at 600 levels.** Playable end to end: 600 generated and
solver-verified levels across 114 silhouettes and **ten** difficulty tiers, six
themes, animation, hearts, hints, persistence, navigation, settings, first-run
teaching, and an ads path that is implemented but switched off.

What is *not* done is everything that needs your accounts or your assets — audio
files, an app icon, an AdMob account, a Play Console listing. Those are listed in
[RELEASE.md](RELEASE.md) and [ADS_SETUP.md](ADS_SETUP.md).

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

Difficulty therefore lives entirely in **reading the board**. Wrong *reads*, not
wrong *plans*, are the failure mode. Full proof and the difficulty model are in
[MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

### …and the one exception, added in Phase 15
The paragraph above holds on **560 of the 600 levels**. The other 40 carry a
`shuts` gate — a cell that is open while its colour is on the board and seals for
good once the last of that colour leaves. That lets a tap *take a route away*,
which is the one thing that breaks monotonicity, so on those boards order matters,
deadlock is real, and `GameStatus` has a `stuck` value for it.

The distinction is enforced, not merely intended: `analyze` reports a
**`blunderRate`** — the share of legal taps that quietly lose the level — and the
level tests assert it is above zero on every shutter board and exactly zero on
every other one. Walls and `opens` gates are also available and are both fully
monotone; they buy dependency *depth*, not risk.

## Architecture decisions (locked for v0.1)
1. **Level pipeline = hybrid generate-and-curate.** Shape mask + plan → generator → solver/validator → level JSON. Every shipped level is verified solvable *and* has its recorded solution replayed, in CI.
2. **Rendering = react-native-svg**, one `<Polyline>` per snake with rounded joins. Not Skia — only one arrow animates at a time.
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
26. **Levels are stored as walks, not coordinate lists.** A body is a head plus one character per step (`"4,7:DDRR"`), which is roughly a quarter the size of `[[r,c],…]`. All 600 levels are 159 KB.
27. **Levels ship in packs of 50, not one file each.** Metro charges real overhead per module and nothing ever needs a level in isolation. 12 modules instead of 600, decoded on demand and cached.
28. **Silhouettes are bitmaps, not formulas.** A circle is an inequality; a guitar is not. 74 hand-drawn 16x16 outlines, supersampled to any board size — point sampling loses thin features like a crown's points at small sizes.
29. **Masks are repaired after sampling.** Isolated cells and regions too small to hold a snake are pruned, so reported capacity is capacity the generator can actually reach. Without it, generation starves for reasons that look mysterious.
30. **The generator repairs unsolvable boards rather than resampling.** Solvability needs an acyclic blocking graph, and at Extreme densities nearly every random board has a cycle. Reversing a body flips that arrow's exit direction without touching the silhouette, and every cycle contains a stuck arrow — so flipping stuck arrows breaks cycles far more often than it creates them. This turned a hard build failure at level 157 into all 600 levels in 28 seconds.
31. **Difficulty is mixed, not monotonic, after level 20.** A predictable ramp is what makes a long game feel like a treadmill. Tiers are drawn from a weighted mix that shifts across the game, so the average climbs while any single level is a surprise. The last ten are forced to Extreme so the game does not end on a shrug.
32. **Oversized boards have a minimum cell size and pan instead of shrinking.** Fitting a 27x30 board to a phone gives ~12dp cells: unreadable and untappable. Cells stay at 26dp and the viewport scrolls.
33. **Touch stays exact at every zoom level for free**, because the per-cell targets live inside the transformed view. No coordinate conversion by hand, which is where this normally breaks.
34. **The grid is one tiled SVG pattern, not one node per cell.** An 810-cell board would otherwise cost more in grid nodes than in every arrow combined.
35. **600 levels are grouped into 12 chapters**, matching the pack layout exactly so a chapter is also the unit of data loaded. A chapter opens once the previous one has been *started*, not finished — gating on completion would strand a player stuck on one board behind 550 levels they cannot touch.
36. **Chapter names are fixed, not derived.** Contents shift whenever the curriculum is retuned; a chapter a player remembers finishing must not silently rename itself between builds.
37. **The app icon is generated from the game's own arrow geometry** (`tools/make-icons.ts`), rasterised with `pngjs` — a thick rounded line is a distance test, a head is three half-plane tests, and 4x4 supersampling handles the edges. It is centred on its *drawn* bounds rather than its path coordinates, because the stroke radius and arrowhead overhang by different amounts per axis.
38. **The pan/zoom camera maths is a pure module** (`components/camera.ts`), because it runs as a worklet where a debugger is little help, and an off-by-one in the overhang lets a player lose a 27x30 board off-screen.
39. **The win overlay waits 900ms.** The last snake threading out is the most satisfying moment in the game, and covering it instantly threw that away. The celebration fires immediately; the overlay follows.
40. **Confetti is one shared value read by sixty derived styles**, not sixty animations. Each piece's path is projectile motion — launch angle, speed, gravity — on constants fixed at spawn, because linear fades read as a screensaver.
41. **The celebration is derived from the win, not mirrored into state.** An `active` prop that goes false and true again on replay re-fires it; a separate nonce would have been a second signal meaning the same thing, and a second thing to get out of step.
42. **Perfect-read streaks count replays.** The streak is a statement about how someone is playing *now* rather than a permanent record, which is what makes it worth chasing. It is only shown from two upward — announcing "streak: 1" on every clean level cheapens it.
43. **No double-tap gesture on the board, ever.** The board is covered edge to edge in tap targets, so a double-tap cannot be told apart from two deliberate taps on an arrow — and since a wrong tap costs a heart, that ambiguity was charging two hearts for one gesture. Fit-to-screen is a button. Any future board gesture must survive the same question.
44. **Tap feedback comes from `resolveTap`, never from the safe-move set.** They answer different questions, and `findAllSafeMoves` returns nothing at all on an unsolvable board, so every tap would have played the collision sound.
45. **`UNLOCK_ALL_LEVELS` is read in exactly one place** (`playableUpTo`). `highestUnlocked` stays pure and honest about real progress, so the flag cannot corrupt a save and turning it off needs no migration. While on, the menu and level select both show a TESTING badge — a build flag that looks like production is how one ships by accident.
46. **The invisible tutorial is not fully possible here.** The GDD asks the design to teach with no text (§6), which works for rules a player can infer by watching. Nothing about a board of ropes reveals that the arrowhead is what matters. Three one-time coach cards, each fired by the situation it explains, are the smallest honest compromise.

### Added in Phases 15–17
47. **Order is made to matter by taking a route away, not by moving an arrow.** The long-standing answer to "can this game have planning in it" was "only by letting blocked arrows move", which costs the no-dead-ends guarantee, the microsecond solver and every existing level. A gate that *shuts* achieves the same thing — a tap that adds a constraint — with no change to what a tap does and no change to any level that does not use one.
48. **Gate polarity is one word, and it is the difference between two games.** `opens` is monotone: it blocks until its colour has left, so greedy still always works and it buys depth only. `shuts` is the inverse and breaks monotonicity on purpose. Both share all their machinery.
49. **`stuck` is not folded into `failed`.** A player who deadlocks a shutter board still holds every heart, and showing them a spent-hearts screen would teach the wrong lesson about what went wrong. Separate status, separate overlay, and the fail copy's promise that "the board behind this is still winnable" is now conditional — it can be false, and the player can check.
50. **A shutter board can be lost several taps before it looks lost**, so `isDoomed` runs after every move and surfaces the overlay early. It costs nothing on the 560 levels with no shutter: it returns false without looking at the board.
51. **`solve` branches on `hasShutters`.** Kahn's peel without them, depth-first search memoised on the surviving arrow set with them, under a budget that reports `unknown` rather than `unsolvable`. An unproven board must never ship as a proved one.
52. **The blocking graph must not skip self-edges for gates.** Skipping self is right for a body lying across its own ray and exactly wrong for an arrow whose own colour keys the gate in front of it. `castRay` had it right; the solver disagreed, and only a property test found it.
53. **Colour is the one thing in this game that carries information.** It links an arrow to the gate it controls, so it is drawn from a colour-blind-safe set and gates carry a shape cue as well. It also makes arrows easier to tell apart, which makes a level *easier* — so a level only spends a colour where a gate earns it back.
54. **Ten tiers, five colour pips.** Five tiers over 600 levels made "Hard" span a range wide enough to mean nothing. Ten bands are narrow enough that the label is a promise — but ten distinguishable dot colours do not exist in a palette that also works for colour-blind players, so the pips pair up and the tier *name* carries the precision.
55. **A failed snake start must not consume an arrow slot.** Invisible at bodies of 2–6 and ruinous at 5–14: on a 30x30 board most starts paint themselves into a corner, so boards came out at half their intended density. Fixing it took nightmare levels from 70 to 161 average blind mistakes.
56. **A silhouette caps how hard a level can be, and capacity dominates islands.** Arrows in separate regions can never block each other, so a fragmenting shape raises how many are free at once; and a narrow shape on a 28x28 board simply holds fewer snakes. Filtering the demanding tiers on islands *alone* made them easier, because it left a pool of detailed but thin outlines. Both filters together, measured rather than declared.
57. **Glyphs are strokes, not bitmaps.** A `1` drawn at 16x16 is a two-pixel column: sampled to a 9-wide board it is either gone or four cells thick, and no single drawing survives both ends. A stroke is a distance function, so thickness is chosen at the target size — at least a cell wide, never wide enough to fill in the counter of an `O`.
58. **Procedural shapes perforate the board rather than outlining it.** A bitmap says where the board ends; a honeycomb or a maze carves corridors through the middle, so snakes must bend constantly — a difficulty device dressed as decoration.
59. **The two gate coach cards fire before the first tap**, unlike every other card, which explains something that has already happened. A gate cannot be inferred by watching, and a shutter would otherwise be met by losing a level with every heart still in hand.

### Added in the board-scale and touch pass
60. **A `Pan` gesture with no activation threshold silently eats taps.** Gesture-handler cancels whatever is underneath the moment a pan claims the touch, and a pan with no offset claims it on the first pixel of movement — which every real tap has. This was the cause of "I have to tap more than once", and it looked like a rendering or hit-testing problem for a long time. `PAN_SLOP` is now shared between the pan's activation offset and the tap's `maxDistance`, so there is no band of movement that is neither.
61. **Never mix React Native `Pressable`s with gesture-handler gestures over the same area.** The two touch systems do not negotiate. This is the second bug traced to that combination (the first charged two hearts for one double-tap), and the board now has no `Pressable` on it at all.
62. **Board hit testing is arithmetic, not views.** One tap surface plus a cell lookup, instead of a view per occupied cell — a thousand fewer views on a 60x60 board, and it arbitrates correctly with pan and pinch. Near-misses within ~0.85 of a cell select the nearest snake, which is what makes a small cell tappable at all.
63. **Press feedback is a shared value, not state.** An arrow dims on touch-*down*, read inside each snake's animated style. A `useState` would re-render a hundred-snake board twice per tap — to acknowledge a tap, which is the one thing that must not cost frames.
64. **Taps during the exit animation are accepted, not dropped.** The old guard's stated reason — that the board was "mid-change" — was never true; `applyOutcome` runs when the tap is accepted, so only the drawing lags. Refusing them cost real taps, and slowing the animation to 720ms would have made every second tap vanish.
65. **Board size and difficulty are not independent, and the coupling is violent.** Raising Medium from 14x14 to 30x30 multiplied its arrow count fivefold; `expectedBlindMistakes` grows faster than area, so a 40x40 Hard board measured **697** against a target of 45, and the top three tiers could not be generated at all. Big boards had to become *sparser* boards. Any size change requires re-deriving every fill and every blind target — `npm run levels:probe` does it in seconds instead of the half hour a full build now takes.
66. **Max zoom must have an absolute floor, not only a multiple of fit.** `3.5x fit` is generous on a board that nearly fits and meaningless on one that does not: a 60x60 board fits at 0.23, so the ceiling was 0.8 and the player could never see a cell at its designed size — on exactly the boards where reading one arrowhead matters most.
67. **Sampling a periodic field at cell centres aliases catastrophically.** When a pattern's period is commensurate with the grid, every sample lands in the same phase: `starTiling` at 16x16 and `lattice` at 20x20 came out *completely empty*, every sample a hundredth below the threshold. Field shapes are supersampled like the bitmaps now, and a mask that still comes out near-empty falls back to the open board rather than producing an ungeneratable level.
68. **The repair pass has to scale with the board.** A fixed forty flips is right for a knot of four and hopeless for a knot of sixty; level 21 simply failed to build. It now flips a quarter of the knot per round, with a budget proportional to arrow count, and drops back to single flips for the last quarter of its rounds.

### Added in the UI pass
69. **The play screen has one row of chrome, not two.** Back, settings and the hint count were three tap targets along the top edge of a screen whose only verb is "tap an arrow", and none of them was ever wanted mid-move. They are behind a single pause button now.
70. **A pause menu is worth building even with no clock to stop.** "Pause" is a slight misnomer — nothing is running — but it is the word players look for when they want to stop and do something else, and a truer one would be accurate and useless.
71. **Restart is not the primary action on the pause sheet.** It is the most destructive option there, and a sheet that opens with the destructive option highlighted trains people to tap it by reflex. Tapping the scrim resumes, because nobody opens a pause menu meaning to lose their place.
72. **The HUD needs a progress bar now that boards are 60x60.** An arrows-left count says nothing without knowing the starting number, and on a board four screens wide "am I nearly done" was a question nothing on screen could answer.
73. **Three screens had each hand-rolled the same header**, including three copies of a `width: 44` spacer to fake optical centring against the back button. `ScreenHeader` centres on the layout instead, so the title does not shift depending on what is in the right-hand slot.

### Reversed along the way
- **The celebration was removed in the UI pass**, by request — `Celebration.tsx` and its sixty confetti pieces are gone. The 900ms win-overlay delay it shared the moment with was *kept*, and is now 1150ms: the particles were decoration, but the pause is what stops a modal landing on top of the last snake threading out. In git history at `acd4fa6`.
- The `slide-and-stop` rule variant was built, tested, then **removed** once the reference screenshots settled the mechanic. In git history at `b725e00`. Phase 15 revisited the same goal and reached it by a different route — see decision 47.
- A two-pass snake growth fallback (retry leftover corridors at a shorter minimum length) was written for the perforated shapes, then **removed**: the rebuild came back byte-identical, because arrow counts were already being met. The undershoot was structural, not density.
- Filtering demanding tiers on **island count alone** was tried and **reverted** — it made the top tiers measurably easier. See decision 56.
- The first curriculum declared arrow counts directly. 37 of 50 plans were physically impossible. Replaced with capacity-derived counts.

## Commands
| Command | Purpose |
|---|---|
| `npm run verify` | typecheck + tests + level validation. Run before every commit |
| `npm start` / `npm run start:tunnel` | Expo dev server (use tunnel on this machine — see below) |
| `npm run levels:check` | prove every curriculum plan fits its shape |
| `npm run levels:build` | regenerate all 50 levels (deterministic) |
| `npm run levels:validate` | re-verify the level JSON on disk |
| `npm run levels:preview` | render every theme to an HTML page |

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
- **You:** play through on device; report anything that feels wrong about pacing, board size, or the 5-heart budget. **Phases 15–17 are the ones to test** — gates, shutters, ten tiers, longer snakes, the expanded shape library.
- **Phase 18 (not started):** UI/UX overhaul across all seven surfaces, including a pause menu, which does not exist yet. Includes removing the celebration effects.
- **Phase 19 (not started):** the level design document / PDF covering all 600 levels. Two questions still open on its fields and format.
- **Phase 20 (not started):** performance pass. Needs a real mid-range Android device to be worth doing.
- **Assets:** audio files (`assets/audio/README.md`). Icons and splash are generated — rerun `npm run icons:build` after any brand change.
- **Accounts:** AdMob ([ADS_SETUP.md](ADS_SETUP.md)), Play Console ([RELEASE.md](RELEASE.md)).
- **Then:** validate the curve against real players before extending past 50 levels.

## Risks
- **The curve is unvalidated by humans.** Every level is provably solvable and lands in its target band, but `expectedBlindMistakes` models a *random* tapper, not a real one. A real player reads partially — better than random, worse than perfect — so the true difficulty is somewhere below the model. Expect to retune `tools/curriculum.ts` after playtesting.
- **Tracing difficulty is partly a rendering property.** Stroke weight, cell size, and corner radius change how hard a board feels. Retune the bands on device, not in the abstract.
- **Large boards on small phones.** Mastery levels are 12×12; on a narrow screen cells get small. Worth checking on the smallest device you have.
- **Ads are unexercised.** The code path is written but has never run against a real SDK, because installing it breaks Expo Go. First dev-client build is where that gets proven.

## Known issues / technical debt
- Audio and ad services have no unit tests — both are thin I/O wrappers whose only real behaviour is degrading gracefully, which is exercised by the app running without either.
- No component-level tests. The reducer, stores, storage and geometry are covered; the React tree is only covered by the bundle building and by manual testing.
- `npm audit` reports moderate advisories from the Expo dependency tree; none are in code paths this app uses.
- The IDE's JSON schema flags `module: "preserve"` in `tsconfig.json`. Valid in TS 5.4+, inherited from `expo/tsconfig.base`; `tsc` accepts it.

---
*Update discipline: append to Completed, adjust Pending, log any new decisions/risks after each approved phase.*
