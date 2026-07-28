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
Test Suites: 6 passed, 6 total
Tests:       98 passed, 98 total
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

A dark screen titled **ArrowPath — Phase 1 — rules engine**, with two cards.

### Card 1 — Tangle (the game)

An 8×8 board with **7 snakes** and a row of **5 hearts**. This is the real
mechanic, playable:

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

1. **Play it cold.** Don't use any of the toggles. See how it feels to hunt for a
   head and follow it. This is the real experience.
2. **Tap something blocked on purpose** and watch a heart drain while the board
   stays exactly as it was. Note that you can lose this level with the board still
   perfectly winnable — that is by design and the fail message says so.
3. **Restart, then hit "Show safe"** — green outlines every snake that can
   currently leave. Compare that against what you guessed.
4. **Hit "Colour snakes"** — each body gets its own colour. Suddenly the board is
   trivial. That contrast *is* the difficulty: the real game draws every snake the
   same colour on purpose.
5. **Hit "Hint"** — the engine names a snake that genuinely has a clear run. It
   can never cost you a heart.

### Card 2 — Engine self-check

Should read **12 passed**, in single-digit milliseconds. This re-runs core engine
checks on the phone's JS engine (Hermes), which is *not* the engine the Jest tests
run on. If anything here fails, stop and send me the failing line — it means the
engine behaves differently on device than on desktop, which is worth fixing before
anything is built on top of it.

Among other things it verifies on your hardware that a wrong tap costs a heart and
leaves the board alone, that running out of hearts fails a level that was still
winnable, that hints never cost a heart, and that 300 random boards can all be
cleared by tapping in any order.

---

## 4. What I need from you

1. **Confirm the self-check reads 12 passed** and nothing is red.
2. **Confirm the mechanic matches the game you showed me** — snakes, the whole
   body leaving at once through the head, hearts draining on a wrong tap.
3. **Tell me anything that feels off** about how it plays. Board size, snake
   length, how many are free at the start, whether 5 hearts feels right.

Then I'll start **Phase 2**: the production renderer — SVG snake paths with
rounded corners so they look like your reference art, the thread-out release
animation, the red flash and heart drain on a blocked tap, and shaped levels
(heart, spiral, diamond).

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| Expo Go: "Failed to download remote update" | The phone can't reach the dev server. Use `npm run start:tunnel` |
| `npm start` fails to resolve `@game` | `npx expo start --clear` to reset the Metro cache |
| Tunnel is very slow to load | Normal on first bundle; later reloads are faster |
| Red screen on the phone | Screenshot it and send it over — the stack trace names the file |
| Expo Go says the SDK version is unsupported | Update Expo Go from the Play Store; this project is on SDK 57 |
