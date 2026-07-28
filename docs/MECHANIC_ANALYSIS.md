# Mechanic analysis — the core rule has no decisions in it

> **Status:** open design decision. Blocks Phase 2.
> **Written:** Phase 1, alongside the rules engine.
> **Evidence:** `__tests__/game/mechanic-invariants.test.ts`, reproducible on device via the Phase 1 build.

---

## The claim

Under the rule set as written in the GDD, **the player cannot make a wrong move.**

Every level that can be finished at all is finished by *any* tap order. There is no
ordering to discover, no dependency to plan around, and no way to deadlock a board
that started solvable. The GDD's central question — *"what is the right order to
tap?"* — has the answer "any of them."

## Why

The GDD rule is:

- Tap an arrow. If its straight path to the edge is empty, it flies off.
- If anything blocks that path, **nothing happens at all.**

The second half is what does the damage. Because a blocked arrow does not move,
the only thing that ever changes on the board is that arrows **leave**. And an
arrow leaving can never put something *into* another arrow's path.

So "this arrow is free" is a one-way door. Once an arrow's path is clear, it stays
clear until that arrow is tapped. Nothing can ever re-block it.

That gives the proof directly. Suppose the board is solvable, and arrow **X** is
free right now. Take any winning order `S`. Move `X` to the front of `S`. Every
other arrow in `S` now faces a board with *strictly fewer* arrows on it at the
moment it is tapped than it did before — and fewer arrows can only mean fewer
blockers. So each of them is still free when its turn comes, and the reordered
sequence still wins. Tapping any free arrow first is therefore always safe. ∎

The consequences follow immediately:

- **Greedy always works.** Repeatedly tap anything that can move; you will clear
  every solvable board.
- **A solvable board can never become deadlocked.** Deadlock is only reachable on
  a board that was *already* unsolvable before the first tap.
- **"Solution depth" is not a difficulty dial.** There is no planning depth to
  vary, because there is no planning.

## The evidence

Three independent checks, all of which agree:

| Check | Result |
|---|---|
| Exhaustive search over 20,000 random boards, comparing "solvable by some order" against "can any order get stuck" | 11,158 solvable boards, **0** that any order could deadlock |
| `escape-only: every tap order wins` — plays every solvable board five times with uniformly random tapping | never once got stuck |
| `escape-only: a board that starts solvable can never become deadlocked` — asserts solvability is preserved after *every* move, not just good ones | holds on every board tested |

The solver takes advantage of this rather than fighting it. Since an arrow's
blockers are fixed from the start, the whole variant reduces to a graph problem:
draw an edge from X to Y when X sits on Y's path, and the level is "delete these
nodes in topological order." A level is solvable **exactly when that graph is
acyclic** — an unsolvable board is a literal cycle of arrows pointing at each
other. No search is required; `solveEscapeOnly` is Kahn's algorithm and runs in
microseconds. That is a genuinely nice property, and it is why level validation
over hundreds of levels will be instant.

## What this does *not* mean

It does not mean the game is bad. It means it is a **different genre** than the
GDD describes. This exact structure is what *Parking Jam* and *Traffic Escape*
ship, and they are enormously successful. In those games the challenge is
**visual search under density** — spotting which car is actually free on a
crowded board — not planning. That is a real skill and a real game.

But it does mean two things in the GDD are currently false and need to be
rewritten whichever way this goes:

- §2: *"Removing one arrow can open a path for others... or it can trap the arrows
  behind it forever."* The second half cannot happen.
- §6: difficulty is tuned by "solution depth (how many moves must be planned
  ahead)." There is nothing to plan ahead.

## The two options

### Option A — keep `escape-only`, retune the difficulty model

Accept that ArrowPath is a spatial-search game. Nothing about the code changes;
the engine already ships this variant as the default.

What changes is **how levels are made hard**. The metrics in `analyze()` were
rewritten for this:

- `minFrontier` / `avgFrontier` — how many arrows are tappable at once. A board
  where only one arrow is ever free is a hunt; one where twelve are free is
  effortless. **This is the real difficulty dial.**
- `dependencyDepth` — the longest forced chain of removals. Adds structure and
  a sense of cascade even though the player never has to *choose*.
- `density` — dense boards read as harder and feel more satisfying to clear.

Hints stay meaningful (they point out a free arrow you missed). Deadlock UX can be
deleted entirely, which simplifies Phase 5. The GDD's "no hard lose" tone becomes
literally true.

**Cost:** the game has no *aha*. It is calm and pleasant, not clever.

### Option B — switch to `slide-and-stop`

Change one rule: a blocked arrow **slides as far as it can and stops** just short
of whatever blocked it, instead of doing nothing. It is still on the board, in a
new cell, now blocking different arrows.

This restores everything the GDD promised. Order genuinely decides the level.
Deadlock is real and is the player's own doing. Planning depth exists.

Here is the smallest board that shows it, found by search and verified by hand.
It is the fixture the test suite and the on-device self-check both use:

```
. ▼ ◀
▶ ▶ .
. . ▲
```

Two arrows can be tapped: the middle `▶`, which has a clear run to the right edge,
and the bottom-right `▲`, which is blocked and can only shuffle one cell up.

- Tap the `▶` first → the board is winnable.
- Tap the `▲` first → it slides into the exact cell the `▶` needed. Both are now
  jammed, and **the level is unwinnable.**

Same arrows. Same layout. The rule is the only difference.

**Cost:** real, but contained.

- The solver needs actual search for this variant (already written, already
  tested against brute force). Validation is slower but still fast enough.
- Levels get harder to generate — most random boards under this rule are
  *unsolvable*, because two arrows pointing at each other simply crash and jam.
  The generator will need to reject a lot of candidates. Trap boards are rare in
  random sampling (~0.4% of solvable boards), so the generator must search for
  them deliberately rather than stumble on them.
- Phase 2 needs a slide animation as well as an exit animation.
- Deadlock recovery UX (Phase 5) becomes load-bearing rather than decorative.

## Recommendation

**Option B, `slide-and-stop`** — if the goal is the game the GDD describes.

The GDD is unambiguous that ArrowPath is meant to be a logic game about
dependency order, and it repeatedly promises an *aha*. `escape-only` cannot
deliver that at any level size, because the property is structural, not a matter
of tuning. No amount of clever level design creates a decision where the rules
admit none.

The added cost is mostly in the level generator, which is Phase 3 work that has
not started — so this is the cheapest moment in the entire project to make this
call. Making it after 50 levels are curated would be far more expensive.

**Choose Option A instead if** you specifically want the calm, no-fail,
*Parking Jam* feel. That is a legitimate product, and it is a materially smaller
build. Just retitle the pitch: it is a spatial-search game, not a logic game.

## How the code is set up either way

Both rule sets are implemented, tested, and shippable **today**. `RuleVariant` is
a field on the level, so the decision is one line per level file, not a rewrite:

```ts
export type RuleVariant = 'escape-only' | 'slide-and-stop';
```

`escape-only` is the current default, matching the GDD as written. Every function
in `game/` handles both. Whichever you pick, the other can be deleted in an
afternoon — or kept, if a later level pack wants to mix them.

The one thing that should **not** happen is shipping `escape-only` while telling
players it is a planning puzzle. They will notice.
