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
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initAds } from '@services/ads';
import { applyAudioSettings, initAudio } from '@services/audio';
import { useHintStore } from '@state/hintStore';
import { useOnboardingStore } from '@state/onboardingStore';
import { useChallengeStore } from '@state/challengeStore';
import { useAuthStore } from '@state/authStore';
import { useLeagueStore } from '@state/leagueStore';
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
  const hydrateOnboarding = useOnboardingStore((state) => state.hydrate);
  const hydrateChallenges = useChallengeStore((state) => state.hydrate);
  const hydrateAuth = useAuthStore((state) => state.hydrate);
  const hydrateLeague = useLeagueStore((state) => state.hydrate);

  const music = useSettingsStore((state) => state.music);
  const sfx = useSettingsStore((state) => state.sfx);
  const masterVolume = useSettingsStore((state) => state.masterVolume);
  const musicVolume = useSettingsStore((state) => state.musicVolume);
  const sfxVolume = useSettingsStore((state) => state.sfxVolume);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Settings decide the theme, so the first frame must not happen without them.
      await hydrateSettings();
      if (cancelled) return;
      setReady(true);

      void hydrateProgress();
      void hydrateHints();
      void hydrateOnboarding();
      void hydrateChallenges();
      void hydrateAuth();
      void hydrateLeague();
      void initAudio();
      void initAds();
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrateSettings, hydrateProgress, hydrateHints, hydrateOnboarding, hydrateChallenges, hydrateAuth, hydrateLeague]);

  /**
   * Push the audio settings down whenever any of them changes.
   *
   * Mutes and volumes go together in one call because the mix is multiplicative —
   * applying them separately would briefly mix at a level the player never chose,
   * which on a change of master volume is audible.
   */
  useEffect(() => {
    if (!ready) return;
    applyAudioSettings({
      musicMuted: !music,
      sfxMuted: !sfx,
      masterVolume,
      musicVolume,
      sfxVolume,
    });
  }, [ready, music, sfx, masterVolume, musicVolume, sfxVolume]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            contentStyle: { backgroundColor: 'transparent' },
          }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
