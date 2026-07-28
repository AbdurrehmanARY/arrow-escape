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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initAds } from '@services/ads';
import { applyAudioSettings, initAudio, startMusic } from '@services/audio';
import { useHintStore } from '@state/hintStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';

/**
 * Catches any JavaScript error thrown while rendering and shows it.
 *
 * Worth having for its diagnostic value as much as its UX: if the app dies and
 * you see *this* screen, the fault is in JS and the message names it. If the app
 * dies and Expo Go closes outright with no screen at all, the fault is native —
 * usually a package version that disagrees with the one Expo Go was built
 * against. `npx expo install --check` is the tool for that case.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.errorRoot}>
      <ScrollView contentContainerStyle={styles.errorBody}>
        <Text style={styles.errorTitle}>Something broke</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        {error.stack ? <Text style={styles.errorStack}>{error.stack}</Text> : null}
        <Text style={styles.errorRetry} onPress={retry}>
          Tap here to try again
        </Text>
      </ScrollView>
    </View>
  );
}

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

const styles = StyleSheet.create({
  errorRoot: { flex: 1, backgroundColor: '#11141b' },
  errorBody: { padding: 24, paddingTop: 72, gap: 12 },
  errorTitle: { color: '#eef2f9', fontSize: 22, fontWeight: '800' },
  errorMessage: { color: '#e2606a', fontSize: 15, lineHeight: 21 },
  errorStack: { color: '#647084', fontSize: 11, lineHeight: 16, fontFamily: 'monospace' },
  errorRetry: { color: '#5b8dee', fontSize: 15, fontWeight: '700', marginTop: 12 },
});
