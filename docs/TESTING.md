# Testing ArrowPath

Two parts: the automated checks (desktop, about fifteen minutes now) and playing it
on your phone.

---

## 1. Automated — about 15 minutes

```bash
npm run verify
```

**It used to take 40 seconds.** Nearly all of the new time is one test sweep that
solves all 600 boards, and the boards are now packed to four-fifths — roughly 70,000
arrows against 20,000 before. Solving is still microseconds per board; there is just
a great deal more board. If you want the fast signal while working, run
`npx jest --testPathIgnorePatterns data/levels` and it is back under a minute.

| Step              | What it proves                                                                                                            | Time |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---- |
| `tsc --noEmit`    | the whole project typechecks under `strict`                                                                               | ~30s |
| `eslint`          | no lint errors anywhere                                                                                                   | ~1m  |
| `jest`            | 246 tests — rules, solver, gates, geometry, camera, reducer, stores, storage, the board's tap surface, and all 600 levels | ~13m |
| `levels:validate` | re-reads the packs _from disk_ and re-solves all 600                                                                      | ~1m  |

Expect:

```
Test Suites: 16 passed, 16 total
Tests:       246 passed, 246 total
...
All levels decode, all are solvable, all recorded solutions verified.

  tier          count   blind mistakes: min / avg / max
  tutorial        29      1.4 /   11.0 /   32.3
  ...
  nightmare       22     92.2 /  592.0 /  762.5
```

Two numbers in that table look wrong and are not. `brutal` averages _fewer_ blind
mistakes than `hard`, and the top four tiers do not order among themselves. That
metric models a player tapping **at random**, so it responds to how many arrows are
free at once — and at a fixed density, longer snakes mean fewer arrows. The top
tiers are ordered by snake length instead, which rises at every step from 3.0 cells
to 11.3. See decision 87 in [PROJECT_MEMORY.md](PROJECT_MEMORY.md).

The level check runs against the packs on disk rather than the generator's memory,
on purpose. The generator could be perfect and a level still be broken by a bad
merge or a partial write.

Other useful commands:

```bash
npm run test:coverage    # coverage, thresholds enforced on src/game
npm run levels:check     # prove every curriculum plan fits its shape
npm run levels:build     # regenerate all 600 levels (deterministic, ~3 min)
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
npm run dev
```

Scan the QR with your **development build** — not Expo Go.

> ### ⚠️ Expo Go can no longer run the game
>
> The board renders with **React Native Skia**, which is a native module Expo Go
> does not bundle. Expo Go still opens the menu and the settings screens, but
> **the play screen will crash**.
>
> This is not a regression to fix. It is the cost of the renderer change that
> removed the frame drops on large boards, and it was a one-way door — see
> decision 99 in [PROJECT_MEMORY.md](PROJECT_MEMORY.md).
>
> `npm run start:go` is kept for the non-gameplay screens only. For anything
> involving a board, install a development build once (`npm run build:dev`) and
> use `npm run dev` from then on. It behaves exactly like Expo Go afterwards —
> same QR, same fast refresh — it is just your own app rather than a generic host.

<details>
<summary>What it is fixing, and why the tunnel was not enough</summary>

**Problem 1 — the firewall is actively refusing connections.** There are two
_enabled Block rules_ for inbound `node.exe`. These get created when someone
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

### Development builds — the other way to run it

Expo Go is a fixed app: it ships a set of native modules and cannot load any
others. That is why ads have never been testable. A **development build** is your
own app, compiled with your own native dependencies, with the same fast refresh
and dev menu on top — so it can load anything the production app can.

`expo-dev-client` is installed and `eas.json` has a `development` profile:

```bash
npm run eas:login        # once — free Expo account
npm run eas:configure    # once — links the project
npm run build:dev        # builds the APK on EAS, prints a download link
npm run dev              # starts Metro for the dev build
```

