# Testing ArrowPath

Two parts: the automated checks (desktop, under a minute) and playing it on your
phone.

---

## 1. Automated — 40 seconds

```bash
npm run verify
```

Runs three things in order:

| Step | What it proves |
|---|---|
| `tsc --noEmit` | the whole project typechecks under `strict` |
| `eslint` | no lint errors anywhere |
| `jest` | 237 tests — rules, solver, gates, geometry, camera, reducer, stores, storage, and all 600 levels |
| `levels:validate` | re-reads the packs *from disk* and re-solves all 600 |

Expect:

```
Test Suites: 15 passed, 15 total
Tests:       237 passed, 237 total
...
All levels decode, all are solvable, all recorded solutions verified.

  tier          count   blind mistakes: min / avg / max
  tutorial        28      1.1 /    1.8 /    2.6
  ...
  nightmare       20    148.0 /  309.6 /  539.4
```

The level check runs against the packs on disk rather than the generator's memory,
on purpose. The generator could be perfect and a level still be broken by a bad
merge or a partial write.

Other useful commands:

```bash
npm run test:coverage    # coverage, thresholds enforced on src/game
npm run levels:check     # prove every curriculum plan fits its shape
npm run levels:build     # regenerate all 600 levels (deterministic, ~6 min)
npm run levels:probe     # sample one level per tier, to re-derive difficulty targets
npm run bench            # time the per-tap hot paths against the shipped levels
npm run levels:preview   # render every theme to preview.html
npm run shapes:inspect   # print every silhouette at a real board size
npm run icons:build      # regenerate the app icons
```

---

## 2. On your phone

### Fix the network first — one command

