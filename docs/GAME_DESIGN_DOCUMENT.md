# ArrowPath — Game Design Document (GDD)

> **Audience:** the player's perspective. No implementation details live here — those belong in the TDD.
> **Working title:** ArrowPath (Arrow Escape–inspired).
> **Platform (v0.1):** Android, Google Play Store.
> **Status:** Foundation draft, v0.1 scope.

> **Revised at the end of Phase 1** to match the confirmed mechanic: arrows are
> multi-cell *snakes*, and a misread tap costs a heart. §2, §6 and §8 have been
> rewritten. The reasoning behind the change, with proofs and measurements, is in
> **[MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md)**.

---

## 1. Concept

ArrowPath is a calm, focus-first puzzle game. Each level is a tangle of arrows. Every arrow wants to leave the board, but it can only fly straight out through its own arrowhead — and only if nothing stands in its way. The player clears a level by getting **every** arrow out. The whole game lives in one question: *which of these can actually leave right now?*

There is no timer, no dexterity, no reflex. A level is a knot to be read. You either spot the arrow with a clear run or you don't yet — and that "there it is" is the entire reward loop.

---

## 2. Core Mechanic

- The board is a grid. Each **arrow** is a **snake**: a connected chain of cells with an **arrowhead** at one end. Bodies bend, hook, and spiral across the board.
- **Tapping an arrow** sends it out through its head, in the direction the head points. The body threads out along the trail the head clears, so the whole snake leaves in one smooth movement.
  - If every cell on the straight line from the arrowhead to the board edge is empty, the arrow leaves and is **removed**.
  - An arrow's *own* body never blocks it — each segment vacates its cell as the one ahead advances. Spiral and hook shapes are fully playable.
  - If any *other* arrow sits on that line, the tap **fails**: the arrow flashes red, nothing on the board changes, and the player **loses a heart**.
- **Hearts:** the player starts each level with five. Spend them all and the level ends and restarts.
- **Win condition:** the board is empty. All arrows have escaped.

That's the complete rule set. Everything else is layout, presentation, and pacing.

### Why this is a good puzzle

The skill is **reading**, not planning. To know whether an arrow can leave you must find its head among a mass of near-identical lines, work out which way it points, and trace its path across the tangle to the edge — checking nothing crosses it.

Tap order does not matter: any arrow that is free stays free, so there is no wrong order and no way to trap yourself. What matters is whether you were *right* that it was free. Wrong reads, not wrong plans, are what cost you the level — and you can lose with the board still perfectly winnable.

This is why bodies are long, bent, and all drawn in the same colour. Each of those is a deliberate difficulty device: they exist to make tracing hard. The same rules with short straight arrows in seven colours would be trivial.

---

## 3. Controls

- **Single tap** on an arrow → attempt to release it.
- That is the only gameplay input. No dragging, no gestures, no long-press during play.
- Menu / HUD taps: Pause, Restart, Hint, Settings, Back.

Deliberately minimal. The game must be fully one-thumb playable and feel identical on a small phone and a tablet.

---

## 4. Puzzle Philosophy

1. **Always solvable.** Every shipped level has at least one valid solution, guaranteed before release (see the pipeline in the TDD). A player is never asked to solve the impossible.
2. **Logic, never luck.** No hidden information, no randomness during play. The board is fully visible; every answer is deducible by tracing. A player who reads carefully can clear any level without losing a heart.
3. **Never ruined, only spent.** A wrong tap costs a heart but leaves the board untouched, so no mistake is ever unrecoverable. Restart is always one tap away and carries no penalty.
4. **One idea at a time.** Early levels introduce a single concept (a bend, a crossing, a shape) before combining them.
5. **Fair difficulty.** Hard levels are hard because bodies are long, bent, and crowded together — never because of ambiguity or trickery. Every arrow's head and direction must be unambiguous if you look closely enough; the difficulty is that looking closely takes effort.

---

## 5. Level Layouts

