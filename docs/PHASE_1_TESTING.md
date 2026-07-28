# Phase 1 — how to test it on your phone

Two things to check: that the engine is correct (desktop, 30 seconds), and that it
runs correctly on real hardware while you play the mechanic (phone).

---

## 1. Desktop check — 30 seconds

```bash
npm run verify
```

Runs `tsc --noEmit` then the full Jest suite. Expect:

```
Test Suites: 7 passed, 7 total
Tests:       112 passed, 112 total
```

Coverage, if you want it: `npm run test:coverage` → 96% statements, 91% branches
on `src/game`.

---

## 2. Phone check

**On this machine, use the tunnel.** Windows Firewall is blocking inbound Node on
your only working network adapter, so Expo Go cannot reach the LAN dev server:

```bash
npm run start:tunnel
```

Then scan the QR code with **Expo Go** (install it from the Play Store). Tunnel is
slower than LAN but works through firewalls and mismatched networks.

<details>
<summary>Optional: fix the LAN path instead (faster, needs admin)</summary>

Two separate problems were found on this PC:

1. Two **enabled Block rules** for `node.exe` inbound on the Public firewall
   profile, and your Ethernet adapter is categorised Public.
2. Your Wi-Fi adapter has no DHCP lease — it is on `169.254.29.96`, an APIPA
   address, so the PC is not really on Wi-Fi at all. Only Ethernet
   (`192.168.10.253`, gateway `192.168.10.1`) works.

In an **Administrator** PowerShell:

```powershell
Remove-NetFirewallRule -DisplayName "Node.js JavaScript Runtime"
New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Any
Set-NetConnectionProfile -InterfaceAlias Ethernet -NetworkCategory Private
```

Then pin the address so Expo cannot advertise the dead Wi-Fi adapter:

```powershell
$env:REACT_NATIVE_PACKAGER_HOSTNAME='192.168.10.253'
npm start
```

This only works if your phone's Wi-Fi is on the same router — check it gets a
`192.168.10.x` address. If not, stay on the tunnel.

The Wi-Fi adapter failing to get a DHCP lease is worth looking at separately;
it is a real problem independent of this project.
</details>

> Expo Go is enough for Phases 1–5. Phase 6 adds the AdMob native module, which
> Expo Go cannot load — that is when we switch to a custom dev build via EAS.

---

## 3. What you should see

A warm paper-coloured screen headed **LEVEL 1 · Tangle**, with a heart row, the
board, and a theme picker underneath.

### The board

An 8×8 dotted grid with **7 snakes** and **5 hearts**. This is the real mechanic,
playable:

- Each snake is a chain of cells with an arrowhead at one end.
- **Tap any cell of a snake** to try to send it out through its head.
- If the straight line from that arrowhead to the board edge is clear, the whole
  snake threads out and disappears.
- If anything is in the way, nothing happens to the board and **you lose a heart**.
  The status line tells you which snake blocked it.
- Clear all 7 to win. Spend all 5 hearts and the level fails.

**Three of the seven are free at the start.** A player who taps at random is
expected to burn about **11 hearts** clearing this board — against the 5 available,
so guessing reliably fails. A player who traces each head to the edge clears it
without losing a single one. That gap is the entire game.

Worth trying, in order:

1. **Play it cold.** No Assist, no theme switching. See how it feels to hunt for a
   head and follow it. This is the real experience.
2. **Tap something blocked on purpose.** The snake flashes red, the *blocker*
   flashes orange so you can see what stopped it, and a heart drains — while the
   board stays exactly as it was. You can lose this level with the board still
   perfectly winnable; that is by design, and the fail message says so.
3. **Restart, then turn on Assist** — every snake with a clear run turns green.
   Compare that against what you guessed.
4. **Switch to the Noodles theme.** Each snake gets its own colour and the board
   becomes trivial. That contrast *is* the difficulty: every other theme draws all
   snakes in one colour on purpose.
5. **Hit Hint** — the engine names a snake that genuinely has a clear run. It can
   never cost you a heart.

### Themes

Below the board is a picker with six themes. Tap through them — the board redraws
live.

| Theme | Arrow head | Grid | Note |
|---|---|---|---|
| **Paper** | triangle | dots | The default: warm paper, charcoal arrows |
| **Midnight** | triangle | dots | The same design inverted |
| **Noodles** | rounded, with eyes | none | Each snake its own colour — **plays easier** |
| **Bold** | triangle, mitred | none | Heavy black on flat yellow |
| **Blueprint** | chevron | ruled lines | Thin arrows on drafting blue |
| **Graphite** | pencil | crosses | Slim tips on graph paper |

A theme sets the palette, the arrow shape, and the board pattern independently, so
they mix freely. Adding another one is a data entry — the renderer never branches
on which theme is active, so new looks cost nothing structurally.

You can also see all six side by side in a browser without building anything:

```bash
npx tsx tools/preview-themes.ts > preview.html
```

That page renders from the app's own geometry module, so it cannot disagree with
what the phone shows.

---

## 4. What I need from you

1. **Confirm the mechanic matches the game you showed me** — snakes, the whole
   body leaving at once through the head, hearts draining on a wrong tap.
2. **Pick a default theme**, or tell me what to change about one. Arrow thickness,
   head size, dot visibility, and corner rounding are all single numbers.
3. **Tell me anything that feels off** about how it plays. Board size, snake
   length, how many are free at the start, whether 5 hearts feels right.

Then I'll start **Phase 2**: motion and state — the thread-out release animation
where the body follows the head off the board, the shake and heart-drain on a
blocked tap, and the reducer that sequences them. The static renderer is done.

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| Expo Go: "Failed to download remote update" | The phone can't reach the dev server. Use `npm run start:tunnel` |
| `npm start` fails to resolve `@game` | `npx expo start --clear` to reset the Metro cache |
| Tunnel is very slow to load | Normal on first bundle; later reloads are faster |
| Red screen on the phone | Screenshot it and send it over — the stack trace names the file |
| Expo Go says the SDK version is unsupported | Update Expo Go from the Play Store; this project is on SDK 57 |
