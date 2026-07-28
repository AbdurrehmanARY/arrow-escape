# Phase 1 — how to test it on your phone

Two things to check: that the engine is correct (desktop, 30 seconds), and that it
runs correctly on real hardware while you decide the rule variant (phone).

---

## 1. Desktop check — 30 seconds

```bash
npm run verify
```

Runs `tsc --noEmit` then the full Jest suite. Expect:

```
Test Suites: 5 passed, 5 total
Tests:       80 passed, 80 total
```

Coverage, if you want it: `npm run test:coverage` → 92% statements, 89% branches
on `src/game`.

---

## 2. Phone check

### Option A — Expo Go over Wi-Fi (easiest)

1. Install **Expo Go** from the Play Store on your Android phone.
2. Put the phone and this PC on the **same Wi-Fi network**.
3. In the project folder:
   ```bash
   npm start
   ```
4. Scan the QR code in the terminal with Expo Go.

If the QR times out, your Wi-Fi is probably blocking device-to-device traffic
(common on public or guest networks). Use Option B, or run `npx expo start --tunnel`
— slower, but it works through anything.

### Option B — USB (no Wi-Fi needed)

1. On the phone: Settings → About phone → tap **Build number** seven times to
   unlock Developer options, then enable **USB debugging**.
2. Plug the phone in and accept the "Allow USB debugging?" prompt.
3. Confirm the PC sees it:
   ```bash
   adb devices
   ```
   You want one device listed as `device` (not `unauthorized`).
4. Then:
   ```bash
   npm run android
   ```

`adb` ships with Android Platform Tools. If it is not on your PATH, install
Android Studio or the standalone platform-tools package.

> Expo Go is enough for Phases 1–5. Phase 6 adds the AdMob native module, which
> Expo Go cannot load — that is when we switch to a custom dev build via EAS.

---

## 3. What you should see

A dark screen titled **ArrowPath — Phase 1 — rules engine**, with two cards.

### Card 1 — Engine self-check

Should read **8 passed**, in single-digit milliseconds. This re-runs core engine
checks on the phone's JS engine (Hermes), which is *not* the same engine the Jest
tests run on. If anything here fails, stop and send me the failing line — it means
the engine behaves differently on device than on desktop, which would be a serious
problem worth fixing before anything is built on top of it.

### Card 2 — the decision

A 3×3 board with five arrows and a toggle between the two rule variants.

```
. ▼ ◀
▶ ▶ .
. . ▲
```

**Please actually play both.** This is the fastest way to feel a difference that
is hard to argue about in prose.

**With `escape-only` selected (the GDD rule):**
- Tap arrows in any order you like. Try deliberately to lose.
- You can't. Every order clears the board. Nothing is ever highlighted red.
- Blocked arrows simply do nothing when tapped.

**With `slide-and-stop` selected:**
- Two arrows are tappable: the middle `▶` (green, safe) and the bottom-right `▲`
  (red, a trap).
- Tap the red `▲` first. It slides up into the exact cell the `▶` needed to exit
  through. Status turns red: **Deadlocked**.
- Restart, tap the green `▶` first instead, and the board clears.

Same arrows, same layout — the rule is the only difference.

Buttons: **Restart** resets the board, **Hint** asks the solver for a provably
safe move, **Show/Hide safe** toggles the green/red highlighting.

---

## 4. The decision I need from you

Read [MECHANIC_ANALYSIS.md](MECHANIC_ANALYSIS.md) — it is short, and it has the
proof and the trade-offs.

Then tell me one of:

- **"Option A / escape-only"** — ship the calm spatial-search game. No code change;
  I retune the difficulty model around board density and search load, and delete
  the deadlock UX from the plan.
- **"Option B / slide-and-stop"** — ship the logic game the GDD describes. I make
  it the default variant, update GDD §2/§6/§8, and design the Phase 3 generator
  around the much lower yield of solvable boards.

My recommendation is **Option B**, because the GDD is explicit that ArrowPath is a
game about dependency order and about the "aha" — and `escape-only` cannot deliver
that at any level size. The property is structural, not a tuning problem.

Either way, say the word and I'll start Phase 2 (the real board: SVG arrows,
release animation, blocked shake, `gameReducer`, one hardcoded level).

---

## 5. If something goes wrong

| Symptom | Fix |
|---|---|
| `npm start` fails to resolve `@game` | `npx expo start --clear` to reset the Metro cache |
| QR scans but never loads | Wi-Fi is isolating devices — use `npx expo start --tunnel` or the USB route |
| `adb devices` shows `unauthorized` | Unlock the phone and accept the USB debugging prompt |
| Red screen on the phone | Screenshot it and send it over — the stack trace names the file |
| Expo Go says the SDK version is unsupported | Update Expo Go from the Play Store; this project is on SDK 57 |
