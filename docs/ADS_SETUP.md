# Enabling rewarded ads

Ads are **fully implemented and switched off**. The app runs, and the hint system
works, without the ad SDK installed — `src/services/ads.ts` loads it through a
guarded dynamic `require` and reports `unavailable` when it is absent.

That is deliberate. `react-native-google-mobile-ads` is a native module that
**Expo Go cannot load**, and a static import would crash the app on launch there,
taking all device testing down with it. Nothing in the game is ever blocked behind
an ad — restarting a level is always free — so shipping with ads off is a valid
state, not a broken one.

---

## What already works

- **Rewarded ads only.** No banners, no interstitials, nothing on level complete.
  The only place an ad can appear is the explicit "Watch ad · +1 hint" button, and
  only when hints have run out (GDD §9).
- **Offline policy.** New installs get 3 free hints so the game is never
  hard-blocked offline. One ad is kept preloaded while online, so a brief
  connection drop does not cost the player a hint. With no ad and no hints, the
  screen says so plainly and points at Restart.
- **Test vs. real units.** `USE_TEST_ADS` in `src/config/index.ts` is tied to
  `__DEV__`, so a development build cannot serve real ads and a release build
  cannot ship test ones. Both are one-line mistakes that get accounts suspended.

## To turn it on

### 1. Install the SDK

```bash
npm install react-native-google-mobile-ads
```

### 2. Create an AdMob account and app

At [admob.google.com](https://admob.google.com): create an app for Android, then
create one **Rewarded** ad unit inside it. You need two ids:

- the **App ID**, like `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY` (note the `~`)
- the **Rewarded unit ID**, like `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ` (a `/`)

### 3. Add the App ID to `app.json`

```jsonc
{
  "expo": {
    "plugins": [
      "expo-router",
      "expo-audio",
      [
        "react-native-google-mobile-ads",
        {
          "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",
        },
      ],
    ],
  },
}
```

### 4. Add the unit ID to `src/config/index.ts`

```ts
export const AD_UNIT_IDS = {
  rewarded: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ',
} as const;
```

### 5. Build a dev client

Expo Go still cannot load the native module, so from here on device testing needs
a custom build:

```bash
npm run build:dev
```

Install the resulting APK, then `npm run dev`.

(The package is `eas-cli`, not `eas` — `npx eas ...` fails with "could not
determine executable to run". The scripts call `npx --yes eas-cli@latest`, so
neither the package name nor a global install has to be remembered.)

## Verifying it

In a **development** build you will see Google's test ad, because `USE_TEST_ADS`
follows `__DEV__`. That is correct and is what you should test against — clicking
real ads on your own app is a policy violation.

Check all four paths:

1. **Reward earned** — watch the ad to the end; hint count goes up by one.
2. **Dismissed early** — close the ad partway; no hint, and the screen says why.
3. **Offline** — turn off the network; the button falls back to plain "Hint" and
   the copy points at Restart.
4. **Second hint** — the next ad preloads immediately after the first, so asking
   again should not make you wait.

## Before release

- Confirm `USE_TEST_ADS` resolves to `false` in a production build.
- Complete the Play Console **Data safety** form. The AdMob SDK collects an
  advertising ID, which must be declared.
- Add a privacy policy URL — Play requires one for any app serving ads.
- Ads request non-personalised only (`requestNonPersonalizedAdsOnly: true`), which
  keeps consent requirements simpler. If you later want personalised ads you must
  add a consent flow (UMP) for EEA/UK users.
