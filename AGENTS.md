# ArrowPath — working notes for agents

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Before you start

Read [docs/PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md). It is the authoritative
record of what is built, what is decided, and what is open. Update it at the end
of every phase.

The project moves in **phases with approval gates** — see
[docs/ROADMAP.md](docs/ROADMAP.md). Do not start the next phase without being
asked. Each phase must end in something the user can test on a physical Android
device.

## The one rule that matters most

`src/game/` is **pure TypeScript**: no React, no I/O, no platform APIs. The same
code runs the game on the phone and validates levels off-device in `tools/`. If
you are tempted to import React or AsyncStorage into `game/`, the logic belongs in
a layer above it.

Nothing outside `game/` imports a `game/` file directly — everything goes through
`src/game/index.ts`.

## Conventions

- Every export gets a doc comment saying what it does **and why it exists**.
- Every file opens with a header: purpose, responsibilities, notes.
- Domain functions are total: invalid input returns a typed `Result`, never a throw.
- `npm run verify` (typecheck + tests) must be green before any commit.
- Coverage thresholds on `src/game/` are enforced in `jest.config.js`.

## Open decision

The rule variant (`escape-only` vs `slide-and-stop`) is **not settled** — see
[docs/MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md). Both are implemented.
Do not delete either until the user chooses.
