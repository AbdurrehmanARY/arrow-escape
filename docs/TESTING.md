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
| `jest` | 370 tests — rules, solver, geometry, and every shipped level |
| `levels:validate` | re-reads the level JSON *from disk* and re-solves all 50 |

Expect:

```
Test Suites: 8 passed, 8 total
Tests:       370 passed, 370 total
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

**Use the tunnel on this machine.** Windows Firewall is blocking inbound Node on
your only working adapter, so Expo Go cannot reach the LAN dev server:

```bash
npm run start:tunnel
```

Scan the QR with **Expo Go** from the Play Store.

<details>
<summary>Optional: fix the LAN path instead (faster, needs admin)</summary>

Two separate problems were found on this PC:

1. Two **enabled Block rules** for `node.exe` inbound on the Public firewall
   profile, and your Ethernet adapter is categorised Public.
2. Your Wi-Fi adapter has no DHCP lease — it sits on `169.254.29.96`, an APIPA
   address, so the PC is not really on Wi-Fi. Only Ethernet
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

Only works if your phone is on the same router — check it gets a `192.168.10.x`
address. The Wi-Fi adapter failing DHCP is worth looking at separately; it is a
real problem independent of this project.
</details>

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
5. **Clear a level.** Win screen shows hearts left and whether it was a clean
   read. Next takes you to the following level.
6. **Force-quit and reopen.** You should land back where you were with progress
   and hints intact.

### The curve

- **Levels 1–4** should be nearly impossible to fail even tapping carelessly.
- **Around 20–25** you should start losing hearts if you are not tracing properly.
- **Levels 45–50** should punish guessing hard. If you can clear level 50 by
  tapping at random, the model is wrong and I need to retune.

The most useful thing you can tell me is **where you got stuck or bored**. Every
level's difficulty is one number in `tools/curriculum.ts` followed by a rebuild.

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

| Symptom | Fix |
|---|---|
| Expo Go: "Failed to download remote update" | The phone can't reach the dev server. Use `npm run start:tunnel` |
| Metro can't resolve `@game` / `@components` | `npx expo start --clear` to reset the cache |
| Red screen mentioning worklets or Reanimated | `rm -rf node_modules && npm install`, then `npx expo start --clear` |
| Red screen, anything else | Screenshot it — the stack trace names the file |
| Board looks cramped on a small phone | Expected on 12×12 mastery levels; tell me and I'll cap the cell size |
| Expo Go says the SDK is unsupported | Update Expo Go; this project is on SDK 57 |
