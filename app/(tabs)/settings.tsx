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
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ConfirmDialog, Screen, ScreenHeader, Springy, useTheme, withClick } from '@components';
import { APP_VERSION } from '@config';
import { hasAudioAssets, playSfx, type SfxName } from '@services/audio';
import { clearAll } from '@services/storage';
import { accountEmail, useAuthStore } from '@state/authStore';
import { useHintStore } from '@state/hintStore';
import { useOnboardingStore } from '@state/onboardingStore';
import { useProgressStore } from '@state/progressStore';
import { useSettingsStore } from '@state/settingsStore';
import { MIN_TOUCH_TARGET, radius, spacing, THEMES, typography, type Palette } from '@theme';

/**
 * Change a setting, then make the sound — in that order, and not the other way.
 *
 * Every other button in the app clicks *before* its handler, because a handler
 * that navigates can unmount the caller. The controls on this screen are the one
 * exception, and for a specific reason: they change the mixer the sound is about
 * to be played through. Turning "Sound effects" back on, or raising a volume from
 * zero, would fire its confirmation into a mixer that is still muted — so the one
 * control whose whole purpose is to make the game audible would be the one that
 * gave no sign of working.
 *
 * The timeout is what lets the store update and `_layout`'s effect push the new
 * settings down before anything is played.
 */
function audible(change: () => void, name: SfxName): void {
  change();
  setTimeout(() => playSfx(name), 0);
}

