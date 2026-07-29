# ArrowPath

A calm, offline puzzle game for Android. Each level is a tangle of arrows — long
snaking bodies with an arrowhead at one end. Tap one and it threads out through
its head, but only if the straight line from that head to the board edge is clear.
Misread it and it costs a heart. Five wrong reads and the level is over.

**Status:** code-complete — **600 solver-verified levels** across 74 silhouettes
and five difficulty tiers, six themes, animation, hearts, hints, persistence,
first-run teaching, chapters, celebrations, streaks, and a record screen. What remains needs accounts and
assets: audio files, AdMob, and a Play listing. See
[docs/RELEASE.md](docs/RELEASE.md).

---

## Quick start

```bash
npm install
npm run verify        # typecheck + lint + 190 tests + all 600 levels validated
npm run start:tunnel  # then scan the QR code with Expo Go
```

Full testing guide: **[docs/TESTING.md](docs/TESTING.md)**.

---

## Where the difficulty lives

Tap order provably cannot lose a level. A tap only ever removes a snake, and
removing a snake can never block another, so a free arrow stays free — greedy
always works, and a board that starts solvable can never become stuck.

So the game is not about planning. It is about **reading**: finding a head in the
tangle, working out which way it points, and tracing its path to the edge. Wrong
*reads*, not wrong *plans*, cost you the level — and you always lose with the
board still perfectly winnable.

That is why bodies are long, bent, and all drawn in one colour. Every one of those
is a difficulty device. The proof, the measurements, and the difficulty model that
follows are in **[docs/MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md)**.

---

## Layout

```
app/             expo-router routes: menu, levels, play/[id], stats, settings
src/game/        pure TypeScript rules engine — no React, no I/O
src/components/  SVG renderer + pure drawing geometry + overlays
src/state/       game reducer + persisted Zustand stores
src/services/    storage, audio, ads — all fail quietly by design
src/theme/       six themes, each a single data entry
src/data/levels/ 600 levels in 12 packs, compactly encoded
tools/           generator, validator, curriculum, theme preview
__tests__/       190 tests
docs/            design docs, roadmap, project memory
```

The domain layer is pure so the *same code* runs the game on the phone and
validates levels off-device. There is one definition of "how the game works".

## Levels

Levels are generated, not hand-authored, and nothing ships unverified. The
pipeline grows self-avoiding snakes inside a shape mask, rejects any board whose
blocking graph has a cycle, and tunes each one toward a target difficulty. Every
level is then solved *and* has its recorded solution replayed — in the build, in
CI, and again from disk.

```bash
npm run levels:check     # prove every plan fits its shape before generating
npm run levels:build     # regenerate all 600 (deterministic, ~28s)
npm run levels:validate  # re-verify the packs on disk
npm run shapes:inspect   # print every silhouette at a real board size
```

All 600 levels occupy **159 KB**, because a body is stored as a head plus one
character per step (`"4,7:DDRR"`) rather than a list of coordinate pairs.

Difficulty is measured, not guessed. The primary dial is `expectedBlindMistakes`:
how many hearts a player tapping at random would burn. Against the 5 a level
grants, that grades a board directly:

| Tier | Levels | Board | Blind mistakes (avg) |
|---|---|---|---|
| Easy | 141 | 8–10 | 3.8 |
| Medium | 146 | 10–13 | 9.5 |
| Hard | 154 | 13–16 | 20.1 |
| Super Hard | 100 | 17–21 | 39.1 |
| Extreme | 59 | 22–27 | 84.2 |

Levels 1–20 are onboarding and climb steadily. **After that the curve is
deliberately mixed rather than monotonic** — a predictable ramp is what makes a
long game feel like a treadmill, so tiers are drawn from a weighted mix that
shifts across the game. The average climbs; any individual level is a surprise.

271 boards are larger than a phone screen and are played with pan and zoom.

## Theming

A theme sets three things independently — the **palette**, the **arrow style**
(head shape, tail cap, thickness, shadow, gloss, eyes), and the **board style**
(dots, ruled lines, crosses, checker, or nothing). Every measurement is a ratio of
one cell, so a theme looks the same at any board size.

The renderer never branches on a theme's id, so **adding a theme is a data entry**
in `src/theme/themes.ts`. Six ship: Paper, Midnight, Noodles, Bold, Blueprint,
Graphite.

```bash
npm run levels:preview > preview.html
```

Renders every theme from `src/components/arrowGeometry.ts` — the app's own
geometry module — so the preview cannot disagree with what ships.

## Commands

| Command | Purpose |
|---|---|
| `npm run verify` | typecheck + lint + tests + level validation. Run before every commit |
| `npm start` | Expo dev server (LAN) |
| `npm run start:tunnel` | Expo dev server via ngrok — use if the LAN route is firewalled |
| `npm test` | Jest |
| `npm run test:coverage` | coverage, thresholds enforced on `src/game` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, zero warnings tolerated |
| `npm run icons:build` | regenerate the app icons from the game's own art |
| `npm run format` | Prettier |

## Docs

| Document | What it covers |
|---|---|
| [PROJECT_MEMORY.md](docs/PROJECT_MEMORY.md) | authoritative project state — read this first |
| [GAME_DESIGN_DOCUMENT.md](docs/GAME_DESIGN_DOCUMENT.md) | the player's perspective |
| [TECHNICAL_DESIGN_DOCUMENT.md](docs/TECHNICAL_DESIGN_DOCUMENT.md) | architecture and rationale |
| [MECHANIC_ANALYSIS.md](docs/MECHANIC_ANALYSIS.md) | why order can't lose, and what makes levels hard instead |
| [TESTING.md](docs/TESTING.md) | how to test, and what to look for |
| [ROADMAP.md](docs/ROADMAP.md) | the phases, and what comes after v0.1 |
| [ADS_SETUP.md](docs/ADS_SETUP.md) | turning on rewarded ads |
| [RELEASE.md](docs/RELEASE.md) | getting it into the Play Store |
