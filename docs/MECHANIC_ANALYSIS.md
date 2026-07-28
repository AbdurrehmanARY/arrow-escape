# Mechanic analysis — where the difficulty actually lives

> **Status:** settled. The rule set below is what ArrowPath ships.
> **Written:** Phase 1, alongside the rules engine. Revised once the reference
> screenshots arrived and the snake-body model was confirmed.
> **Evidence:** `__tests__/game/mechanic-invariants.test.ts`, re-run on device by
> the Phase 1 build.

---

## The rules

- The board is a grid. Each arrow is a **snake**: a connected chain of cells with
  an **arrowhead** at one end. Bodies bend, hook, and spiral.
- **Tapping an arrow** sends it out through its own head, in the direction the
  head points. The body threads out along the trail the head clears behind it, so
  the whole snake leaves in one move.
- An arrow can leave **iff the straight ray from its arrowhead to the board edge
  is clear.** Its own body never counts — each segment vacates its cell as the one
  ahead advances, so a body that spirals in front of its own head is fine.
- If anything else is on that ray, the tap **fails**: the board is completely
  unchanged and the player **loses a heart**.
- **Win:** the board is empty. **Lose:** all five hearts spent.

---

## The one result everything else follows from

**Tap order cannot lose a level.**

A tap either removes a whole snake or changes nothing at all. Removing a snake can
only ever *free* cells — it can never put something into another arrow's way. So
"this arrow is free" is a one-way door: once a head has a clear run, it keeps that
clear run until it is tapped.

The proof is a one-line exchange argument. Suppose the board is solvable and arrow
**X** is free. Take any winning order `S` and move `X` to the front. Every other
arrow in `S` now faces a board with strictly fewer snakes on it at the moment it
is tapped, and fewer snakes can only mean fewer blockers — so each is still free
when its turn comes. The reordered sequence still wins. ∎

Three consequences:

- **Greedy always works.** Tap anything that can move, in any order, and every
  solvable board clears.
- **A solvable board can never become stuck.** Being stuck is only reachable on a
  board that was *already* unsolvable before the first tap, which the level
  pipeline rejects.
- **Solvability is a graph property, not a search problem.** An arrow's blockers
  are fixed from the start, so the level is exactly "delete the nodes of a
  directed graph in topological order." It is solvable **iff that graph is
  acyclic** — an unsolvable board is literally a cycle of arrows pointing at each
  other. `solve()` is Kahn's algorithm and runs in microseconds. Validating
  hundreds of levels in CI is effectively free.

### The evidence

| Check | Result |
|---|---|
| Exhaustive search over 20,000 random boards, comparing "solvable by some order" against "can any order get stuck" | 11,158 solvable, **0** that any order could stall |
| `random play always clears a solvable board` — plays each board three times tapping uniformly at random | never once stalled |
| `solvability survives every single move, not just good ones` | holds on every board tested |
| Graph solver vs. exhaustive brute force, 500 random boards | perfect agreement, both verdicts well represented |

---

## So where is the game?

If order cannot lose, something else has to. It is the **hearts**.

The skill this game tests is **reading the board**, not planning it. To know
whether an arrow can leave you must find its head among a mass of near-identical
lines, work out which way it points, and trace its ray across the tangle to the
edge — checking nothing crosses it. Get that wrong and it costs a heart. Five
wrong reads and the level is over.

This is why the bodies are long, bent, and drawn in a single colour. Every one of
those is a difficulty device: they exist to make tracing hard. A board of short
straight arrows in seven colours would be trivial under identical rules.

The failure state is therefore honest and slightly unusual, and the UI should say
so plainly: **you lose with the board still perfectly winnable.** The Phase 1
build asserts exactly this — `hearts are the only way to lose` fails a level and
then checks the board it left behind is still solvable.

### What this replaces

Two things in the original GDD do not survive and have been corrected in place:

- §2 claimed removing an arrow "can trap the arrows behind it forever." It cannot.
- §6 tuned difficulty by "solution depth (how many moves must be planned ahead)."
  There is no planning depth, because there is no planning.

---

## The difficulty model that replaces it

`analyze()` measures what actually varies. These are the dials the Phase 3
generator will tune.

**Tracing load** — how hard is one snake to follow?

| Metric | Why it matters |
|---|---|
| `avgBodyLength`, `maxBodyLength` | a 7-cell snake takes real effort to follow head to tail |
| `avgTurns` | a straight arrow is read at a glance; a hooked or spiralled one is not |
| `crowding` | adjacent cells belonging to *different* snakes — bodies running alongside each other is what makes a tangle read as a tangle |

**Guess pressure** — how badly does misreading hurt?

| Metric | Why it matters |
|---|---|
| `minFrontier` / `avgFrontier` | how many arrows are free at once; 1-of-9 is a hunt, 6-of-9 is a stroll |
| `expectedBlindMistakes` | **the most useful single number.** How many hearts a player who taps at random would burn clearing the level |

`expectedBlindMistakes` is worth stating precisely, because it is what makes the
heart count tunable rather than arbitrary. At each step a blind player picks
uniformly among the arrows still on the board and keeps picking until one works —
a geometric distribution with success chance `free/alive`, so the expected wrong
picks before a right one is `(alive - free) / free`. Summed over every step, that
is the hearts a blind player spends.

Compare it against the level's hearts to grade a board:

| `expectedBlindMistakes` vs hearts | What it means |
|---|---|
| well below | even careless play survives — an onboarding level |
| roughly equal | reading the board is worth doing but forgiving |
| well above | guessing reliably fails; only correct reading wins |

The Phase 1 demo board measures **10.8 against 5 hearts**. A player who taps
without looking loses; a player who traces properly clears it having lost nothing.
That gap is the entire game, and it is now a number the generator can target.

---

## Consequences for the rest of the build

- **Phase 2** needs a *thread-out* animation — head first along its ray, body
  following through the cells the head clears — plus a red flash and a heart
  decrement on a blocked tap. There is no "slide part-way" case to build.
- **Phase 3's generator** must grow self-avoiding snakes, reject any board whose
  blocking graph has a cycle, and then *tune* `expectedBlindMistakes` and the
  tracing metrics to hit a difficulty band. Solvability checking is cheap, so it
  can afford to generate and discard aggressively.
- **Phase 5** has no deadlock-recovery flow to build. What it needs instead is the
  out-of-hearts flow, and hint copy that reads as "here is one you missed."
- **Level shapes** (heart, spiral, diamond) are masks the snakes are grown inside.
  They are cosmetic to the rules and are one of the main reasons bodies bend —
  which means they contribute to difficulty as a side effect, not just to looks.

## What would change this

The property above depends on exactly one thing: **a blocked tap changes nothing.**
If a future mechanic ever lets a blocked arrow move — even a single cell — order
starts to matter, deadlock becomes real, and the entire difficulty model here has
to be rebuilt. `mechanic-invariants.test.ts` is what will tell you, loudly, on the
day someone tries it.
