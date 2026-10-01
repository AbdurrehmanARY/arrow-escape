# ARCHITECTURE.md — Layer Rules

> **Deliverable of Phase 2** of [implementation.md](../implementation.md).
> Read [ARCHITECTURE_MIGRATION.md](ARCHITECTURE_MIGRATION.md) first — it is the
> measured inventory this document is derived from.
> **Purpose:** state the boundaries before enforcing them, so Phase 21 can turn these
> rules into a failing test rather than a code review argument.

---

## 1. The one rule that matters most

`src/game/` is **pure TypeScript**: no React, no React Native, no Expo, no Skia, no
Zustand, no I/O, no platform APIs. The same code runs the game on a phone and validates
1,000 levels off-device in `tools/`.

This is not aspirational. It is currently true and mechanically verified: every import
inside `src/game/` is relative to `./`, and the count of external imports is **0**. If
you add one, you have broken the guarantee the entire tooling pipeline depends on.

If logic seems to need I/O or a component, the logic is in the wrong layer.

## 2. Nothing reaches past a barrel

Everything outside a layer imports that layer's public surface, never a file inside it:

| layer | public entry |
|---|---|
| `game/` | `@game` |
| `theme/` | `@theme` |
| `components/` | `@components` |
| `state/` | `@state` |
| `services/` | `@services` |
| `challenge/` | `@challenge` |
| `league/` | `@league` |
| `brand/` | `@brand` |
| `config/` | `@config` |

A barrel is a promise: it says "these are the supported names." If a consumer needs
something the barrel does not export, **add it to the barrel** — do not route around it.

**This is not a style preference.** Measured today: `@game` is used bare 27 times and
deep only 13 (all forced, because `codec` was never exported), while `@state` and
`@services` are used deep **36 and 35 times and bare 0 times**. The barrels for those
two exist and are used by nobody.

### 2.1 A barrel that lies is worse than no barrel

A barrel that omits a module actively forces consumers to break the rule. Two are wrong
right now:

- `src/game/index.ts` omits `codec` and `diagnostics` — 13 forced deep imports.
- `src/state/index.ts` exports 8 of 10 stores; `streakStore` and `energyStore` are
  missing.

Fix the barrel first. A ban on deep imports enforced before that is a ban that cannot
be obeyed.

---

## 3. Layer matrix

`may import` is exhaustive. Anything not listed is forbidden.

| layer | may import | must NOT import |
|---|---|---|
| `game/` | `game/` only | React, RN, Expo, Skia, Zustand, `services/`, `state/`, `components/`, `hooks/`, `theme/`, `tools/`, `app/` |
| `data/` | `data/`, `game/` (types) | React, RN, `components/`, `services/`, `state/` |
| `render/` | `game/`, `theme/`, Skia, RN render primitives | `state/`, `services/`, `components/`, navigation |
| `components/` | `game/`, `theme/`, `hooks/`, `state/`, `services/`, RN | `app/`, `tools/`, `render/` |
| `hooks/` | `game/`, `state/`, `services/` | `app/`, `render/`, `components/` |
| `state/` | `services/`, `game/`, `data/` | React components, `app/`, `render/` |
| `services/` | platform / external APIs | `components/`, `state/`, `app/`, `render/`, `hooks/` |
| `challenge/` | `game/`, `data/`, `state/`, `brand/` | `app/`, `components/`, `services/` |
| `league/` | `game/`, `data/`, `state/`, `brand/` | `app/`, `components/`, `services/` |
| `theme/` | `brand/` | `state/`, `services/`, `components/`, `game/` |
| `tools/` | `game/`, `data/` | `app/`, `components/`, `state/`, `services/` |
| `app/` | everything below it | — (orchestration only; owns no domain logic) |

The shape of the matrix is a DAG. `game` at the bottom, `app` at the top, and
`services/` deliberately below `state/` because the stores persist through it.

---


## 4. Two live violations of the matrix

Recorded here so the rules are not aspirational. Both are fixed in Phase 3.

### 4.1 `services/` importing `state/` — a cycle

