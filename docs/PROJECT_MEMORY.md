# PROJECT_MEMORY.md — ArrowPath

> **Authoritative source of project state.** Read this before starting any task. Update it after every completed phase.
> **Last updated:** end of Phase 1, after the arrow model was confirmed from reference screenshots and the engine rebuilt around it.

---

## Completed
- Blueprint received and adopted (Technical Director mandate).
- Game Design Document, Technical Design Document, and roadmap drafted.
- **Phase 1 — core domain + scaffold.**
  - Expo SDK 57 / RN 0.86 / React 19.2 / TypeScript 6.0 scaffold, strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  - Pure domain layer in `src/game/`: `types`, `board`, `rules`, `solver`, `hints`, `ascii`, `diagnostics`, `index`.
  - 112 unit tests, 7 suites, green. 96% statements / 91% branches / 99% lines on `src/game`. Thresholds enforced in `jest.config.js`.
  - Solver validated against an exhaustive brute-force reference over 500 random boards, with both verdicts well represented.
  - **Renderer:** `react-native-svg` board with per-theme grid patterns, snakes drawn as single polylines with rounded joins, and per-cell touch targets. Six themes shipped.
  - `GameScreen` — a playable 8×8 tangle with the hearts HUD and a live theme picker.
  - `tools/preview-themes.ts` renders every theme to an HTML page from the app's own geometry module.
  - Verified: `tsc --noEmit` clean; Metro bundles for Android (705 modules).

## The mechanic (settled)
Arrows are **snakes**: connected chains of cells with an arrowhead at one end.
Tapping sends the snake out through its head; the body threads out along the trail
the head clears. An arrow can leave **iff the straight ray from its head to the
edge is clear** — its own body never blocks it. A blocked tap changes nothing and
**costs a heart**; five spent hearts fails the level.

Confirmed against reference screenshots (multi-cell bodies, whole-body red flash
on failure, five-heart counter draining across levels).

### The load-bearing consequence
**Tap order cannot lose a level.** A tap only ever removes a snake, and removing a
snake can never block another, so a free arrow stays free. Greedy always works and
a solvable board can never become stuck.

