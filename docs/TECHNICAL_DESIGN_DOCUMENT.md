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

**Solver design (as built).** No search is required, and that is a result rather
than a shortcut. An arrow can leave iff every arrow on its head's ray has already
left, and because a tap only ever *removes* arrows, that blocker set never grows.
So the level is "delete the nodes of a directed graph in topological order," and
it is solvable **exactly when that graph is acyclic**. `solve()` is Kahn's
algorithm and runs in microseconds even on a 30-arrow board — which is what makes
validating hundreds of levels in CI effectively free. See
[MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

It is checked against an exhaustive brute-force reference solver over hundreds of
random boards in the test suite. The same solver ships (tiny) into the app for
**on-device hints** — no server, fully offline.

**Difficulty metrics (revised in Phase 1).** The original "solution depth" dial
does not survive: tap order cannot lose a level, so planning depth is always zero.
Difficulty lives in how hard the board is to *read*. `analyze()` measures:

| Metric | Meaning |
|---|---|
| `avgBodyLength`, `maxBodyLength` | tracing burden — a 7-cell snake takes real effort to follow |
| `avgTurns` | bends per body; a straight arrow is read at a glance, a hooked one is not |
| `crowding` | adjacent cells belonging to *different* snakes — what makes a tangle read as a tangle |
| `minFrontier` / `avgFrontier` | how many arrows are free at once |
| `expectedBlindMistakes` | **the key number** — hearts a random-tapping player would burn. Graded against the level's hearts |
| `dependencyDepth` | longest forced chain of "this must go before that" |
| `density` | occupied cells per board cell |

**Level data format (`levels/NNN.json`):**

```jsonc
{
  "id": 12,
  "name": "Crossing",
  "rows": 8,
  "cols": 8,
  "layout": "cross",
  "difficulty": 2,   // curated band 1-5
  "hearts": 5,       // optional; defaults to 5
  "arrows": [
    // Cells head first. Consecutive cells must be orthogonally adjacent.
    // Direction is inferred from the last segment, so it is not stored:
    // this head is at (0,2) with its neck at (1,2), so it points up.
    { "id": "a1", "body": [[0, 2], [1, 2], [1, 3], [2, 3]] },
    { "id": "a2", "body": [[2, 0], [2, 1], [3, 1]] }
  ],
  "solution": ["a2", "a1", "..."]  // canonical order from the validator
}
```

**Why direction is inferred rather than stored.** An arrowhead always continues
the line it is drawn on, so `dir` is a function of the body's last segment.
Storing it would create a second source of truth that a hand edit could silently
desync — moving a head without updating its direction is the most likely mistake
in a level file. The builder validates any `dir` that *is* supplied against the
geometry and rejects a mismatch. Only a single-cell arrow must state one.

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
│  │  ├─ types.ts               # Arrow (snake body), Board, BoardState, PlaySession
│  │  ├─ board.ts               # geometry, body validation, castRay
│  │  ├─ rules.ts               # resolveTap, applyOutcome, hearts, win/fail
│  │  ├─ solver.ts              # graph peeling, verifySolution, analyze
│  │  ├─ hints.ts               # next-safe-move selection
│  │  ├─ ascii.ts               # board <-> text notation (uppercase = head)
│  │  ├─ diagnostics.ts         # on-device engine self-check (dev-facing)
│  │  └─ index.ts               # the public surface
│  ├─ state/                    # (Phase 2+) gameReducer, Zustand stores
│  ├─ screens/
│  │  └─ GameScreen.tsx         # Phase 1 deliverable
│  ├─ components/
│  │  ├─ arrowGeometry.ts       # pure drawing maths — no React, no SVG
│  │  ├─ ArrowSnake.tsx         # paints one snake per ArrowStyle
│  │  ├─ BoardCanvas.tsx        # board panel, grid pattern, touch targets
│  │  ├─ Hud.tsx                # level, hearts, buttons
│  │  └─ index.ts               # the public surface
│  ├─ services/                 # (Phase 4+) storage, audio, ads
│  ├─ data/levels/              # (Phase 3+) 001.json … 050.json
│  ├─ theme/
│  │  ├─ types.ts               # Palette, ArrowStyle, BoardStyle, Theme
│  │  ├─ themes.ts              # the six shipped themes, as data
│  │  └─ index.ts               # + spacing/radius/type scale (not themeable)
│  └─ config/                   # (Phase 6+) constants, flags, ad unit ids
├─ tools/
│  └─ preview-themes.ts         # renders every theme to an HTML page
│                               # (Phase 3+) generator/validator land here too
├─ __tests__/                   # unit tests for game/ and tools/
├─ assets/
└─ docs/                        # GDD, TDD, MECHANIC_ANALYSIS, PROJECT_MEMORY, ROADMAP
```

`tools/` importing from `src/game/` is the whole point — the shipped rules and the validation rules are literally the same code.

---

## 5. Rendering system

- **Board:** one SVG root for the whole board, so it is a single native view however many arrows are on it. Cell size comes from `fitCellSize`, which fits the grid plus its padding ring into the space available and keeps cells square, so a wide board and a tall one look like the same game.
- **Grid pattern:** dots, ruled lines, crosses, checker, or nothing — chosen by the theme. This is a *playing aid*, not decoration: without visible cell structure the player cannot tell whether two ropes share a column, which is exactly the judgement the game asks for.
- **Arrow:** each snake is one `<Polyline>` through its body cells with `strokeLinejoin="round"`, which is what turns a chain of cells into something that reads as rope. A 7-cell body is a single draw call, not seven. The head is drawn on top as a separate shape.
- **Hit area:** real `Pressable` views overlaid one per occupied cell, *not* SVG `onPress`. Hit-testing a transparent stroke is inconsistent across platforms, and a full-cell target is the better tap anyway — any part of a snake selects the whole snake, so a thin arrow is no harder to hit than a fat one.
- **Geometry lives in `arrowGeometry.ts`**, a pure module with no React and no SVG elements — just coordinates. That makes the drawing maths unit-testable, and it lets `tools/preview-themes.ts` render the whole theme set to an HTML page from the exact same code the app uses, so a preview cannot quietly disagree with what ships.
- Colour carries **state only** (red for a failed tap, orange for the blocker, green for assist), never identity or direction — all snakes share one colour because telling them apart is the game.
- Only the tapped arrow animates; all others are static, and `ArrowSnake` is memoised so an untouched snake does not re-render. This keeps frame cost trivial even on low-end devices.

### Theming

A theme is **data**, described in `src/theme/types.ts` and registered in
`themes.ts`. It sets three independent things:

| Part | What it controls |
|---|---|
| `Palette` | every colour, including a `scheme` flag so system chrome can match |
| `ArrowStyle` | head shape (`triangle`/`pencil`/`chevron`/`rounded`/`none`), tail cap, corner join, thickness, shadow, gloss highlight, eyes, per-arrow colour |
| `BoardStyle` | grid pattern, dot/line weight, panel corner radius, padding ring |

Every measurement is a **ratio of one cell**, so a theme looks identical on a 4×4
board and a 10×10 one.

**The contract: the renderer never branches on a theme's `id`.** It reads these
fields and draws. Adding a theme is an entry in the registry; adding a new *kind*
of look is one new field plus one branch in the renderer. Anything that cannot be
expressed that way is a signal the type is missing a field, not a licence for a
special case.

Themes are cosmetic with one documented exception: `ArrowStyle.colorful` gives
each snake its own hue, which makes levels materially easier because telling
snakes apart is the skill being tested. Themes that use it say so in their
description, and the difficulty metrics assume it is off.

---

## 6. Game loop (the reducer state machine)

The live state is a `PlaySession`: `{ state, heartsLeft, maxHearts, status, mistakes }`.

```
TAP(arrowId)
  ├─ head's ray clear?  ── no ───► BLOCKED: flash snake red, pulse the blocker,
  │                                 board unchanged, heartsLeft -= 1
  │                                 └─ heartsLeft == 0? ───► status = 'failed'
  └─ yes ───► thread the whole snake off the board
             └─ board empty? ───► status = 'won' → persist progress
RESTART ───► reload the level's initial board, hearts restored
HINT    ───► ask game/hints for a genuinely free arrow, highlight it (consumes a hint)
```

Note there is **no deadlock branch**. A blocked tap changes nothing, and removing
a snake can never block another, so a board that starts solvable stays solvable no
matter what the player does. Hearts are the only loss condition.

All transitions are pure functions in `game/` — `tapArrow` already returns the new
session plus the outcome, so the Phase 2 reducer is a thin wrapper that sequences
animations around it. The core is fully unit-testable without rendering anything.

`applyOutcome` returns the *same object* when nothing changed, so the reducer can
use `next === prev` as a cheap "don't re-render" test.

**Hearts live in the session, not the board.** They are a property of *this
attempt*, not of the level, so the solver and the level validator never see them.

---

## 7. State management boundaries

- **`gameReducer`** — live, per-level board. Ephemeral. Dies when you leave the level.
- **`progressStore` (Zustand, persisted)** — highest unlocked level, completed set, "continue" pointer.
- **`settingsStore` (Zustand, persisted)** — audio/motion/confirmation toggles.
- **`hintStore` (Zustand, persisted)** — hint buffer count and ad state.

Persisted stores hydrate from AsyncStorage on launch and write on change. Clear separation of source-of-truth-per-concern keeps re-renders and bugs contained.

---

## 8. Animation system

- **Release** animates the snake threading out: the SVG path's `strokeDashoffset` is driven along the combined exit path, so the head leads and each body segment follows through cells the head has already cleared. One shared value per animating arrow.
- **Blocked** is a short `withSequence` shake at the head plus a red colour interpolation across the whole path, and a heart draining in the HUD.
- `MoveOutcome` carries `exitDistance` and `bodyLength` in cells, so the view computes the whole travel from the outcome and the cell size — no geometry duplicated between the domain and the renderer.
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

- **Unit (Jest) — the priority.** `game/` is pure and gets thorough coverage: body validation, ray/blocking correctness, hearts and win/fail transitions, solver solvability, hint safety. Coverage thresholds are enforced on `src/game/` only (90% lines/statements/functions, 80% branches) — a gate, not a vanity metric. Currently 98 tests across 6 suites at 96% statements.
- **Property tests over random boards**, with a seeded PRNG so failures reproduce. The fast solver engines are checked against exhaustive brute force.
- **Invariant tests** encode the load-bearing design claims of each rule variant, so a rule change surfaces as a failing test rather than a silent design regression.
- **Level integrity test (Phase 3):** loads every `levels/*.json`, asserts the solver can solve it and the stored `solution` replays cleanly.
- **On-device self-check** (`game/diagnostics.ts`) re-runs a subset on the phone, because Hermes is not Node and "passes on my laptop" is not evidence about the shipped app.
- **Component smoke tests** for critical screens.
- **Manual device testing** each phase, on a physical Android over USB (see per-phase checklists in ROADMAP).

---

## 13. Performance

- One animated element at a time — trivially smooth.
- `castRay` is the hot path; it allocates nothing and reads a flat `Int32Array` occupancy grid, so each step of a ray walk is O(1). An arrow's own cells are skipped by index comparison rather than by a set lookup.
- Each snake is one SVG path, not one node per cell — an 8×8 board of 7 long snakes is 7 draw calls, not 45.
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
