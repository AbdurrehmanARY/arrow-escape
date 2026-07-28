# ArrowPath — Technical Design Document (TDD)

> **Audience:** the developer's perspective (you, six months from now).
> **Scope:** v0.1 — architecture, core gameplay, first 50 levels.
> **Guiding values (from the blueprint):** maintainability, simplicity, performance, scalability, readability, long-term consistency. Every choice below is justified against those.

---

## 1. Technology Stack — decisions and rationale

| Concern | Choice | Why | Alternatives rejected |
|---|---|---|---|
| **Framework** | **React Native via Expo** (managed, with EAS Build + Dev Client) | Solo-dev maintenance is the #1 constraint. Expo config plugins handle AdMob, audio, and native builds without ejecting. Dev Client supports real-device USB testing. | Bare RN (more native maintenance for no gain here); Flutter/Unity (new ecosystem, heavier for a tap-only 2D puzzle). |
| **Language** | **TypeScript (strict)** | Type safety across game logic, level data, and state. Matches your existing stack. | Plain JS (loses the compile-time guarantees that make a solo codebase safe to change). |
| **Board rendering** | **react-native-svg + plain RN views** | The board is static except for **one arrow animating at a time**. SVG gives crisp, scalable directional glyphs with almost no runtime cost. | **Skia:** powerful but unnecessary here; only ~1 element animates at once, so Skia adds a dependency and complexity for no perceptible benefit. Kept as an escape hatch if we later add trails/particles. |
| **Animation** | **react-native-reanimated 3** | UI-thread 60fps animations. A release is a simple `withTiming` translate + fade — exactly Reanimated's sweet spot. | Animated API (jankier for this); Skia-driven animation (overkill). |
| **Persistent state** | **Zustand** | Minimal boilerplate, matches your experience, ideal for progress/settings/hints shared across screens. | Redux (ceremony we don't need); Context-only (re-render pain). |
| **Active board state** | **`useReducer` local to the gameplay screen** | The tight play loop (tap → resolve → maybe deadlock) is a pure state machine. A reducer keeps it isolated, testable, and out of global state. | Putting live board state in Zustand (pollutes global store, harder to reason about a single level). |
| **Save/storage** | **`@react-native-async-storage/async-storage`** | Save frequency is low (once per completed level). Zero-config, reliable, Expo-friendly. | MMKV (faster, but needs a plugin; noted as an upgrade path if writes ever get hot). |
| **Audio** | **expo-audio** | Current Expo audio module; simple BGM loop + SFX, respects silent switch. | expo-av (being superseded); bare native audio (maintenance). |
| **Ads** | **react-native-google-mobile-ads (AdMob)** | Industry standard rewarded ads; Expo config plugin. Rewarded only, hints only. | Any SDK requiring eject; mediation (premature for v0.1). |
| **Level tooling** | **Node + TypeScript scripts** (generator + solver/validator), run off-device | Guarantees every shipped level is solvable and lets us curate 600 without hand-checking each. | Hand-authoring + manual testing (error-prone, the biggest risk in the whole project). |

**As built in Phase 1:** Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6.0
(strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`),
Jest via `jest-expo`. Path aliases (`@game`, `@screens`, `@theme`, …) resolve in
both Metro and `tsc`.

---

## 2. The level pipeline (this is the project's backbone)

**Decision: hybrid generate-and-curate, not pure handcrafting.**

Hand-authoring 600 solvable, difficulty-graded, non-trivial puzzles solo is the single largest risk to quality and schedule. Instead:

```
 shape mask (heart/diamond/…)  +  difficulty params
                │
                ▼
        generator (TS)  ───►  candidate level (arrows + directions)
                │
                ▼
        solver / validator (TS)
          • is it solvable?            → discard if not
          • how many solutions?        → prefer unique / few
          • difficulty metrics         → difficulty score
          • canonical solution order   → stored with the level
                │
                ▼
        human curation  ───►  approved level  ───►  levels/NNN.json
```

The output still *feels* handcrafted — you choose the shapes, the difficulty targets, and which candidates ship. What you no longer do is manually verify solvability or hand-place every arrow. This is what makes 600 levels tractable for one person.

**Solver design (as built).** Two engines behind one `solve()` API, picked by rule
variant:

- **`escape-only`** reduces to a graph problem and needs no search at all. An
  arrow can leave iff every arrow initially on its ray has left, and that blocker
  set never grows — so the level is "delete the nodes of a directed graph in
  topological order," and it is solvable **exactly when that graph is acyclic**.
  Implemented as Kahn's algorithm; microseconds per level. See
  [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).
- **`slide-and-stop`** needs real search, because a moved arrow becomes a blocker
  somewhere new. Memoised DFS; the state space is a DAG (each arrow only ever
  advances along its own direction), so no cycle guard is needed. Bounded by a
  node budget that reports `exhausted` rather than falsely claiming `unsolvable`.

Both are checked against an exhaustive brute-force reference solver over
thousands of random boards in the test suite. The same solver ships (tiny) into
the app for **on-device hints and deadlock detection** — no server, fully offline.

**Difficulty metrics (revised in Phase 1).** The original "solution depth" dial
does not survive contact with `escape-only`, where planning depth is always zero.
`analyze()` measures instead:

| Metric | Meaning |
|---|---|
| `minFrontier` / `avgFrontier` | how many arrows are tappable at once — the visual-search load, and the real difficulty dial for `escape-only` |
| `dependencyDepth` | longest forced chain of "this must go before that" |
| `density` | arrows per cell |
| `forcedSteps` | steps where exactly one arrow was tappable |
| `trapMoves` | `slide-and-stop` only: legal opening taps that lose the level |

**Level data format (`levels/NNN.json`):**

```jsonc
{
  "id": 12,
  "name": "Crossing",
  "rows": 6,
  "cols": 6,
  "layout": "cross",
  "difficulty": 2,          // curated band 1-5
  "variant": "escape-only", // optional; defaults to escape-only
  "arrows": [
    { "id": "a1", "row": 0, "col": 2, "dir": "down" },
    { "id": "a2", "row": 2, "col": 0, "dir": "right" }
  ],
  "solution": ["a2", "a1", "..."]  // canonical order from the validator
}
```

Levels are **data, not code** — they load without app changes, which is exactly what a 50→600 roadmap needs.

---

## 3. Architecture overview

Layered, one-directional dependencies. Higher layers depend on lower ones, never the reverse.

```
┌─────────────────────────────────────────────┐
│ UI layer        screens/, components/       │  React + Reanimated + SVG
├─────────────────────────────────────────────┤
│ State layer     state/ (Zustand), reducer   │  progress, settings, hints; live board
├─────────────────────────────────────────────┤
│ Domain layer    game/  (pure TS)            │  rules, solver, deadlock, hint selection
├─────────────────────────────────────────────┤
│ Data layer      data/, services/            │  level JSON, AsyncStorage, ads, audio
└─────────────────────────────────────────────┘
```

**Key rule: the domain layer (`game/`) is pure TypeScript with zero React and zero I/O.** It's the rules engine — deterministic, unit-testable, portable. The exact same functions run in the app (play, hints) and in the offline tooling (generate, validate). One source of truth for "how the game works."

Nothing above `game/` imports a `game/` file directly — everything goes through
`src/game/index.ts`. If it is not re-exported there, it is internal.

---

## 4. Folder structure

```
arrow-escape-game/
├─ App.tsx                      # entry; renders one screen in Phase 1
├─ src/
│  ├─ game/                     # DOMAIN — pure, no React, no I/O
│  │  ├─ types.ts               # Arrow, Direction, Board, BoardState, MoveOutcome
│  │  ├─ board.ts               # geometry, level validation, castRay
│  │  ├─ rules.ts               # resolveTap, applyOutcome, win/deadlock detection
│  │  ├─ solver.ts              # both engines, verifySolution, analyze
│  │  ├─ hints.ts               # next-safe-move selection
│  │  ├─ ascii.ts               # board <-> text notation
│  │  ├─ diagnostics.ts         # on-device engine self-check (dev-facing)
│  │  └─ index.ts               # the public surface
│  ├─ state/                    # (Phase 2+) gameReducer, Zustand stores
│  ├─ screens/
│  │  └─ EngineCheckScreen.tsx  # Phase 1 deliverable
│  ├─ components/               # (Phase 2+) Board, ArrowView, Hud, overlays
│  ├─ services/                 # (Phase 4+) storage, audio, ads
│  ├─ data/levels/              # (Phase 3+) 001.json … 050.json
│  ├─ theme/                    # colors, spacing, radius, typography tokens
│  └─ config/                   # (Phase 6+) constants, flags, ad unit ids
├─ tools/                       # (Phase 3+) off-device generator/validator
├─ __tests__/                   # unit tests for game/ and tools/
├─ assets/
└─ docs/                        # GDD, TDD, MECHANIC_ANALYSIS, PROJECT_MEMORY, ROADMAP
```

`tools/` importing from `src/game/` is the whole point — the shipped rules and the validation rules are literally the same code.

---

## 5. Rendering system

- **Board:** an absolutely-positioned grid. Cell size = `min(screenWidth, maxBoardWidth) / cols`, computed once per level; the board is centered and letterboxed on tall screens.
- **Arrow:** `ArrowView` renders an SVG arrow glyph inside a `Pressable`. Direction chooses the glyph rotation. Colour is a secondary cue only (colour-blind safe — shape/rotation is primary).
- Only the tapped arrow animates; all others are static. This keeps frame cost trivial even on low-end devices.

---

## 6. Game loop (the reducer state machine)

State: `{ board, movesMade, status: 'playing' | 'won' | 'deadlocked' }`.

```
TAP(arrowId)
  ├─ path clear?  ── no ───► emit BLOCKED (view shakes); state unchanged
  └─ yes ───► remove arrow (or slide it, per variant)
             ├─ board empty?     ───► status = 'won'  → persist progress
             └─ any legal move?  ── no ───► status = 'deadlocked' → offer Restart/Hint
RESTART ───► reload level's initial board
HINT    ───► ask game/hints for next safe arrow, highlight it (consumes a hint)
```

All transitions are pure functions in `game/`. The reducer just sequences them. This means the core is fully unit-testable without rendering anything.

`applyOutcome` returns the *same object* when nothing changed, so the reducer can
use `next === prev` as a cheap "don't re-render" test.

---

## 7. State management boundaries

- **`gameReducer`** — live, per-level board. Ephemeral. Dies when you leave the level.
- **`progressStore` (Zustand, persisted)** — highest unlocked level, completed set, "continue" pointer.
- **`settingsStore` (Zustand, persisted)** — audio/motion/confirmation toggles.
- **`hintStore` (Zustand, persisted)** — hint buffer count and ad state.

Persisted stores hydrate from AsyncStorage on launch and write on change. Clear separation of source-of-truth-per-concern keeps re-renders and bugs contained.

---

## 8. Animation system

- Reanimated shared values drive arrow `translateX/Y` + `opacity` for release; a short spring/`withSequence` for the blocked shake.
- `MoveOutcome` carries a `distance` in cells, so the view computes the travel purely from the outcome and the cell size — no geometry duplicated between layers.
- Reduced-motion setting swaps animations for instant state changes (accessibility + a perf fallback).
- Win overlay uses a brief, cancellable animation — never blocks input for long.

---

## 9. Save system

- **Versioned schema** in AsyncStorage (`{ version, progress, settings, hints }`). A `version` field lets us migrate saves safely as the game grows.
- Writes are debounced/awaited on meaningful events (level complete, setting change, hint change). Reads happen once at launch into the stores.
- Corruption-safe: a bad/absent save falls back to a fresh default state rather than crashing.

---

## 10. Audio system

- `services/audio.ts` wraps expo-audio: `playBgm`, `stopBgm`, `playSfx(name)`.
- Respects settings toggles and the device silent switch; ducks/pauses on backgrounding.
- SFX preloaded at startup; a single looped BGM per context (menu/game).

---

## 11. Ads integration (rewarded, hints only)

- `services/ads.ts` wraps react-native-google-mobile-ads. **Only** rewarded ads, **only** to grant hints.
- **Offline policy (mirrors GDD §9):** keep one rewarded ad preloaded when online; on reward callback, increment `hintStore` buffer; if offline and buffer empty, surface "connect to earn a hint" and keep Restart available. New installs seed 3 hints.
- Test ad unit IDs in dev via config; real IDs injected from `config/` for release builds. No ads anywhere except the explicit "earn a hint" action.

---

## 12. Testing strategy

- **Unit (Jest) — the priority.** `game/` is pure and gets thorough coverage: path/blocking correctness, win/deadlock detection, solver solvability, hint safety. Coverage thresholds are enforced on `src/game/` only (90% lines/statements/functions, 80% branches) — a gate, not a vanity metric.
- **Property tests over random boards**, with a seeded PRNG so failures reproduce. The fast solver engines are checked against exhaustive brute force.
- **Invariant tests** encode the load-bearing design claims of each rule variant, so a rule change surfaces as a failing test rather than a silent design regression.
- **Level integrity test (Phase 3):** loads every `levels/*.json`, asserts the solver can solve it and the stored `solution` replays cleanly.
- **On-device self-check** (`game/diagnostics.ts`) re-runs a subset on the phone, because Hermes is not Node and "passes on my laptop" is not evidence about the shipped app.
- **Component smoke tests** for critical screens.
- **Manual device testing** each phase, on a physical Android over USB (see per-phase checklists in ROADMAP).

---

## 13. Performance

- One animated element at a time — trivially smooth.
- `castRay` is the hot path (the solver calls it ~10^5–10^6 times per level); it allocates nothing and reads a flat `Int32Array` occupancy grid, so blocking checks are O(1) per step.
- Board geometry computed once per level, not per frame.
- Level JSON is small and lazy-loaded per level; no giant bundle of 600 in memory.
- Reduced-motion path avoids animation cost entirely on weak devices.
- Target: steady 60fps interaction on low-to-mid-range Android.

---

## 14. Error handling & logging

- Domain functions are total (no throwing on normal play); illegal inputs return typed `Result` values, not exceptions, so a malformed level file degrades to a message instead of a crash. The one exception is `parseAscii`, which only ever sees developer-authored input and throws loudly at authoring time.
- I/O boundaries (storage, ads, audio) wrapped in try/catch with safe fallbacks — a failed ad load or save never crashes gameplay.
- Lightweight dev logger gated behind a `__DEV__` flag; production stays quiet. (Crash reporting is a post-v0.1 consideration.)

---

## 15. Naming & coding standards

- **Files:** `PascalCase.tsx` for components/screens, `camelCase.ts` for logic/services.
- **Types:** `PascalCase`; functions/vars `camelCase`; constants `UPPER_SNAKE`.
- Every exported class/function/hook/component/util gets a doc comment: what it does and *why it exists*. Comments explain rationale, not restate code. One consistent style repo-wide.
- Each file opens with a short header: purpose, responsibilities, notes.
- ESLint + Prettier enforced; TypeScript `strict`.

---

## 16. Build & deployment

- **EAS Build** for Android (dev client for USB testing; production AAB for Play).
- Config-driven env: dev uses AdMob test IDs; release uses real IDs and production flags.
- Play Store: signed AAB, staged rollout, store listing assets prepared near the end of v0.1.
- Versioning: semantic `versionName` + incrementing `versionCode`, tracked in PROJECT_MEMORY.

---

*End of TDD — v0.1 foundation.*