```
src/state/progressStore.ts:23   import { syncProgress } from '@services/sync';
src/services/sync.ts:38         import type { LevelRecord } from '@state/progressStore';
```

`services/` must not import `state/` (rule 3), and this pair is mutually dependent. It
is type-only so no runtime cycle exists, but the ownership is inverted: a persistence
record is a *service* concept that the store happens to own.

**Fix:** relocate `LevelRecord` to a module both sides may import — `storage.ts` is the
natural home, since it is the type describing what gets stored. Then `sync.ts` depends
downward only and the cycle is gone for good, not just at runtime.

### 4.2 `render/` importing `components/`

```
src/render/scene.ts:  import { buildArrowGeometry, cellCentre, type Point }
                         from '../components/arrowGeometry';
```

`arrowGeometry.ts` is pure geometry maths with no React in it. It is misplaced. Phase 9
moves it (with `camera.ts` and `cameraPresets.ts`) into `src/render/`, which both
satisfies the matrix and removes a relative import that crosses a directory boundary.

---

## 5. Naming and placement rules

1. **One file, one responsibility.** If a filename needs "and" to describe it, it is two
   files.
2. **The filename is a claim.** If `Overlays.tsx` is a directory, it must contain
   overlays and nothing else.
3. **No `utils/` dumping ground.** A generic helper belongs with its feature until two
   genuinely unrelated callers need it. `utils/` is where dead code goes to be tolerated.
4. **Do not create a directory to satisfy a diagram.** A folder exists when a real file
   belongs in it. `src/game/`, `src/state/` and `src/data/` are already correct and need
   no reshaping.
5. **Do not split a cohesive file for symmetry.** `board.ts` is 320 lines of one
   responsibility. A prettier tree is not a better tree.
6. **Layer-specific suffixes only when meaningful** — `*.types.ts` / `*.styles.ts` are
   for prop and style contracts, not for files split off by habit.
7. **Every file opens with a header** (purpose, responsibilities, notes) and **every
   export carries a doc comment** saying what it does *and why it exists*.

## 6. State rules

- Zustand for anything that must survive a screen change; `useReducer` for live board
  state. **Live board state stays out of the global store** (locked decision 4).
- A store is global because it is *persisted or cross-screen*, not because it would be
  tidier there. Do not promote component-local state to a store for symmetry.
- Stores persist through `services/`, never through `AsyncStorage` directly.

## 7. Services rules

- Services are the only layer that touches the outside world — disk, audio hardware, the
  ad network, Supabase, Google sign-in.
- They are written to **fail quietly**. None of them is ever a good reason to interrupt
  a puzzle.
- Ad SDKs load via guarded dynamic `require` so Expo Go still works (locked decision 7).
- Assets live in `assets/`, never inside `src/services/`.

## 8. Verification gate

`npm run verify` = `typecheck && lint && test && levels:validate`.

Every phase ends green or it is reverted. Coverage thresholds are enforced on
`src/game/` in `jest.config.js` (branches 80, functions 90, lines 90, statements 90) —
the layer the correctness guarantee rests on, and deliberately not applied to UI code.

**Process rules that came from real incidents in this repo:**

- **Never re-split and re-join an existing source file from PowerShell.** A four-
  character literal once wrote a backslash before every newline in `SkiaBoard.tsx` and
  inflated it from 677 to 1353 lines. Write whole new files in a single write; edit
  existing files with targeted string replacement only.
- **Never `reset`, `stash`, `clean` or `revert`** the working tree. It carries the
  in-flight refactor; discarding it destroys work.
- Capture `git status --porcelain` before and after every phase.

## 9. Enforcement

Phase 21 turns Section 3 into a validator run by `tools/validate.ts`. It must:

- **FAIL** on a seeded `game/ -> react` import.
- **FAIL** on a seeded `game/ -> tools` import.
- **FAIL** on a seeded `services/ -> state` import (rule 4.1).
- **FAIL** on a seeded `render/ -> components` import (rule 4.2).
- **PASS** on `tools/ -> game/` and `render/ -> game/theme`.
- **PASS** on the real tree, with the violations of Section 4 already fixed.