Snakes are grown inside a **shape mask** so the filled cells form a recognisable outline. The shape never changes the rules — but it is not purely cosmetic either: growing bodies inside a constrained outline forces them to bend and double back, which is exactly what makes them hard to trace. Shape and difficulty reinforce each other.

v0.1 ships these layout families:

- **Grid / free-form** — introductory, arrows placed for teaching clarity.
- **Cross**
- **Diamond**
- **Circle / ring**
- **Heart**
- **Spiral**

The layout system is a data concept (a shape mask over the grid), so new shapes can be added later without touching game code. This keeps the door open for future packs.

---

## 6. Level Progression & Difficulty Curve (v0.1 = 50 levels)

Difficulty is tuned by **how hard the board is to read**, not by how hard it is to plan. The dials are board size, arrow count, **body length**, **how much bodies bend**, **how tightly they run alongside each other**, and how few arrows are free at once.

The engine measures all of these. The single most useful number is `expectedBlindMistakes` — how many hearts a player who taps at random would burn clearing the level. Compared against the five hearts available, it grades a board directly: well below five and even careless play survives; well above and only correct reading wins.

| Band | Levels | Board | Arrows | Body length | Blind mistakes vs 5 hearts | Focus |
|------|--------|-------|--------|-------------|---------------------------|-------|
| **Onboarding** | 1–10 | 5×5 – 6×6 | 4–7 | 2–4 | ~1–3 | Short, mostly straight bodies. Teach the tap, the arrowhead, and that a blocked tap costs a heart. Hard to fail. |
| **Foundations** | 11–25 | 6×6 – 7×7 | 7–10 | 3–5 | ~4–7 | First shape layouts (cross, diamond). Bodies start bending; tracing becomes a real act. |
| **Tightening** | 26–40 | 7×7 – 8×8 | 9–13 | 4–6 | ~8–14 | Dense, crowded boards where bodies run alongside each other. Guessing now reliably fails. |
| **Mastery** | 41–50 | 8×8 – 8×10 | 12–18 | 5–8 | ~15+ | Heart, spiral, circle layouts. Long hooked bodies, few free arrows at a time. Satisfying set-piece finishers. |

The curve should feel like a smooth ramp with the occasional gentle dip after a spike (a breather level) so players don't burn out. Levels 1–3 are effectively an invisible tutorial — the design teaches, no text walls.

---

## 7. Game Flow

```
Splash → Main Menu → Level Select → Gameplay → (Win → next level | Restart | Pause)
```

- **Main Menu:** Play (continue), Levels, Settings.
- **Level Select:** grid of levels; locked levels unlock in sequence; completed levels show a subtle mark.
- **Gameplay HUD:** level number, Pause, Restart, Hint.
- **Win screen:** brief celebratory beat, then Next / Level Select.
- **Pause:** Resume, Restart, Settings, Quit to menu.

Progress saves automatically after each completed level. The game always reopens where the player left off. Everything works fully **offline** except earning new hints (see §9).

---

## 8. Win & Lose Conditions

- **Win:** all arrows removed. Level marked complete, next level unlocked, progress saved. The win screen shows hearts remaining — clearing a level without losing one is the mark of a clean read.
- **Lose:** all five hearts spent. The level ends and offers Restart. There is no timer and no score threshold; the only thing that can kill you is misreading the board five times.
- **The board itself can never be ruined.** A blocked tap changes nothing, and no tap order can trap you, so a failed level is always failed with a still-winnable board sitting there. The fail screen should say so — "the board was fine, the reading wasn't" — because the alternative reads as unfair.
- **Restart is always one tap away** and carries no penalty beyond starting the level over.

---

## 9. Hint System

