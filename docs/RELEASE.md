# Releasing ArrowPath

Everything here needs accounts and assets that only you can provide. The code side
is done — this is the checklist for getting it into the Play Store.

---

## Build profiles

`eas.json` defines three:

| Profile | Output | For |
|---|---|---|
| `development` | APK with dev client | on-device testing with native modules (needed once ads are on) |
| `preview` | APK | sharing a real build with testers, no store account needed |
| `production` | AAB, auto-incrementing versionCode | the Play Store |

```bash
npm install -g eas-cli
eas login
eas build:configure          # links the project to your Expo account, once
eas build --profile preview --platform android
```

## Versioning

- `version` in `app.json` is the human-facing name (`1.0.0`). Bump it by hand.
- `versionCode` auto-increments on production builds (`autoIncrement: true`), so
  it can never go backwards — Play rejects a build whose code is not higher than
  the last one, and hand-managing it is the classic way to waste an afternoon.

## Before the first production build

- [ ] **Audio files** — see `assets/audio/README.md`. The game ships silent
      without them, which works but feels unfinished.
- [ ] **App icon and splash** — the placeholders in `assets/` are Expo's defaults.
      Needs a 1024×1024 icon and an adaptive-icon foreground/background pair.
- [ ] **Ads** — see `docs/ADS_SETUP.md`. Optional; the game is complete without
      them, and hints simply cannot be replenished beyond the free three.
- [ ] **Privacy policy** — required by Play for any app that serves ads. Needs a
      public URL.
- [ ] **Play Console account** — one-off $25 registration.

## Store listing

You need to write these; nobody else can, and generic copy is the single biggest
avoidable drag on install rate.

- **Title** (30 chars) — e.g. `ArrowPath: Arrow Escape`
- **Short description** (80 chars) — the hook. Lead with what the player does.
- **Full description** (4000 chars) — what it is, how it plays, what makes it
  different. Be honest that it is a calm, offline puzzle game with no timers.
- **Screenshots** — at least 2, up to 8, phone size. Take these from the real app;
  the Paper and Midnight themes photograph best, and a mid-band level (25–35)
  shows the tangle without looking impenetrable.
- **Feature graphic** — 1024×500.

### Data safety form

Answer honestly. With ads **off**, the app collects nothing: no account, no
analytics, no network calls at all. With ads **on**, the AdMob SDK collects an
advertising ID, which must be declared.

### Content rating

Fill in the questionnaire. A puzzle game with no violence, no chat, and no
purchases rates in the lowest bracket everywhere.

## Rollout

```bash
eas build --profile production --platform android
eas submit --profile production --platform android
```

The submit profile targets the **internal** track as a **draft**, on purpose —
nothing goes live until you promote it in the Play Console. Suggested path:

1. **Internal testing** — you and a handful of people, on real devices.
2. **Closed testing** — 20+ testers for 14 days. Play now requires this for new
   personal developer accounts before production access is granted.
3. **Production, staged** — start at 10–20%. Watch crash-free rate and the ANR
   figures in the Play Console vitals for a few days before widening.

## After v0.1

The roadmap holds level packs at 50 until the curve is validated on real players.
The generator can produce 600 the moment that call is made — the pipeline is built
for it, and `npm run levels:validate` guarantees every one is solvable.

Things worth watching in the first release, because they decide what v0.2 is:

- **Where players stop.** A cliff in the completion funnel at a specific level
  means that level's `targetBlindMistakes` is wrong, and the fix is one number in
  `tools/curriculum.ts` followed by a rebuild.
- **Hint use.** Heavy use early means onboarding is too hard. No use at all means
  the reward loop is not worth building on.
- **Theme choice.** If most players switch off Paper immediately, the default is
  wrong.