Until that validator exists, this document is the only thing standing between the
repository and drift. It is not enough on its own.
---

## 10. The feature-based layers

Added by [FEATURE_MIGRATION.md](FEATURE_MIGRATION.md). Sections 1–9 describe the
horizontal layers that are being reorganised; this section describes the
`features/`, `shared/` and `infrastructure/` layers that replace them.

**These rules are enforced before a single file moves.** Section 9's argument is
that an unenforced rule is only a review argument. That cuts harder here than it
did for the layer matrix: `layerOf()` reads the second path segment, so a
`src/features` directory resolves to a layer named `features`, which appeared in no
rule table and mapped from no alias. Creating the directories first would have left
the checker printing "No architecture violations." and exiting 0 over a tree it was
not examining.

| layer | may import | must NOT import |
|---|---|---|
| `features/<name>/` | `shared/`, `infrastructure/`, and the pinned layers (`game/`, `render/`, `theme/`, `data/`, `components/`, `state/`, `config/`, `brand/`) | **any other `features/<name>/`**, `app/`, `tools/` |
| `shared/` | `features/*` no — downward only: `@theme`, `@game`, and its own sub-roots | `features/*`, `app/`, `infrastructure/`, `tools/`, `state/` |
| `infrastructure/` | `shared/`, platform APIs | `features/*`, `app/`, `tools/`, `components/`, `state/`, `render/`, `hooks/` |

### 10.1 A feature is a layer, not a folder

`src/features/gameplay/` resolves to `features/gameplay`, and `src/features/ads/`
to `features/ads`. They may not import each other.

The flat alternative — one `features` key that every feature is allowed to import
— is worse than no rule at all, because it reads as protection while permitting
every edge the migration exists to remove. Two features that both need the same
thing means the thing was never either of their responsibility; it belongs in
`shared/`.

### 10.2 The engine facade

The engine **stays at `src/game/`**. It is guarded by the purity rule in §1, by a
jest coverage gate keyed on that exact path, and by ten off-device `tools/`
importers. Moving all three at once buys no architectural benefit.

`src/features/gameplay/engine/` is therefore a **thin re-export** of `@game` and
nothing else. It may import `@game`, `@game/*`, and its own files. It may not
import a platform package, and it may not reach any other layer. The moment it
grows a dependency of its own it has stopped being a surface for the engine and
become a second engine with none of the engine's guarantees.

### 10.3 Cross-root relative imports are banned in the new layers

`targetLayer()` resolves a relative specifier only when it lands back in the same
layer, so a relative import that crosses into another layer is invisible to every
rule above. This is not hypothetical: both live cycles in the repository run
through `src/challenge/rewards.ts -> '../state/challengeStore'`, which the checker
has never inspected.

The legacy layers keep that blind spot deliberately — enabling it there would
surface the legitimate `tools/ -> src/game` edge, and that is a separate decision
about a separate rule. The new roots do not start their life with it: a file under
`features/`, `shared/` or `infrastructure/` may use a relative path **inside its own
root** and nothing else.

### 10.4 Barrels

`shared/` and `infrastructure/` are exempt from §2, like `game/` and `services/`:
they are sub-rooted by design (`shared/components`, `shared/hooks`,
`infrastructure/storage`) and have no barrel. Requiring one would mean inventing an
`index.ts` whose only purpose is to satisfy a rule.

A feature's **own** sub-folders need no exemption. An intra-feature import resolves
to the same layer on both sides, so §2 never applies to it.

### 10.5 What is pinned

`game/`, `data/`, `render/`, `theme/`, `config/`, `brand/`, root `app/`, root
`assets/`, `tools/` and `__tests__/` are **not** moving. `game/` and `render/` are
pinned by the guarantees above; `app/` and `assets/` are pinned by Expo Router and
Metro (`main: "expo-router/entry"`, and `app.json` plus 34 static `require()` paths
in `audioAssets.ts`); `tools/` is pinned because `levels:validate` runs inside
`npm run verify`. Full reasoning in FEATURE_MIGRATION.md §6.
