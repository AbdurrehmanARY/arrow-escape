/**
 * app/settings.tsx — preferences.
 *
 * Purpose:      Everything the player can change, in one place, with the reason it
 *               matters stated next to it.
 * Notes:        Each toggle carries a line of explanation. "Reduced motion" and
 *               "Assist" in particular change the game materially, and a bare
 *               switch label leaves a player guessing what they just turned on.
 *
 *               Reset is deliberately last, confirmed, and described honestly —
 *               it is the only destructive action in the app.
 */

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ConfirmDialog, Screen, ScreenHeader, useTheme } from '@components';
import { APP_VERSION } from '@config';
import { hasAudioAssets } from '@services/audio';
import { clearAll } from '@services/storage';
import { useHintStore } from '@state/hintStore';
import { useOnboardingStore } from '@state/onboardingStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';
import { radius, spacing, THEMES, typography, type Palette } from '@theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const settings = useSettingsStore();
  const resetProgress = useProgressStore((state) => state.resetProgress);
  const resetHints = useHintStore((state) => state.resetHints);
  const resetOnboarding = useOnboardingStore((state) => state.resetOnboarding);
  const [confirmReset, setConfirmReset] = useState(false);

  const audioAvailable = hasAudioAssets();

  const doReset = async () => {
    setConfirmReset(false);
    resetProgress();
    resetHints();
    resetOnboarding();
    settings.resetSettings();
    await clearAll();
    router.replace('/');
  };

  return (
    <Screen>
      <ScreenHeader palette={palette} title="Settings" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Section palette={palette} title="Look">
          <Text style={[styles.hint, { color: palette.textMuted }]}>
            A theme changes the palette, the arrow shape, and the board pattern.
          </Text>
          <View style={styles.themeGrid}>
            {THEMES.map((theme) => {
              const selected = theme.id === settings.themeId;
              return (
                <Pressable
                  key={theme.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${theme.name} theme`}
                  onPress={() => settings.set('themeId', theme.id)}
                  style={({ pressed }) => [
                    styles.themeCard,
                    {
                      backgroundColor: theme.palette.board,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 2 : 1,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.swatches}>
                    <View style={[styles.swatch, { backgroundColor: theme.palette.arrow }]} />
                    <View style={[styles.swatch, { backgroundColor: theme.palette.pattern }]} />
                    <View style={[styles.swatch, { backgroundColor: theme.palette.heart }]} />
                  </View>
                  <Text style={[styles.themeName, { color: theme.palette.text }]}>
                    {theme.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.themeDescription, { color: palette.textFaint }]}>
            {THEMES.find((t) => t.id === settings.themeId)?.description}
          </Text>
        </Section>

        <Section palette={palette} title="Sound">
          <Toggle
            palette={palette}
            label="Music"
            detail={
              audioAvailable
                ? 'A quiet ambient loop.'
                : 'No audio files are bundled in this build yet.'
            }
            value={settings.music}
            disabled={!audioAvailable}
            onChange={() => settings.toggle('music')}
          />
          <Toggle
            palette={palette}
            label="Sound effects"
            detail="A swoosh on release, a bump when a tap is blocked."
            value={settings.sfx}
            disabled={!audioAvailable}
            onChange={() => settings.toggle('sfx')}
          />
          <Toggle
            palette={palette}
            label="Vibration"
            detail="A short pulse on release and on a wrong tap."
            value={settings.haptics}
            onChange={() => settings.toggle('haptics')}
          />
        </Section>

        <Section palette={palette} title="Play">
          <Toggle
            palette={palette}
            label="Reduced motion"
            detail="Arrows leave instantly instead of threading out. Easier on the eyes, and smoother on older phones."
            value={settings.reducedMotion}
            onChange={() => settings.toggle('reducedMotion')}
          />
          <Toggle
            palette={palette}
            label="Assist"
            detail="Permanently highlights every arrow that can leave. Removes most of the challenge — it is here for accessibility, not for scoring."
            value={settings.assist}
            onChange={() => settings.toggle('assist')}
          />
          <Toggle
            palette={palette}
            label="Confirm restart"
            detail="Ask before restarting a level you have already started."
            value={settings.confirmRestart}
            onChange={() => settings.toggle('confirmRestart')}
          />
        </Section>

        <Section palette={palette} title="About">
          <Text style={[styles.about, { color: palette.textMuted }]}>ArrowPath {APP_VERSION}</Text>
          <Text style={[styles.hint, { color: palette.textFaint }]}>
            Hints are earned by watching a short ad. There is no currency and nothing to buy —
            restarting a level is always free.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => setConfirmReset(true)}
            style={({ pressed }) => [
              styles.danger,
              { borderColor: palette.danger },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.dangerLabel, { color: palette.danger }]}>Reset all progress</Text>
          </Pressable>
        </Section>
      </ScrollView>

      <ConfirmDialog
        palette={palette}
        visible={confirmReset}
        title="Reset everything?"
        message="Every level goes back to locked, your hints return to three, and settings return to their defaults. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={() => void doReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </Screen>
  );
}

function Section({
  palette,
  title,
  children,
}: {
  palette: Palette;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>{title.toUpperCase()}</Text>
      <View
        style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        {children}
      </View>
    </View>
  );
}

function Toggle({
  palette,
  label,
  detail,
  value,
  onChange,
  disabled = false,
}: {
  palette: Palette;
  label: string;
  detail: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.toggle, disabled && styles.disabled]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
        <Text style={[styles.toggleDetail, { color: palette.textFaint }]}>{detail}</Text>
      </View>
      <Switch
        value={value && !disabled}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: palette.border, true: palette.accent }}
        thumbColor={palette.surfaceRaised}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.xxl },

  section: { marginBottom: spacing.xl },
  sectionTitle: { ...typography.tiny, letterSpacing: 1.3, marginBottom: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.lg },

  hint: { ...typography.small, lineHeight: 18 },

  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeCard: { width: '31%', flexGrow: 1, padding: spacing.sm, borderRadius: radius.md },
  swatches: { flexDirection: 'row', gap: 3, marginBottom: spacing.xs },
  swatch: { width: 13, height: 13, borderRadius: 4 },
  themeName: { ...typography.small, fontWeight: '700' },
  themeDescription: { ...typography.small, lineHeight: 18 },

  toggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  disabled: { opacity: 0.45 },
  toggleText: { flex: 1 },
  toggleLabel: { ...typography.body, fontWeight: '700' },
  toggleDetail: { ...typography.small, marginTop: 2, lineHeight: 17 },

  about: { ...typography.body, fontWeight: '700' },

  danger: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerLabel: { ...typography.body, fontWeight: '700' },
  pressed: { opacity: 0.6 },
});