Difficulty therefore lives entirely in **reading the board**: finding a head in the
tangle, working out its direction, and tracing its ray to the edge. Wrong *reads*,
not wrong *plans*, are the failure mode. Full proof, evidence, and the difficulty
model in [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

## Architecture decisions (locked for v0.1)
1. **Level pipeline = hybrid generate-and-curate** (shape mask + params → generator → TS solver/validator → human curation → level JSON). Guarantees solvability; makes 50→600 tractable solo.
2. **Rendering = react-native-svg + plain views**, not Skia. One `<path>` per snake with round joins/caps; only one arrow animates at a time. Skia deferred as an escape hatch.
3. **Animation = Reanimated 3.** Release is a `strokeDashoffset` drive along the exit path so the body threads after the head.
4. **State = Zustand (persistent) + local `useReducer` (live board).** Live board state stays out of the global store.
5. **Storage = AsyncStorage**, versioned save schema. MMKV noted as an upgrade path.
6. **Domain layer `game/` is pure TS** — same code runs in-app (hints) and in off-device tooling (generate/validate). Single source of truth for rules.
7. **Ads = AdMob rewarded only, hints only.** Offline policy: 3 seed hints, preload one ad when online, graceful "connect to earn a hint" fallback.
8. **Framework = Expo (managed) + EAS Build + Dev Client**, TypeScript strict.

### Added in Phase 1
9. **An arrow is a body, not a cell.** `Arrow.body` is an ordered cell list, head first. Bodies must be connected, non-self-touching simple paths — validated at build time.
10. **Head direction is inferred, never stored.** An arrowhead always continues its last segment, so `dir` is a function of the geometry. Storing it would create a second source of truth a hand edit could desync. A supplied `dir` is validated against the body and a mismatch is rejected; only a single-cell arrow must state one.
11. **An arrow never blocks itself.** Each segment vacates its cell as the one ahead advances, so a body crossing its own ray is fine. This is what keeps spiral and hook shapes playable, and it is tested explicitly.
12. **Board topology is split from play state** (`Board` vs `BoardState`), and hearts live in a third type (`PlaySession`) so the solver and validator never see them.
13. **Occupancy is a flat `Int32Array`** mapping cell → arrow index, making `castRay`'s check O(1) per step.
14. **`solve()` needs no search** — Kahn's algorithm on the blocking graph. Solvable iff acyclic. Microseconds per level, so CI validation of hundreds of levels is free.
15. **Difficulty metrics replaced "solution depth"** with tracing load (`avgBodyLength`, `avgTurns`, `crowding`) and guess pressure (`minFrontier`, `avgFrontier`, `expectedBlindMistakes`).
16. **`expectedBlindMistakes`** — expected hearts a random-tapping player burns, derived as a sum of geometric expectations. Graded against the level's hearts, it is the primary curation dial.
17. **Hints are "the first move of a winning line"**, not a heuristic. Strongest possible guarantee, and free given the solver. Hints cost a rewarded ad, so a hint that spends a heart is ruled out structurally rather than tested for.
18. **ASCII notation (`ascii.ts`) is production code** — uppercase letter = head, lowercase = body. Shared by tests, the generator, and validator error messages.
19. **`diagnostics.ts` is itself unit-tested**, so the on-device green light cannot silently rot into a check that always passes.
20. **Path aliases** (`@game`, `@theme`, `@components`, `@screens`, …) work in both Metro and `tsc`, with bare and wildcard forms.
21. **A theme is data, not code.** `Palette` + `ArrowStyle` + `BoardStyle` are set independently, every measurement is a ratio of one cell, and **the renderer never branches on a theme's `id`**. Adding a theme is a registry entry; adding a new *kind* of look is one field plus one branch. Six themes ship: Paper, Midnight, Noodles, Bold, Blueprint, Graphite.
22. **`ArrowStyle.colorful` is the one theme option with gameplay effect** — per-snake colour makes levels materially easier, because telling snakes apart is the skill. Themes using it say so; difficulty metrics assume it is off.
23. **Drawing maths lives in a pure module** (`components/arrowGeometry.ts`) with no React and no SVG elements. It is unit-tested, and `tools/preview-themes.ts` renders the whole theme set to HTML from that same module — so a preview cannot disagree with what ships.
24. **Touch targets are real `Pressable` views, one per occupied cell** — not SVG `onPress`. Hit-testing a transparent stroke is inconsistent across platforms, and a full-cell target is the better tap regardless.
25. **The grid pattern is a playing aid, not decoration.** Without visible cell structure a player cannot tell whether two ropes share a column, which is the core judgement of the game.

### Reversed in Phase 1
- The `slide-and-stop` rule variant was built, tested, and then **removed** once the reference screenshots settled the mechanic. It is in git history at commit `b725e00` if a later pack ever wants it. Carrying an unused variant through eight more phases would have branched every function and doubled every test for nothing.

## Folder structure
See TDD §4 (authoritative). Key dirs: `src/game` (pure domain), `src/state`, `src/screens`, `src/components`, `src/services`, `src/data/levels`, `src/theme`, `tools/`, `__tests__`, `docs/`.

## Coding standards
See TDD §15. TS strict; doc comment on every export explaining *why* it exists; file headers; consistent naming.

## Technologies
Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6.0, Jest + jest-expo, tsx, @expo/ngrok. Planned: react-native-svg, react-native-reanimated, Zustand, AsyncStorage, expo-audio, react-native-google-mobile-ads.

## Commands
| Command | Purpose |
|---|---|
| `npm run verify` | typecheck + full test suite (run before every commit) |
| `npm test` | Jest |
| `npm run test:coverage` | Jest with coverage thresholds |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | Expo dev server (LAN) |
| `npm run start:tunnel` | Expo dev server via ngrok — needed on this machine, see below |

## Dev environment notes
The dev machine's Windows Firewall has **enabled Block rules for inbound
`node.exe`** on the Public profile, and its Ethernet adapter is categorised
Public — so Expo Go cannot reach the LAN dev server. Its Wi-Fi adapter also has
no DHCP lease (a `169.254.x.x` APIPA address), so only Ethernet
(`192.168.10.253`, gateway `192.168.10.1`) actually works. **Use
`npm run start:tunnel`.** Fixing the LAN path needs an admin PowerShell — the
commands are in [PHASE_1_TESTING.md](PHASE_1_TESTING.md).

## Pending work (next up)
- **You:** run the Phase 1 build on device (see [PHASE_1_TESTING.md](PHASE_1_TESTING.md)), pick a default theme, and confirm the mechanic feels right.
- **Then Phase 2:** motion and state — the thread-out release animation (`strokeDashoffset` along the exit path), the blocked shake, the heart-drain transition, and the `gameReducer` that sequences them. The static renderer is already done.
- **Also Phase 2:** persist the chosen theme in `settingsStore`, and re-validate the difficulty bands on device now that stroke weight and cell size affect how hard a board is to read.

## Deferred features (post-v0.1)
Coins/economy, undo/redo, leaderboards, daily challenges, online/multiplayer, cloud saves, live events, cosmetics, battle pass, seasonal content, IAP. Level count beyond 50 (target 600). Additional layout shapes. Crash reporting. ESLint/Prettier config (deps installed, not yet configured).

## Risks
- **Generator yield and quality** — now the top risk. The generator must grow self-avoiding snakes inside a shape mask, reject boards whose blocking graph has a cycle, and *hit a target* `expectedBlindMistakes` band. Solvability checking is free, so it can afford to generate and discard aggressively — but shape-constrained growth that also hits a difficulty target is the hard part.
- **Tracing difficulty is a rendering property, not just a data one.** Two boards with identical metrics can feel very different depending on stroke width, corner radius, and cell size. Phase 2's renderer will change what the metrics *mean*, so the difficulty bands must be re-validated on device after Phase 2, not before.
- **Ads + offline tension** — mitigated by the seed-hints + preload policy.
- **Scope creep toward 600 early** — explicitly held; ship and validate 50 first.

## Known issues / technical debt
- ESLint + Prettier dependencies are installed but not configured (no `eslint.config.js` yet). Fold into Phase 2.
- `renderAscii` derives a display letter from `arrow.id` when it is a single character and falls back to the index otherwise. Fine for fixtures; revisit if level ids ever become long strings.
- The IDE's JSON schema flags `module: "preserve"` in `tsconfig.json` as invalid. It is valid in TS 5.4+ and inherited from `expo/tsconfig.base`; `tsc` accepts it. Stale schema, not a real error.

## Future improvements
MMKV if save writes get hot; Skia if we add particle/trail effects; crash reporting; cloud save.

---
*Update discipline: append to Completed, adjust Pending, log any new decisions/risks after each approved phase.*
