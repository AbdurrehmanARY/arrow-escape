/**
 * app/_layout.tsx — the root route.
 *
 * Purpose:      Hydrate persisted state, start the services, and hold the stack.
 * Responsibilities:
 *               - Block first paint until saved settings are read.
 *               - Keep audio in step with the settings toggles.
 * Notes:        Hydration must finish before the first screen renders, or the app
 *               flashes the default theme and then snaps to the player's chosen
 *               one — which looks like a bug every single launch.
 *
 *               Only *settings* gate the first paint. Progress and hints are
 *               loaded in parallel but not waited on: nothing on the menu is wrong
 *               for the few milliseconds they take, and gating on all three makes
 *               the splash outstay its welcome.
 */

import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initAds } from '@services/ads';
import { applyAudioSettings, initAudio, startMusic } from '@services/audio';
import { useHintStore } from '@state/hintStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  const hydrateSettings = useSettingsStore((state) => state.hydrate);
  const hydrateProgress = useProgressStore((state) => state.hydrate);
  const hydrateHints = useHintStore((state) => state.hydrate);

  const music = useSettingsStore((state) => state.music);
  const sfx = useSettingsStore((state) => state.sfx);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Settings decide the theme, so the first frame must not happen without them.
      await hydrateSettings();
      if (cancelled) return;
      setReady(true);

      void hydrateProgress();
      void hydrateHints();
      void initAudio().then(() => startMusic());
      void initAds();
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, hydrateProgress, hydrateHints]);

  useEffect(() => {
    if (!ready) return;
    applyAudioSettings({ music, sfx });
  }, [ready, music, sfx]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </SafeAreaProvider>
  );
}
