# ArrowPath

A calm, focus-first puzzle game for Android. Each level is a tangle of arrows —
long snaking bodies with an arrowhead at one end. Tap one and it threads out
through its head, but only if the straight line from that head to the board edge
is clear. Misread it and it costs a heart. Five wrong reads and the level is over.

**Status:** Phase 1 of 9 — rules engine complete, awaiting a device test.
See [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Quick start

```bash
npm install
npm run verify        # typecheck + 98 unit tests
npm run start:tunnel  # then scan the QR code with Expo Go
```

Testing on your phone: **[docs/PHASE_1_TESTING.md](docs/PHASE_1_TESTING.md)**.

---

## Where the difficulty lives

Tap order provably cannot lose a level: a tap only ever removes a snake, and
removing a snake can never block another, so a free arrow stays free. Greedy
always works.

So the game is not about planning — it is about **reading**. Finding a head in the
tangle, working out which way it points, and tracing its path to the edge. Wrong
*reads*, not wrong *plans*, are what cost you the level. That is why bodies are
long, bent, and all drawn in one colour: every one of those is a difficulty device.

The proof, the measurements, and the difficulty model that follows from it are in
**[docs/MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md)**.

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
| `npm start` | Expo dev server (LAN) |
| `npm run start:tunnel` | Expo dev server via ngrok — use this if the LAN route is firewalled |
| `npm run android` | Expo dev server, launch on a USB-connected device |

## Docs

| Document | What it covers |
|---|---|
| [GAME_DESIGN_DOCUMENT.md](docs/GAME_DESIGN_DOCUMENT.md) | the player's perspective |
| [TECHNICAL_DESIGN_DOCUMENT.md](docs/TECHNICAL_DESIGN_DOCUMENT.md) | architecture and rationale |
| [MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md) | why order can't lose, and what makes levels hard instead |
| [ROADMAP.md](docs/ROADMAP.md) | nine phases, each ending at an approval gate |
| [PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md) | authoritative project state — read this first |
| [PHASE_1_TESTING.md](docs/PHASE_1_TESTING.md) | how to test the current build |
