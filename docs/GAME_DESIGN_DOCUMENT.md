# ArrowPath — Game Design Document (GDD)

> **Audience:** the player's perspective. No implementation details live here — those belong in the TDD.
> **Working title:** ArrowPath (Arrow Escape–inspired).
> **Platform (v0.1):** Android, Google Play Store.
> **Status:** Foundation draft, v0.1 scope.

> ⚠️ **Open decision affecting §2, §6 and §8.** Phase 1 established that under the
> core rule exactly as written below, the player cannot make a wrong move: every
> solvable board is cleared by *any* tap order, and a solvable board can never
> become deadlocked. This makes ArrowPath a spatial-search game rather than the
> logic game described here. See **[MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md)**
> for the proof, the evidence, and the two ways forward. The sections marked
> below stand as originally written until that decision is made.

---

## 1. Concept

ArrowPath is a calm, logic-first puzzle game. Each level is a board of arrows. Every arrow wants to leave the board, but it can only fly straight out in the direction it points — and only if nothing stands in its way. The player clears a level by removing **every** arrow. The whole game lives in one question: *what is the right order to tap?*

There is no timer, no dexterity, no reflex. A level is a small logic knot. You either see the thread that unravels it or you don't yet — and that "aha" is the entire reward loop.

---

## 2. Core Mechanic

> ⚠️ The "or it can trap the arrows behind it forever" claim below is **not true**
> under the current rule. See [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

- The board is a grid. Some cells hold an **arrow**; each arrow points **up, down, left, or right**.
- **Tapping an arrow** sends it sliding in the direction it points, straight toward the board edge.
  - If every cell along that straight path is empty, the arrow slides off the board and is **removed**.
  - If any arrow blocks that path, the tapped arrow **cannot move**. It gives a small shake to signal "blocked," and nothing changes.
- **Win condition:** the board is empty. All arrows have escaped.
- **Stuck (soft-lose):** if no remaining arrow has a clear path, the board is **deadlocked**. The player can't lose points or a life — they simply **Restart** the level (or spend a **Hint**). Deadlock is a normal part of solving, not a punishment.

That's the complete rule set. Everything else is layout, presentation, and pacing.

### Why this is a good puzzle

Removing one arrow can open a path for others, creating a cascade — or it can trap the arrows behind it forever. The player is really planning a **dependency order**: "I can't release this one until I've cleared that one." Depth comes from how tangled those dependencies are, not from adding rules.

---

## 3. Controls

- **Single tap** on an arrow → attempt to release it.
- That is the only gameplay input. No dragging, no gestures, no long-press during play.
- Menu / HUD taps: Pause, Restart, Hint, Settings, Back.

Deliberately minimal. The game must be fully one-thumb playable and feel identical on a small phone and a tablet.

---

## 4. Puzzle Philosophy

1. **Always solvable.** Every shipped level has at least one valid solution, guaranteed before release (see the pipeline in the TDD). A player is never asked to solve the impossible.
2. **Logic, never luck.** No hidden information, no randomness during play. The board is fully visible; the answer is deducible.
3. **Recoverable.** A wrong move can deadlock the board, but Restart is always one tap away and carries no penalty. Mistakes teach, they don't punish.
4. **One idea at a time.** Early levels introduce a single concept (a blocker, a chain, a shape) before combining them.
5. **Fair difficulty.** Hard levels are hard because the dependency chain is deep or the board is dense — never because of ambiguity or trickery.

---

## 5. Level Layouts

Arrows are placed to form recognisable **shapes** on the grid. The shape is purely visual/spatial — the rules never change. v0.1 ships these layout families:

- **Grid / free-form** — introductory, arrows placed for teaching clarity.
- **Cross**
- **Diamond**
- **Circle / ring**
- **Heart**
- **Spiral**

The layout system is a data concept (a shape mask over the grid), so new shapes can be added later without touching game code. This keeps the door open for future packs.

---

## 6. Level Progression & Difficulty Curve (v0.1 = 50 levels)

> ⚠️ "Solution depth" is not a usable dial under the current rule. The Phase 1
> engine measures `minFrontier`, `avgFrontier`, `dependencyDepth` and `density`
> instead. See [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

Difficulty is tuned with a handful of dials: **board size, arrow count, board density, and solution depth** (how many moves must be planned ahead).

| Band | Levels | Board | Arrows | Focus |
|------|--------|-------|--------|-------|
| **Onboarding** | 1–10 | 4×4 – 5×5 | 4–8 | Teach the tap, blocking, and simple 2–3 step chains. No fail states in spirit. |
| **Foundations** | 11–25 | 5×6 – 6×6 | 8–14 | First shape layouts (cross, diamond). Introduce genuine dead-ends the player must avoid. |
| **Tightening** | 26–40 | 6×7 – 7×7 | 14–20 | Denser boards, near-deadlock traps, deeper ordering. |
| **Mastery** | 41–50 | 7×7 – 7×9 | 18–26 | Heart, spiral, circle layouts. Plan several moves ahead; satisfying set-piece finishers. |

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

> ⚠️ Under the current rule, mid-level deadlock is unreachable — a board can only
> be deadlocked if it was already unsolvable before the first tap, which the level
> pipeline rejects. See [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md).

- **Win:** all arrows removed. Level marked complete, next level unlocked, progress saved.
- **No hard lose.** There are no lives, no timer, no score threshold. The only "failure" is a deadlocked board, which resolves via Restart or Hint. This keeps the tone calm and welcoming.

---

## 9. Hint System

- A **Hint** reveals the next safe arrow to tap — one that keeps the level solvable.
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
- **Readability first:** an arrow's direction must be unmistakable at a glance. Colour supports direction but is never the *only* signal (colour-blind safe).
- **Feedback:** every tap gets a response — a successful release animates off-board; a blocked tap shakes gently. The player always knows the game heard them.
- **No clutter:** the gameplay screen shows only what's needed. Menus stay one or two taps deep.
- **Accessibility:** large-target taps, reduced-motion option in Settings, no reliance on sound for critical info.

---

## 11. Audio

- **Background music:** soft, loopable, low-key ambient — supports focus, never distracts. One track for menus, one for gameplay is enough for v0.1.
- **Sound effects:** a light "swoosh" on release, a soft "bump" on a blocked tap, a warm chime on level complete. Restrained and pleasant.
- **Player control:** Music and SFX toggles in Settings, independent. Respect the device silent switch. Audio must never autoplay loudly.

---

## 12. Animation

- **Arrow release:** the arrow accelerates smoothly off the board edge and fades — quick but readable (roughly a quarter-second).
- **Blocked tap:** a small, snappy shake in place.
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