Two things on this PC stop Expo Go connecting, and the dev bundle is **~10 MB**,
which is why the tunnel alone is not reliable here. Run this **once**, in
PowerShell:

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy','Bypass','-File','D:\arrow-escape-game\scripts\fix-dev-network.ps1'
```

It opens a UAC prompt, then removes the firewall Block rules for Node, opens
Metro's ports, and moves your network off the Public profile. It prints the
address your phone needs to be able to reach.

Then:

```bash
npm start
```

Scan the QR with **Expo Go** from the Play Store.

<details>
<summary>What it is fixing, and why the tunnel was not enough</summary>

**Problem 1 — the firewall is actively refusing connections.** There are two
*enabled Block rules* for inbound `node.exe`. These get created when someone
clicks "Cancel" on the "Allow Node.js to communicate on these networks?" popup.
Once a Block rule exists, Windows never asks again — it silently refuses every
connection, forever.

**Problem 2 — your Wi-Fi adapter has no DHCP lease.** It sits on `169.254.29.96`,
an APIPA address, which means the PC is not really on Wi-Fi at all. Only Ethernet
works (`192.168.10.253`, gateway `192.168.10.1`). That adapter is also categorised
Public, where Windows applies its strictest inbound defaults.

**Why not just use the tunnel.** It does work, but the development bundle is about
10 MB. Over the local network that is instant; over ngrok it is slow enough that
Expo Go frequently gives up mid-download — which surfaces as exactly the
`java.io.IOException: Failed to download remote update` error.

Verified on this machine: Metro binds to `0.0.0.0` and answers `HTTP 200` on
`192.168.10.253`. The server is fine. Only inbound traffic from your phone is
blocked.

**Your phone must be on the same network.** Check Settings → Wi-Fi → your network
→ IP address. If it is not `192.168.10.x`, the phone and PC are on different
networks and no firewall change will help — use the tunnel and be patient, or
connect the phone to the same router.
</details>

### Fallback: tunnel

If the network fix is not possible, this still works — just slowly on first load:

```bash
npm run start:tunnel
```

Give it a full minute before deciding it has failed. Later reloads are much
faster, because only changed modules are re-sent.

> Expo Go covers everything **except ads**, which need a native module it cannot
> load. See [ADS_SETUP.md](ADS_SETUP.md).

---

## 3. What to check

### The core loop

1. **Menu → Play.** Lands on level 1. Board fills the screen with the dot grid
   visible behind the arrows.
2. **Tap a snake with a clear run.** The head leads, the body threads out behind
   it through the cells the head cleared, and the tail whips out last. This is the
   signature moment — if it looks like a slide or a fade rather than threading,
   something is wrong and I want to know.

   **Arrows now leave at a consistent speed rather than a consistent duration**,
   which is the fix for movement feeling abrupt. Every exit used to take 720ms
   whether the snake travelled four cells or eighty-eight, so the same tap looked
   like two different mechanics depending where the arrow sat. Worth checking
   directly: clear an arrow sitting on the board edge, then one on the far side of
   a big board, and see whether they read as the same action.
3. **Tap a blocked snake on purpose.** It lurches forward and recoils, turns red,
   the *blocker* turns orange, and a heart drains. The board is otherwise
   untouched.
4. **Spend all five hearts.** The fail screen appears and says the board was still
   winnable — because on every level without a shutter gate, it is. Check that
   reads as fair rather than as the game cheating.
5. **Clear a level.** Confetti fires, **"Congratulations!"** pops in — or
   **"Perfect!"** if you did not misread once — and the win screen follows a beat
   later, so you see the last snake leave before anything covers it. The victory
   *sound* is wired but silent: there are still no audio files in the build.
6. **Clear two in a row cleanly** — the win screen starts showing a perfect-read
   streak from two upward.
7. **Open the record screen** (★ on the menu, or tap the stat tiles) to see how
   the 600 are going.
8. **Force-quit and reopen.** You should land back where you were with progress
   and hints intact.

### The pause menu — new

The play screen used to carry a back button, a settings button and a hint count
along its top edge. All three are gone; there is one **pause button** at the top
left instead, and the sheet behind it holds Resume, Restart, Settings, and Leave.

- It shows the level, its **tier name**, board size, hearts left, and how many
  arrows are out — the last of which the play screen now also shows as a thin bar
  under the level name. On a 60×60 board "how much is left" was a question nothing
  on screen could answer.
- **Tapping the dimmed background resumes.** Nobody opens a pause menu meaning to
  lose their place, so the easiest gesture is the harmless one.
- **Restart is deliberately not the highlighted button.** It is the destructive
  option, and a sheet that opens with the destructive option glowing trains people
  to tap it by reflex.

### Jumping around

Every level is open in this build. Level select has a **jump-to-number box** at
the top — type 106, hit Go. Both the menu and level select carry a TESTING badge
while that flag is on.

### Gates — new, and the most important thing to test

**100 levels have a coloured gate. 35 have one that works backwards.** Both are
things a player cannot infer by watching, so each gets a one-time card before the
first tap. Reset progress in Settings if you want to see them again.

**Ordinary gates (`opens`)** — a filled coloured square with a bar across it. It is
shut, and nothing crosses it. Clear every arrow of that colour and it opens by
itself. It becomes a dashed outline when open.

- Tapping an arrow whose path crosses a shut gate costs a heart, and the message
  should name the colour — *"A red gate is closed"*, not *"Blocked by a0"*.
- These levels can never be lost by tapping in the wrong order.

**Shutter gates (`shuts`)** — the inverse, and **the only rule in the game that can
cost you a level without costing you a heart.** They start open and seal for good
once the last arrow of their colour leaves. Level names warn you: *Sealed*,
**Shuttered**, *One-Way*, *Closing*. Levels 120, 132, 144, … every twelfth up to
588.

What to check, in order of how badly it would matter:

1. Deliberately clear the coloured arrows first. You should get a **"Wrong order"**
   screen, **with all five hearts still showing**. If you get the out-of-hearts
   screen instead, that is a bug.
2. That screen should appear **as soon as the level is unwinnable**, not when the
   board finally runs out of taps. If you can keep tapping after sealing yourself
   out, tell me.
3. Play one properly — send the arrows that need to cross the gate out *first*.
   It should feel like a genuinely different puzzle from every other level.

### The curve

Ten tiers now, from Tutorial to Nightmare. Level select shows the tier name; the
colour pips pair them up (two tiers per colour).

- **Levels 1–4** should be nearly impossible to fail even tapping carelessly.
- **By level 20** you should be losing hearts if you are not tracing properly.
- **After level 20 the difficulty is deliberately mixed.** An Easy board can
  follow a Super Hard one. That is the design — tell me if it feels random rather
  than refreshing.
- **Snakes are much longer than before** — up to fourteen cells in the top tiers,
  where they used to stop at six. This is the single biggest change to how a board
  feels. If tracing has gone from hard to hopeless, that is the number to tell me
  about.
- **Jump ahead** from level select to sample the tiers. Try something in the 300s,
  something in the 500s, and level 600.

### Dense boards — new

**46 levels are packed to roughly four cells in five** (71–83% of the board
covered), spread from Medium up through Nightmare. Their names say so: *Packed*,
*Crowded*, *Teeming*, *Choked*, *Jammed*.

Two things about them are deliberate and worth knowing before you judge them:

- **They are small boards — 18 to 24 a side, always a plain rectangle.** That is a
  hard limit, not a shortcut. An arrow can only move when its whole ray to the edge
  is clear, so at fixed density the chance that *anything* on the board can move
  collapses exponentially as the board grows. Measured: four in four solvable at
  24x24, **none at all** at 50x50 or 60x60. Four-fifths coverage on a 60x60 board
  does not make a hard level, it makes no level.
- **They carry no gates.** A dense board already asks for full attention; two
  mechanics competing for it means neither gets it.

What to check: do they feel like *meaningful congestion* — where you have to find
the one snake with a way out and work inward — or just visual noise? That is the
distinction that decides whether they are worth keeping, and it is the one thing I
cannot measure from here.

### Shapes

**114 silhouettes**, up from 74. New this phase: the alphabet (A–Z), digits, maths
symbols, and a set of *procedural* patterns — mandala, honeycomb, maze, knotwork,
star tiling, double helix, galaxy.

The procedural ones are different in kind from the rest: instead of outlining the
board they perforate it, so snakes have to thread through corridors and bend
constantly. Worth a look at whether they read as patterns or as damage.

Letters and digits only appear on boards of 13 or more, since a stroke needs room
to stay a stroke. If you spot one that is unrecognisable, name the level.

### Touch — please be brutal with this

The board used to swallow taps, and the cause was structural rather than a tuning
problem: the pan gesture had **no activation threshold**, so it claimed the touch
on the first pixel of movement and cancelled the button underneath. Every real tap
drifts a pixel or two. Four separate things were changed:

1. **Pan now needs 14dp of movement** before it takes over. A stationary finger can
   no longer be stolen from.
2. **The whole board is one tap surface**, not one button per cell. React Native's
   buttons and gesture-handler's gestures do not negotiate with each other, and
   mixing them was the root cause. It is also a thousand fewer views on a big board.
3. **Near-misses count.** A tap that lands within about four-fifths of a cell of a
   snake selects that snake. A tap on genuinely empty board still does nothing —
   that part matters, since selecting the wrong arrow costs a heart.
4. **Taps are no longer refused while an arrow is leaving.** They used to be, which
   became untenable once the exit animation was slowed down.

An arrow now **dims the instant your finger lands on it**, before you lift. That is
the quickest way to tell a tap that was received from one that was not.

What to check: tap fast, tap two different arrows in quick succession, tap while
one is still flying, tap right at the edge of a snake, and tap while zoomed all the
way in and all the way out. Every one should register first time.

### Oversized boards

Almost every level past Easy is now bigger than your screen. On those:

- **Drag** to pan, **pinch** to zoom, **Fit** button to snap back to the whole
  board. There is deliberately no double-tap: on a board covered in tap targets it
  is indistinguishable from two taps on an arrow, and it was costing two hearts.
- The board cannot be dragged off into empty space; the camera is clamped.
- **Tapping must stay accurate at every zoom level.** This is the thing most
  likely to be subtly wrong, so please test it zoomed right in and right out.
- **Level 600 is 60×60** — 3,600 cells. Zoomed out it is an overview, not something
  you can play from; zoom in to read it. You can always reach at least 1:1 however
  big the board is, which needed fixing: the zoom ceiling used to be a multiple of
  fit-to-screen, so on a 60×60 board the closest you could get was 80% of the
  designed cell size.
- Board sizes are now roughly **Medium 30×30, Hard 40×40, Super Hard 50×50,
  Nightmare 60×60**. Big boards are deliberately *sparser* than the old small ones
  — a 30×30 Medium holds around twenty-five snakes, not eighty. If Medium feels
  empty rather than spacious, say so; the fill is one number per tier.

The most useful thing you can tell me is **where you got stuck or bored**. Every
level's difficulty is one number in `tools/curriculum.ts` and a 28-second
rebuild away.

### Themes

Settings → Look. Six themes, each setting palette, arrow shape, and board pattern
independently. Switch mid-level; the board redraws immediately.

**Noodles is deliberately easier** — it colours every snake separately, and telling
snakes apart is the skill the game tests. Try a hard level in Paper, then the same
one in Noodles, to see how much of the difficulty is the single-colour rule.

### Accessibility and settings

- **Reduced motion** — arrows leave instantly. Worth checking if animation is
  uncomfortable or the phone is older.
- **Assist** — permanently highlights every arrow that can leave. Removes most of
  the challenge by design; it is there for accessibility.
- **Confirm restart** — only prompts once you have actually tapped something.
- **Reset all progress** — confirms first, then genuinely wipes everything.

### Hints

You start with **3 free hints**. A hint highlights an arrow that provably has a
clear run, so it can never cost you a heart. When they run out, the button offers
a rewarded ad — which will say ads are unavailable in Expo Go, and fall back to
pointing out that restarting is always free. That fallback is the important bit to
check: nothing in the game should ever be blocked behind an ad.

---

## 4. What is deliberately missing

| Missing | Why | Where it is described |
|---|---|---|
| **Sound** | audio files are the one thing I cannot generate. The game runs silent and gains sound the moment they are dropped in | `assets/audio/README.md` |
| **App icon** | still Expo's placeholder | [RELEASE.md](RELEASE.md) |
| **Working ads** | needs your AdMob account and a dev-client build | [ADS_SETUP.md](ADS_SETUP.md) |

None of these block playing or testing the game.

---

## 5. If something goes wrong

### Clear the cache after any dependency change

**Metro caches transformed code, and a package's version gets baked into that
output.** Change a dependency version and the cache keeps serving code compiled by
the old one — which is how you end up with an error naming two versions of the
same package at once:

```
[Worklets] Mismatch between JavaScript code version and
Worklets Babel plugin version (0.10.0 vs. 0.10.3).
```

Nothing is actually wrong with the install there. `0.10.0` is what is on disk;
`0.10.3` is what compiled the cached bundle. So after **any** version change:

```bash
npm run start:clear
```

If that is not enough, purge every layer:

```powershell
Remove-Item "$env:TEMP\metro-cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\metro-file-map-*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .expo -Recurse -Force -ErrorAction SilentlyContinue
npm run start:clear
```

### Symptom table


| Symptom | Fix |
|---|---|
| Expo Go: "Failed to download remote update" | The phone cannot reach the dev server, or the 10 MB bundle timed out. Run `scripts/fix-dev-network.ps1` as admin, then `npm start` |
| Metro can't resolve `@game` / `@components` | `npx expo start --clear` to reset the cache |
| **Expo Go closes outright, no error screen** | A *native* crash — almost always a package version Expo Go was not built against. Run `npx expo install --check`, then `npx expo install --fix` |
| A dark "Something broke" screen with a stack trace | A *JavaScript* error, and the message names the file. Send me the text |
| `[Worklets] Mismatch between JavaScript code version and Worklets Babel plugin version` | A stale Metro cache — see below. `npm run start:clear` |
| Any error naming two different versions of the same package | Same cause. `npm run start:clear` |
| Red screen, anything else | Screenshot it — the stack trace names the file |
| Board looks cramped on a small phone | Expected on 12×12 mastery levels; tell me and I'll cap the cell size |
| Expo Go says the SDK is unsupported | Update Expo Go; this project is on SDK 57 |
