# PROJECT_MEMORY.md — ArrowPath

> **Authoritative source of project state.** Read this before starting any task. Update it after every completed phase.
> **Last updated:** end of Phase 1 (rules engine built and tested; awaiting device test + rule decision).

---

## Completed
- Blueprint received and adopted (Technical Director mandate).
- Game Design Document, Technical Design Document, and roadmap drafted.
- **Phase 1 — core domain + scaffold.**
  - Expo SDK 57 / RN 0.86 / React 19.2 / TypeScript 6.0 scaffold, strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  - Pure domain layer in `src/game/`: `types`, `board`, `rules`, `solver`, `hints`, `ascii`, `diagnostics`, `index`.
  - 80 unit tests, 5 suites, green. 92% statements / 89% branches / 94% lines on `src/game`. Thresholds enforced in `jest.config.js`.
  - Both solver engines validated against an exhaustive brute-force reference over ~1,300 random boards.
  - `EngineCheckScreen` — on-device self-check plus a side-by-side playable comparison of the two rule variants.
  - Verified: `tsc --noEmit` clean; Metro bundles for Android (587 modules).

## ⚠️ Open decision — blocks Phase 2
**Which rule variant does ArrowPath ship?** See [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

Phase 1 proved that under the GDD's rule as written (`escape-only`), **tap order
cannot matter** — every solvable board is cleared by any order, and a solvable
board can never deadlock. The game is a spatial-search game, not a logic game.

- **Option A — keep `escape-only`.** No code change. Difficulty comes from board density and how few arrows are tappable at once (Parking Jam–style). Deadlock UX can be deleted. Cost: no "aha".
- **Option B — switch to `slide-and-stop`.** A blocked arrow slides up against its blocker instead of doing nothing. Restores real ordering, real deadlock, real planning. Cost: harder level generation, plus a slide animation in Phase 2. **Recommended**, because it is the game the GDD describes.

Both variants are implemented, tested, and shippable today. `RuleVariant` is a
per-level field, so the decision is one line per level file.

## Architecture decisions (locked for v0.1)
1. **Level pipeline = hybrid generate-and-curate** (shape mask + params → generator → TS solver/validator → human curation → level JSON). Guarantees solvability; makes 50→600 tractable solo.
2. **Rendering = react-native-svg + plain views**, not Skia. Only one arrow animates at a time. Skia deferred as an escape hatch.
3. **Animation = Reanimated 3.**
4. **State = Zustand (persistent) + local `useReducer` (live board).** Live board state stays out of the global store.
5. **Storage = AsyncStorage**, versioned save schema. MMKV noted as an upgrade path.
6. **Domain layer `game/` is pure TS** — same code runs in-app (hints/deadlock) and in off-device tooling (generate/validate). Single source of truth for rules.
7. **Ads = AdMob rewarded only, hints only.** Offline policy: 3 seed hints, preload one ad when online, graceful "connect to earn a hint" fallback.
8. **Framework = Expo (managed) + EAS Build + Dev Client**, TypeScript strict.

### Added in Phase 1
9. **`RuleVariant` is a first-class per-level concept**, not a hardcoded rule. Both `escape-only` and `slide-and-stop` are implemented behind one API.
10. **Board topology is split from play state** (`Board` vs `BoardState`) so the solver can explore thousands of states while allocating only a small typed array each.
11. **Occupancy is a flat `Int32Array`**, making `castRay`'s blocking check O(1) per step. This is the hot path in the entire project.
12. **`solve()` dispatches to two engines.** `escape-only` uses Kahn's algorithm on the blocking graph (no search); `slide-and-stop` uses memoised DFS with a node budget that reports `exhausted` rather than falsely claiming `unsolvable`.
13. **Difficulty metrics replaced "solution depth"** with `minFrontier`, `avgFrontier`, `dependencyDepth`, `density`, `forcedSteps`, `trapMoves`. Solution depth is meaningless under `escape-only`.
14. **Hints are "the first move of a winning line"**, not a heuristic. Strongest possible safety guarantee, and free given the solver.
15. **ASCII board notation (`ascii.ts`) is production code**, shared by tests, the generator, and validator error messages. One notation everywhere.
16. **Path aliases** (`@game`, `@screens`, `@theme`, …) work in both Metro and `tsc`.

## Folder structure
See TDD §4 (authoritative). Key dirs: `src/game` (pure domain), `src/state`, `src/screens`, `src/components`, `src/services`, `src/data/levels`, `src/theme`, `tools/`, `__tests__`, `docs/`.

## Coding standards
See TDD §15. TS strict; doc comment on every export explaining *why* it exists; file headers; consistent naming.

## Technologies
Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6.0, Jest + jest-expo, tsx. Planned: react-native-svg, react-native-reanimated, Zustand, AsyncStorage, expo-audio, react-native-google-mobile-ads.

## Commands
| Command | Purpose |
|---|---|
| `npm run verify` | typecheck + full test suite (run before every commit) |
| `npm test` | Jest |
| `npm run test:coverage` | Jest with coverage thresholds |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | Expo dev server |

## Pending work (next up)
- **You:** run the Phase 1 build on device (see [PHASE_1_TESTING.md](PHASE_1_TESTING.md)) and decide the rule variant.
- **Then Phase 2:** playable board — SVG arrows, Reanimated release/slide animation, `gameReducer`, one hardcoded level.

## Deferred features (post-v0.1)
Coins/economy, undo/redo, leaderboards, daily challenges, online/multiplayer, cloud saves, live events, cosmetics, battle pass, seasonal content, IAP. Level count beyond 50 (target 600). Additional layout shapes. Crash reporting. ESLint/Prettier config (deps installed, not yet configured).

## Risks
- **Rule-variant decision** — now the top risk, because it changes the level generator's design. Cheapest to resolve now, before any level exists.
- **Level quality/solvability** — mitigated by the solver-in-the-loop pipeline and the automated "every level is solvable" test.
- **Generator yield under `slide-and-stop`** — most random boards under that rule are unsolvable, and trap boards are ~0.4% of solvable ones. The generator must search for interesting boards deliberately, not sample randomly.
- **Ads + offline tension** — mitigated by the seed-hints + preload policy.
- **Difficulty curve feel** — needs real device playtesting; the generator gives candidates, human curation owns the feel.
- **Scope creep toward 600 early** — explicitly held; ship and validate 50 first.

## Known issues / technical debt
- ESLint + Prettier dependencies are installed but not configured (no `eslint.config.js` yet). Fold into Phase 2.
- `src/game/index.ts` shows 0% coverage — it is a re-export barrel with no logic. Harmless.
- The IDE's JSON schema flags `module: "preserve"` in `tsconfig.json` as invalid. It is valid in TS 5.4+ and inherited from `expo/tsconfig.base`; `tsc` accepts it. Stale schema, not a real error.

## Future improvements
MMKV if save writes get hot; Skia if we add particle/trail effects; crash reporting; cloud save.

---
*Update discipline: append to Completed, adjust Pending, log any new decisions/risks after each approved phase.*
