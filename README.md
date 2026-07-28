# ArrowPath

A calm, logic-first puzzle game for Android. Each level is a board of arrows;
every arrow wants to leave the board but can only fly straight out in the
direction it points, and only if nothing is in its way. Clear every arrow to win.

**Status:** Phase 1 of 9 — rules engine complete, awaiting a device test and one
design decision. See [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Quick start

```bash
npm install
npm run verify   # typecheck + 80 unit tests
npm start        # then scan the QR code with Expo Go
```

Testing on your phone: **[docs/PHASE_1_TESTING.md](docs/PHASE_1_TESTING.md)**.

---

## ⚠️ Open decision

Phase 1 established that under the core rule as originally specified, **the player
cannot make a wrong move** — every solvable board is cleared by any tap order, and
a solvable board can never deadlock.

That makes ArrowPath a spatial-search game (like *Parking Jam*) rather than the
logic game the design document describes. Both rule variants are implemented and
tested; the app lets you play them side by side and decide.

Read **[docs/MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md)** for the proof, the
evidence, and the two options.

---

## Layout

```
src/game/      pure TypeScript rules engine — no React, no I/O
src/screens/   UI
src/theme/     design tokens
__tests__/     Jest suites for the domain layer
docs/          design docs, roadmap, project memory
```

The domain layer is deliberately pure so the *same code* runs the game on the
phone and validates levels off-device. There is one definition of "how the game
works" in the codebase.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify` | typecheck + tests — run before every commit |
| `npm test` | Jest |
| `npm run test:coverage` | coverage, with thresholds enforced on `src/game` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm start` | Expo dev server |
| `npm run android` | Expo dev server, launch on a USB-connected device |

## Docs

| Document | What it covers |
|---|---|
| [GAME_DESIGN_DOCUMENT.md](docs/GAME_DESIGN_DOCUMENT.md) | the player's perspective |
| [TECHNICAL_DESIGN_DOCUMENT.md](docs/TECHNICAL_DESIGN_DOCUMENT.md) | architecture and rationale |
| [MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md) | the open rule decision |
| [ROADMAP.md](docs/ROADMAP.md) | nine phases, each ending at an approval gate |
| [PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md) | authoritative project state — read this first |
| [PHASE_1_TESTING.md](docs/PHASE_1_TESTING.md) | how to test the current build |
