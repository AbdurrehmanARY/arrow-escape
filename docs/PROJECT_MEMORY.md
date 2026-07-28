# PROJECT_MEMORY.md — ArrowPath

> **Authoritative source of project state.** Read this before starting any task. Update it after every completed phase.
> **Last updated:** end of Phase 10 — first-run teaching, state-layer tests, and lint. Awaiting device testing, audio assets, and store accounts.

---

## Status

**Phases 1–9 are code-complete.** The game is playable end to end: 50 generated
and solver-verified levels, six themes, animation, hearts, hints, persistence,
navigation, settings, and an ads path that is implemented but switched off.

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
17. **Touch targets are real `Pressable` views**, one per occupied cell — not SVG `onPress`, which hit-tests inconsistently across platforms.
18. **Arrow counts in the curriculum are derived from mask capacity, never declared.** A snake occupies several cells; "18 arrows" inside a 56-cell heart is arithmetic, not design. `npm run levels:check` proves every plan fits before generating.
19. **High difficulty is many moderate snakes, not a few enormous ones.** A long rope is easy to follow; a dense field of similar short ones is where tracing genuinely hurts. Grids grow faster than bodies across the curve.
20. **Unlocking is derived from the completed set, never stored** — a stored "highest unlocked" can drift and lock a player out of levels they finished.
21. **Progress saves the moment a level is cleared**, not when the win overlay is dismissed.
22. **Audio degrades to silence.** Every call is a no-op when the asset is missing, so the game ships and plays without any audio files.
23. **`.npmrc` pins `legacy-peer-deps=true`.** Expo 57 ships a `react-dom` whose peer range excludes the pinned React; mixing strict and legacy installs against one tree prunes packages and silently breaks the babel/jest toolchains.
24. **Metro caches transformed code with the compiling plugin's version baked in.** Any dependency version change needs `npm run start:clear`, or you get an error naming two versions of a package that only exists once. `start:tunnel` clears by default.
25. **A `require` of a missing asset cannot be caught.** Metro resolves it at build time, so try/catch is wishful thinking and the app ships a broken module-graph entry. Optional assets go in an explicit registry (`services/audioAssets.ts`) that starts empty.
26. **The invisible tutorial is not fully possible here.** The GDD asks the design to teach with no text (§6), which works for rules a player can infer by watching. Nothing about a board of ropes reveals that the arrowhead is what matters. Three one-time coach cards, each fired by the situation it explains, are the smallest honest compromise.

### Reversed along the way
- The `slide-and-stop` rule variant was built, tested, then **removed** once the reference screenshots settled the mechanic. In git history at `b725e00`.
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

## Pending work
- **You:** play through on device; report anything that feels wrong about pacing, board size, or the 5-heart budget.
- **Assets:** audio files (`assets/audio/README.md`), app icon and splash.
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