There is nothing to install first. The scripts call EAS through
`npx --yes eas-cli@latest`; typing a bare `eas` is what produces
`'eas' is not recognized`.

Full command-by-command walkthrough, including installing the APK on the phone,
is in [RELEASE.md](RELEASE.md#development-builds).

**Which runtime does which:**

| Script               | Runs in           | Use for                              |
| -------------------- | ----------------- | ------------------------------------ |
| `npm run start:go`   | Expo Go           | quickest loop, no build step, no ads |
| `npm run dev`        | development build | anything native — ads especially     |
| `npm run dev:tunnel` | development build | same, over the tunnel this PC needs  |

`npm start` is left as it was. With `expo-dev-client` installed the bare command
targets a development build, so **use `npm run start:go` when you mean Expo Go**
rather than relying on the default.

The development build does not replace Expo Go — keep using Expo Go for gameplay
and level testing, where it is faster. Reach for the development build when you
need the real native app.

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
   the _blocker_ turns orange, and a heart drains. The board is otherwise
   untouched.
4. **Spend all five hearts.** The fail screen appears and says the board was still
   winnable — because on every level without a shutter gate, it is. Check that
   reads as fair rather than as the game cheating.
5. **Clear a level.** Confetti fires, **"Congratulations!"** pops in — or
   **"Perfect!"** if you did not misread once — and the win screen follows a beat
   later, so you see the last snake leave before anything covers it. The victory
   _sound_ is wired but silent: there are still no audio files in the build.
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
  should name the colour — _"A red gate is closed"_, not _"Blocked by a0"_.
- These levels can never be lost by tapping in the wrong order.

**Shutter gates (`shuts`)** — the inverse, and **the only rule in the game that can
cost you a level without costing you a heart.** They start open and seal for good
once the last arrow of their colour leaves. Level names warn you: _Sealed_,
**Shuttered**, _One-Way_, _Closing_. Levels 120, 132, 144, … every twelfth up to 588.

What to check, in order of how badly it would matter:

1. Deliberately clear the coloured arrows first. You should get a **"Wrong order"**
   screen, **with all five hearts still showing**. If you get the out-of-hearts
   screen instead, that is a bug.
2. That screen should appear **as soon as the level is unwinnable**, not when the
   board finally runs out of taps. If you can keep tapping after sealing yourself
   out, tell me.
3. Play one properly — send the arrows that need to cross the gate out _first_.
   It should feel like a genuinely different puzzle from every other level.

### The curve

Ten tiers now, from Tutorial to Nightmare. Level select shows the tier name; the
colour pips pair them up (two tiers per colour).

- **Levels 1–4** should be nearly impossible to fail even tapping carelessly.
- **By level 20** you should be losing hearts if you are not tracing properly.
- **After level 20 the difficulty is deliberately mixed.** An Easy board can
  follow a Super Hard one. That is the design — tell me if it feels random rather
  than refreshing.
- **Snakes are much longer than before** — averaging eleven cells in the top tiers
  and reaching twenty-six, where they used to stop at six. This is the single
  biggest change to how a board feels, and it is now also what separates the top
  four tiers from each other. If tracing has gone from hard to hopeless, that is
  the number to tell me about.
- **Jump ahead** from level select to sample the tiers. Try something in the 300s,
  something in the 500s, and level 600.

### Dense boards — now every board

**This is the biggest change in the build, and the main thing to judge.**

Density used to be a special case: 46 levels packed to four-fifths, all of them
small rectangles, because at that density on a big board nothing could move. That
limit turned out to be a property of _how_ the boards were generated rather than of
the game. Generating at random and checking gave **zero** playable 50×50 boards;
building them centre-outward and keeping each snake only when it still has a way
out gives about nine in ten, because the order it is built in is exactly the order
it comes apart in.

So now **almost every board is packed**:

| Tier        | Fill | Avg snake | Longest |
| ----------- | ---- | --------- | ------- |
| tutorial    | 78%  | 3.0       | 4.1     |
| easy        | 87%  | 3.4       | 5.0     |
| casual      | 89%  | 4.8       | 7.9     |
| medium      | 90%  | 5.8       | 10.9    |
| tricky      | 90%  | 6.9       | 12.8    |
| hard        | 87%  | 7.6       | 14.4    |
| superHard   | 81%  | 10.3      | 18.0    |
| extremeHard | 81%  | 10.9      | 21.4    |
| brutal      | 80%  | 11.0      | 23.5    |
| nightmare   | 79%  | 11.3      | 26.1    |

Measured against the **playable area** — the silhouette, not the rectangle around
it. A pumpkin cannot fill a grid.

**What to check, in order of how much it matters:**

1. **Do the packed boards read, or are they noise?** The intended feeling is
   meaningful congestion: you find the one snake with a way out and work inward. If
   instead it reads as a wall of colour you tap at hopefully, say so — the fill
   numbers are one constant and they can come down.
2. **Levels 21–50 specifically.** Packing the early game raised its floor a long
   way; the first fifty levels went from a handful of expected misreads to about 156. Levels 1–20 are deliberately still gentle. If the game now gets hard at
   level 25 rather than level 100, that is the thing to report.
3. **Do the top four tiers feel different from each other?** They are all about
   50×50 and differ only in snake length and how often a gate appears, because
   density and board size fight past 50 a side. If Nightmare feels like Super Hard
   with a different label, the fix is to let those boards grow — at the cost of the
   fill numbers above.
4. **Shutter levels are deliberately sparse** (66%), and are the ones named for
   planning. An order can only be worked out on a board open enough to see the
   dependencies in. They should feel like a different _kind_ of level, not a
   thinner one.

### Shapes

**137 silhouettes in the library**, of which **64 appear in the shipped 600**. The
gap is the price of density: a silhouette can only ever fill part of its grid, so
three levels in four are now open rectangles and the shape rotation has fewer slots
to spend. If the boards feel same-y, that ratio is the dial — say so and it moves.

New this phase: the alphabet (A–Z), digits, maths symbols, and a set of
_procedural_ patterns — mandala, honeycomb, maze, knotwork, star tiling, double
helix, galaxy.

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

### Hearts — the bug you reported

**Fixed, and the cause was a swallowed tap rather than a broken counter.** In the
performance pass I moved the hit test onto the UI thread. It did not reliably
compile as a worklet, and when it fails the gesture handler throws and the tap does
nothing at all — which from the outside is indistinguishable from hearts that will
not go down. The reducer had been right the whole time; nothing was reaching it.

The hit test is plain JavaScript again, where it measures under a hundredth of a
millisecond anyway, and there is now a test that drives the real tap surface and
walks the count 5 → 4 → 3 → 2 → 1 → 0.

Worth confirming by hand, since this is the path that had no coverage before:

1. **Tap the same blocked arrow five times.** The count should fall by exactly one
   each time and the fail screen should appear on the fifth.
2. **Tap an arrow with a clear run.** No heart should be spent.
3. **Tap empty board.** Nothing should happen — no heart, no flash.
4. **Tap a blocked arrow while another is mid-flight.** Still exactly one heart.

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
  Nightmare 60×60**. Big boards are deliberately _sparser_ than the old small ones
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
- **Volume — new.** Three five-step controls under Sound: Master, Music and
  Effects, plus the existing Music and Sound-effects switches. **They will do
  nothing audible**, because there are no audio files in the build; the screen says
  so rather than leaving you wondering. What is worth checking is that the settings
  persist across a force-quit, since that part is real.

  Five steps rather than a slider on purpose: a slider needs a native dependency,
  and adding one to this toolchain has broken it twice.

### Hints

You start with **3 free hints**. A hint highlights an arrow that provably has a
clear run, so it can never cost you a heart. When they run out, the button offers
a rewarded ad — which will say ads are unavailable in Expo Go, and fall back to
pointing out that restarting is always free. That fallback is the important bit to
check: nothing in the game should ever be blocked behind an ad.

---

## 4. What is deliberately missing

| Missing         | Why                                                                                                                  | Where it is described        |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Sound**       | audio files are the one thing I cannot generate. The game runs silent and gains sound the moment they are dropped in | `assets/audio/README.md`     |
| **App icon**    | still Expo's placeholder                                                                                             | [RELEASE.md](RELEASE.md)     |
| **Working ads** | needs your AdMob account and a dev-client build                                                                      | [ADS_SETUP.md](ADS_SETUP.md) |

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
Remove-Item node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
npm run start:clear
```

### Starting completely fresh

**Clearing the cache on this PC does not clear anything on the phone.** That is
the single most common reason a change appears to be missing: Metro rebuilds
correctly, and Expo Go keeps serving the bundle it already had. If a new feature
seems absent, do the phone half before suspecting the code.

Three levels, cheapest first.

**1 — Metro only.** Right after a level rebuild or a source change:

```powershell
npm run start:clear
```

**2 — Every cache on this machine.** After changing a dependency, or when
something is behaving as though it is a version behind:

```powershell
Remove-Item "$env:TEMP\metro-cache" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:TEMP\metro-file-map-*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item .expo -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item node_modules\.cache -Recurse -Force -ErrorAction SilentlyContinue
npm run start:clear
```

**3 — A genuine first-run, including the phone.** Reinstall, then clear Expo Go:

```powershell
Remove-Item node_modules -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item package-lock.json -Force -ErrorAction SilentlyContinue
npm install
npm run verify
npm run start:clear
```

Then **on the phone**, one of:

- Android Settings → Apps → **Expo Go** → Storage → **Clear storage**, or
- shake the device in Expo Go → **Reload**, or
- swipe Expo Go out of recents and rescan the QR.

`npm run verify` is in that list on purpose: a fresh `node_modules` is exactly
when a dependency resolves differently, and it is better to find that on the
desktop than to spend twenty minutes wondering why the phone is odd.

> Do **not** delete `.npmrc`. It pins `legacy-peer-deps=true`, and Expo 57 ships a
> `react-dom` whose peer range excludes the pinned React. Installing without it
> prunes packages and silently breaks the babel and jest toolchains.

Level data needs no special step. The 600 levels are committed JSON under
`src/data/levels/`, so they are bundled like any other module — but that is also
why a stale Metro cache can serve _old levels_ after a rebuild, which looks like
the generator having done nothing. `npm run levels:build` then `npm run
start:clear`, in that order.

### Symptom table

| Symptom                                                                                 | Fix                                                                                                                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo Go: "Failed to download remote update"                                             | The phone cannot reach the dev server, or the 10 MB bundle timed out. Run `scripts/fix-dev-network.ps1` as admin, then `npm start`              |
| Metro can't resolve `@game` / `@components`                                             | `npx expo start --clear` to reset the cache                                                                                                     |
| **Expo Go closes outright, no error screen**                                            | A _native_ crash — almost always a package version Expo Go was not built against. Run `npx expo install --check`, then `npx expo install --fix` |
| A dark "Something broke" screen with a stack trace                                      | A _JavaScript_ error, and the message names the file. Send me the text                                                                          |
| `[Worklets] Mismatch between JavaScript code version and Worklets Babel plugin version` | A stale Metro cache — see below. `npm run start:clear`                                                                                          |
| Any error naming two different versions of the same package                             | Same cause. `npm run start:clear`                                                                                                               |
| Red screen, anything else                                                               | Screenshot it — the stack trace names the file                                                                                                  |
| Board looks cramped on a small phone                                                    | Expected on 12×12 mastery levels; tell me and I'll cap the cell size                                                                            |
| Expo Go says the SDK is unsupported                                                     | Update Expo Go; this project is on SDK 57                                                                                                       |
