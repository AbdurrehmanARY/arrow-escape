# Performance

> **Status:** the measurable half is done and the numbers are below. The half that
> needs a physical mid-range Android device is listed at the end, unmeasured and
> honestly labelled as such.

---

## What a tap actually costs

`npm run bench` times the hot paths against the levels that ship. The numbers are
from a desktop machine, so they are **not frame budgets** — a mid-range phone's JS
thread is several times slower. What they are good for is ratios and outliers.

Worst case in the library — level 586, 58×59, 87 snakes:

| Work | When it is paid | Time |
|---|---|---|
| `decode` + `buildLevel` | once, entering the level | 0.32 ms |
| `resolveTap` | every tap | < 0.01 ms |
| `applyOutcome` | every successful tap | < 0.01 ms |
| geometry for the whole board | every full re-render | 0.21 ms |
| `isDoomed` | every tap, shutter boards only | < 0.01 ms |
| `findSafeMove` (hint) | on demand | 0.23 ms |
| `findAllSafeMoves` (assist) | every tap while Assist is on | 0.20 ms |
| solve all 600 levels | never, on device | 47 ms |

**The engine is not the bottleneck, and it is not close.** Everything a tap does in
`src/game/` is under a hundredth of a millisecond. Even with a phone ten times
slower and a safety factor on top, the domain layer has no measurable share of a
16 ms frame. That is the dividend from `game/` being pure: it was written to be
testable off-device, and it turns out to be cheap for the same reasons.

So every real cost is in the **renderer**, which this benchmark deliberately does
not pretend to measure.

---

## What was actually wrong

### The memo was dead

`ArrowSnake` is memoised so that tapping one arrow redraws that arrow, not the
other ninety. It had been doing nothing since the touch rewrite, because
`BoardCanvas` passed:

```tsx
onDepartComplete={() => onDepartComplete(index)}
```

A fresh closure per arrow per render. The shallow comparison failed for every
arrow, so **every tap re-rendered every snake** — rebuilding geometry and
re-creating four animated props each, on boards with up to 110 of them.

This is the worst class of performance bug: it has no symptoms. The component
still renders correctly. Nothing logs, nothing warns, no test fails. It is only
slow, and only on the boards least able to afford it.

Fixed by making the callback take the index instead of closing over it, so one
stable function serves every arrow. `__tests__/components/arrowSnakeMemo.test.tsx`
now counts renders and fails if it regresses — including a negative control, so
the test cannot pass by accident if the memo is removed entirely.

### Nothing may scale with cell count

A 60×60 board is 3,600 cells. Two things used to be drawn per cell:

- **The grid** — now one tiled SVG `<Pattern>`, three nodes regardless of size.
- **Touch targets** — were a `Pressable` per occupied cell, over a thousand views
  on a large board. Now one gesture-handler tap surface and an arithmetic hit test.

The accessibility handles are one view per *arrow*, memoised on the arrow set, so
they are rebuilt when the board changes rather than on every tap.

### Node budget on dense boards

Above 45 snakes, arrows drop their drop-shadow and gloss highlight
(`SIMPLIFY_ABOVE_ARROWS`). Each is a full-length `<Polyline>` with round joins at a
real stroke width — most of the draw cost and none of the information. They are
also least visible on exactly those boards, which are played zoomed out where a
shadow offset of a twentieth of a cell lands inside one screen pixel.

This is a **node budget, not a style decision**, which is why it lives in the
renderer and not in the theme. A theme says what an arrow looks like; this says how
much the renderer can afford to spend saying it. The threshold sits above every
board that fits a screen, so levels a player studies up close are untouched.

---

## Known costs that were kept

Listed because they are deliberate, not overlooked.

**Press feedback invalidates every arrow's group props.** Each `ArrowSnake` reads
`pressedArrow` in an animated style, so a touch-down re-runs one small worklet per
arrow on the UI thread. On a 90-snake board that is 90 worklets and 90 native prop
updates per press. It was kept because instant press feedback is the difference
between a board that feels responsive and one that feels broken, and because it
runs on the UI thread rather than JS — it cannot block a tap from being handled.
If it ever shows up on a device trace, the fix is to move the highlight to a single
overlay node rather than onto the arrows.

**Occupancy is copied to the UI thread on every tap.** `Int32Array` does not cross
the worklet boundary, so `BoardCanvas` keeps a plain-array copy — 3,600 numbers on
the largest boards, rebuilt per tap. It must be current: a stale copy would resolve
a tap to an arrow that has already left, and the tap would be silently dropped.
That correctness requirement is why it is not throttled or debounced.

**A full playthrough of the busiest board is 1.3 ms of engine time**, for 87 taps.
There is nothing to win here.

---

## Not measured — needs a device

Everything below can only be answered on real hardware, and guessing at it in a
document would be worse than leaving it blank.

1. **Frame rate while an arrow leaves, on a 50×50+ board.** The exit animation runs
   on the UI thread via Reanimated, so it should survive a busy JS thread — but
   "should" is doing a lot of work in that sentence.
2. **Draw cost of 90 snakes.** ~90 group nodes, ~90 body polylines and ~90 head
   polygons, with round joins. This is the number most likely to disappoint, and
   `SIMPLIFY_ABOVE_ARROWS` is the dial: lower it to strip more, or add a variant
   that drops the animated head group as well.
3. **Pinch and pan smoothness at 3,600 cells.** The camera maths is a worklet and
   clamps during the gesture, so the risk is not the maths but the size of the
   transformed subtree.
4. **Memory and first paint on entering level 600.** Decode is 0.3 ms; mounting a
   few hundred SVG nodes is not, and is not measurable here.
5. **Whether `MIN_CELL_SIZE = 26` is right on a small screen.** It decides how much
   board fits at 1:1 against how tappable a cell is. The tap tolerance now forgives
   near-misses, which may mean a smaller cell is affordable — that would put more
   board on screen at once, which is worth real difficulty.

### How to measure them

```bash
npx expo start --no-dev --minify   # profile a release-like bundle, never a dev one
```

A dev bundle is several times slower than what ships, so a trace taken against
`npm start` will report problems that do not exist and hide ones that do. Then
Android Studio's profiler, or `adb shell dumpsys gfxinfo <package>` for a quick
jank histogram.

The one number worth writing down: **play level 600 for a minute and report whether
it feels smooth.** That is more actionable than any trace, because every fix above
is a threshold constant and each one is a one-line change and a rebuild away.