export default function SettingsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const settings = useSettingsStore();
  const resetProgress = useProgressStore((state) => state.resetProgress);
  const resetHints = useHintStore((state) => state.resetHints);
  const resetOnboarding = useOnboardingStore((state) => state.resetOnboarding);
  const [confirmReset, setConfirmReset] = useState(false);
  const email = useAuthStore((state) => accountEmail({ session: state.session }));

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
                <Springy
                  key={theme.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${theme.name} theme`}
                  onPress={withClick(() => settings.set('themeId', theme.id))}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: theme.palette.board,
                      borderColor: selected ? palette.accent : palette.border,
                      borderWidth: selected ? 2 : 1,
                    },
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
                </Springy>
              );
            })}
          </View>
          <Text style={[styles.themeDescription, { color: palette.textFaint }]}>
            {THEMES.find((t) => t.id === settings.themeId)?.description}
          </Text>
        </Section>

        <Section palette={palette} title="Sound">
          {audioAvailable ? null : (
            <Text style={[styles.hint, { color: palette.textFaint }]}>
              No audio files are bundled in this build yet, so everything below is
              silent. The controls still work and their settings are saved — sound
              arrives the moment the files are added.
            </Text>
          )}

          <VolumeControl
            palette={palette}
            label="Master volume"
            detail="Scales everything, music and effects together."
            value={settings.masterVolume}
            onChange={(value) => settings.set('masterVolume', value)}
          />
          <VolumeControl
            palette={palette}
            label="Music volume"
            value={settings.musicVolume}
            onChange={(value) => settings.set('musicVolume', value)}
          />
          <VolumeControl
            palette={palette}
            label="Effects volume"
            value={settings.sfxVolume}
            onChange={(value) => settings.set('sfxVolume', value)}
          />

          <Toggle
            palette={palette}
            label="Music"
            detail="A quiet bed, different in the menu and in a level."
            value={settings.music}
            onChange={() => settings.toggle('music')}
          />
          <Toggle
            palette={palette}
            label="Sound effects"
            detail="A swoosh on release, a bump when a tap is blocked."
            value={settings.sfx}
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

        <Section palette={palette} title="Account">
          {/*
            The address, not a hardcoded "Not connected".

            This row said "Not connected" unconditionally — it was written before
            sign-in worked and never read the session, so it kept saying it while
            an account was connected. A status row that cannot be wrong about the
            one thing it reports is worth the two lines it takes to derive it.
          */}
          <Springy
            accessibilityRole="button"
            accessibilityLabel={email ? `Account, signed in as ${email}` : 'Account, not connected'}
            onPress={withClick(() => router.push('/account'))}
            style={[styles.linkRow,]}
          >
            <Text style={[styles.linkLabel, { color: palette.text }]}>Account</Text>
            <Text
              style={[styles.linkValue, { color: email ? palette.accent : palette.textFaint }]}
              numberOfLines={1}
            >
              {email ?? 'Not connected'} ›
            </Text>
          </Springy>
        </Section>

        {/*
          Rows from the reference design whose features do not exist yet.

          Built now because the layout was asked for now, and marked "Soon" rather
          than left looking live. A settings row that responds to a tap by doing
          nothing is indistinguishable from a broken one, and the player cannot tell
          which — so each of these says plainly that it is not ready.

          Wiring one up later is replacing `soon` with an `onPress`.
        */}
        <Section palette={palette} title="Store">
          <SoonRow palette={palette} label="Remove ads" detail="No purchases yet" />
          <SoonRow palette={palette} label="Restore purchases" detail="Nothing to restore" />
        </Section>

        <Section palette={palette} title="Language">
          <SoonRow palette={palette} label="Language" detail="English only" />
        </Section>

        <Section palette={palette} title="Feedback">
          <SoonRow palette={palette} label="Rate us" detail="Needs a store listing" />
          <SoonRow palette={palette} label="Write us" detail="Soon" />
        </Section>

        <Section palette={palette} title="Legal">
          <SoonRow palette={palette} label="Privacy policy" detail="Soon" />
          <SoonRow palette={palette} label="Terms of service" detail="Soon" />
        </Section>

        <Section palette={palette} title="About">
          <Text style={[styles.about, { color: palette.textMuted }]}>ArrowPath {APP_VERSION}</Text>
          <Text style={[styles.hint, { color: palette.textFaint }]}>
            Hints are earned by watching a short ad. There is no currency and nothing to buy —
            restarting a level is always free.
          </Text>

          <Springy
            accessibilityRole="button"
            onPress={withClick(() => setConfirmReset(true))}
            style={[
              styles.danger,
              { borderColor: palette.danger },
            ]}
          >
            <Text style={[styles.dangerLabel, { color: palette.danger }]}>Reset all progress</Text>
          </Springy>
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

/**
 * A volume, in five steps.
 *
 * Deliberately not a slider. A continuous slider needs a native dependency this
 * project does not have, and adding one has twice broken the toolchain here for
 * less reason than this. It is also the wrong control for a thumb: nobody sets a
 * game's music to 43%, and five taps of a segmented bar are easier to hit than one
 * drag of a 4dp track.
 *
 * Each segment is a full touch target and reports the level it sets, so the whole
 * control is usable without seeing it.
 */
function VolumeControl({
  palette,
  label,
  detail,
  value,
  onChange,
}: {
  palette: Palette;
  label: string;
  detail?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const active = steps.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );

  return (
    <View>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: palette.text }]}>{label}</Text>
        {detail ? (
          <Text style={[styles.toggleDetail, { color: palette.textFaint }]}>{detail}</Text>
        ) : null}
      </View>
      <View style={styles.volumeRow}>
        {steps.map((step) => {
          const filled = step <= active && active > 0;
          const isOff = step === 0;
          return (
            <Springy
              key={step}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${Math.round(step * 100)} percent`}
              accessibilityState={{ selected: step === active }}
              onPress={() => audible(() => onChange(step), 'buttonClick')}
              style={[
                styles.volumeStep,
                {
                  backgroundColor: filled ? palette.accent : palette.surfaceRaised,
                  borderColor: step === active ? palette.accent : palette.border,
                },
                isOff && styles.volumeOff,
              ]}
            >
              {isOff ? (
                <Text
                  style={[
                    styles.volumeOffLabel,
                    { color: active === 0 ? palette.textOnAccent : palette.textFaint },
                  ]}
                >
                  0
                </Text>
              ) : null}
            </Springy>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A row that is present, legible and explicitly not ready.
 *
 * Not a `Pressable` with a no-op handler: something that looks tappable and does
 * nothing teaches a player the app is broken. This is visibly inert instead, and
 * says why.
 */
function SoonRow({
  palette,
  label,
  detail,
}: {
  palette: Palette;
  label: string;
  detail: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label}, ${detail}`}
      style={styles.linkRow}
    >
      <Text style={[styles.linkLabel, { color: palette.textFaint }]}>{label}</Text>
      <Text style={[styles.linkValue, { color: palette.textFaint }]}>{detail}</Text>
    </View>
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
        onValueChange={() => audible(onChange, 'toggle')}
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

  volumeRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  volumeStep: {
    flexGrow: 1,
    flexBasis: 0,
    // Full-height touch target: the visible bar is short, but the thing a thumb
    // has to hit is not.
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeOff: { flexGrow: 0, flexBasis: MIN_TOUCH_TARGET },
  volumeOffLabel: { ...typography.small, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  toggleText: { flex: 1 },
  toggleLabel: { ...typography.body, fontWeight: '700' },
  toggleDetail: { ...typography.small, marginTop: 2, lineHeight: 17 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  linkLabel: { ...typography.body },
  linkValue: { ...typography.small },
  about: { ...typography.body, fontWeight: '700' },

  danger: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerLabel: { ...typography.body, fontWeight: '700' },
});