- A **Hint** highlights an arrow that genuinely has a clear run to the edge, so following it can never cost a heart. (Guaranteed structurally: a hint is always the opening move of a solution the engine has actually found.)
- Hints have **no in-game currency**. There are no coins anywhere in ArrowPath.
- Hints are earned **only by watching a rewarded advertisement**.
- **Offline handling (design decision — see TDD §Ads):**
  - New players start with a small buffer of **3 free hints** so the game is never hard-blocked offline.
  - Watching a rewarded ad (online) adds hints to the buffer.
  - If a player is offline with an empty buffer and asks for a hint, the game explains warmly: "Connect to earn a hint," and offers Restart as the always-available alternative.
  - When online, one rewarded ad is kept preloaded so a hint can still be granted if the connection briefly drops.

Hints are a helping hand, never a wall. The game is fully completable without ever watching an ad, given patience and Restart.

---

## 10. UI / UX

- **Tone:** clean, quiet, modern. Generous spacing, large tap targets, high contrast between arrows and board.
- **Readability with effort.** This is the one place ArrowPath deliberately does *not* optimise for instant legibility: all snakes are drawn in the same colour, because telling them apart is the game. What must always be unambiguous on close inspection is where a body starts and ends, and which way its head points. Difficulty comes from density, never from ambiguity.
- **Colour is never load-bearing.** Direction is carried by the arrowhead's shape, so the board works for colour-blind players. Colour is used only for state — red for a failed tap, the heart counter.
- **Tap targets:** any cell of a snake taps that snake, so even a thin body is easy to hit.
- **Feedback:** every tap gets a response — a successful release threads the snake off-board; a blocked tap flashes the snake red, pulses the blocker, and drains a heart. The player always knows the game heard them, and *why* it said no.
- **No clutter:** the gameplay screen shows only what's needed. Menus stay one or two taps deep.
- **Accessibility:** large-target taps, reduced-motion option in Settings, no reliance on sound for critical info.

---

## 11. Audio

- **Background music:** soft, loopable, low-key ambient — supports focus, never distracts. One track for menus, one for gameplay is enough for v0.1.
- **Sound effects:** a light "swoosh" on release, a soft "bump" on a blocked tap, a warm chime on level complete. Restrained and pleasant.
- **Player control:** Music and SFX toggles in Settings, independent. Respect the device silent switch. Audio must never autoplay loudly.

---

## 12. Animation

- **Arrow release:** the head accelerates out along its path and the body threads after it, each segment following the one ahead — quick but readable, roughly a third of a second for a long snake. Seeing the tail whip out behind the head is the most satisfying moment in the game and is worth getting right.
- **Blocked tap:** the whole snake flashes red, a short shake at the head, and the blocking cell pulses so the player can see *what* stopped it. A heart drains from the HUD. Teaching why the tap failed is the point — a bare shake leaves the player none the wiser.
- **Level complete:** a brief, tasteful celebration (arrows or particles settling), not a long lockout.
- **Transitions:** gentle fades/slides between screens.
- Principle: animations reinforce cause-and-effect and feel responsive. Nothing blocks input longer than it must.

---

## 13. Settings

- Music on/off
- Sound effects on/off
- Reduced motion on/off
- Restart-level confirmation on/off
- About / version
- (No account, no login, no online settings in v0.1.)

---

## 14. Explicitly Out of Scope for v0.1

Per the project blueprint, v0.1 does **not** include: coins/currency/economy, undo/redo, leaderboards, daily challenges, online mode, multiplayer, cloud saves, live events, cosmetic skins, battle pass, seasonal content, or in-app purchases. The goal is a complete, polished core game first.

---

## 15. Future Expansion Ideas (post-v0.1, not committed)

- Grow the library from 50 → 600 levels in curated packs.
- Additional layout shapes (star, letters, seasonal shapes).
- New mechanics explored one at a time and only if they deepen the core (e.g. diagonal arrows, fixed walls, multi-tile arrows, teleport tiles).
- Optional cosmetic themes.
- Cloud save / cross-device continue.
- Daily puzzle mode.

Each of these is a deliberate later decision, evaluated against the same philosophy: does it deepen the logic without adding noise?

---

*End of GDD — v0.1 foundation.*
