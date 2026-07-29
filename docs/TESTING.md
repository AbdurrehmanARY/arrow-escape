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
| `jest` | 190 tests — rules, solver, geometry, camera, reducer, stores, storage, and all 600 levels |
| `levels:validate` | re-reads the level JSON *from disk* and re-solves all 50 |

Expect:

```
Test Suites: 12 passed, 12 total
Tests:       190 passed, 190 total
...
All levels solvable, all recorded solutions verified.
Difficulty runs 0.5 → 21.3 expected blind mistakes.
```

The level check runs against the files on disk rather than the generator's memory,
on purpose. The generator could be perfect and a level still be broken by a bad
merge or a partial write.

Other useful commands:

```bash
npm run test:coverage    # coverage, thresholds enforced on src/game
npm run levels:check     # prove every curriculum plan fits its shape
npm run levels:build     # regenerate all 50 levels (deterministic)
npm run levels:preview   # render every theme to preview.html
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
3. **Tap a blocked snake on purpose.** It lurches forward and recoils, turns red,
   the *blocker* turns orange, and a heart drains. The board is otherwise
   untouched.
4. **Spend all five hearts.** The fail screen appears and says the board was still
   winnable — because it always is. Check that reads as fair rather than as the
   game cheating.
5. **Clear a level.** The board empties, confetti fires, and *then* the win
   screen arrives a beat later — you should see the last snake leave. Clear one
   without a single wrong tap and the burst is bigger and gold-flecked.
6. **Clear two in a row cleanly** — the win screen starts showing a perfect-read
   streak from two upward.
7. **Open the record screen** (★ on the menu, or tap the stat tiles) to see how
   the 600 are going.
8. **Force-quit and reopen.** You should land back where you were with progress
   and hints intact.

### The curve

- **Levels 1–4** should be nearly impossible to fail even tapping carelessly.
- **By level 20** you should be losing hearts if you are not tracing properly.
- **After level 20 the difficulty is deliberately mixed.** An Easy board can
  follow a Super Hard one. That is the design — tell me if it feels random rather
  than refreshing.
- **Jump ahead** from level select to sample the tiers. Try something in the 300s
  and something in the 500s.

### Oversized boards

271 levels have boards bigger than your screen — every Super Hard and Extreme
one. On those:

- **Drag** to pan, **pinch** to zoom, **double-tap** to snap between fit and
  working zoom.
- The board cannot be dragged off into empty space; the camera is clamped.
- **Tapping must stay accurate at every zoom level.** This is the thing most
  likely to be subtly wrong, so please test it zoomed right in and right out.
- Level 600 is 27×30 — about four screens. It should be readable, not miserable.

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
