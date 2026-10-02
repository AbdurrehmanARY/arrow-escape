/**
 * app/(tabs)/settings.tsx — Preferences & Settings.
 *
 * Purpose:      Everything the player can customize, matching the exact reference
 *               design with grouped card rows and smooth interactive controls.
 */

import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Screen, Springy, useTheme, withClick } from '@components';
import { APP_NAME, brandWordmark, isDarkColor } from '@shared/branding';
import { APP_VERSION } from '@config';
import { playSfx } from '@services/audio';
import { accountEmail, useAuthStore , useSettingsStore } from '@state';
import { fonts, radius, spacing, THEMES } from '@theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const settings = useSettingsStore();
  const session = useAuthStore((state) => state.session);
  const _email = useAuthStore((state) => accountEmail({ session: state.session }));

  const [language, setLanguage] = useState('English');
  const [showLangModal, setShowLangModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const [removeAds, setRemoveAds] = useState(false);

  const currentTheme = THEMES.find((t) => t.id === settings.themeId) ?? THEMES[0]!;

  const toggleMusic = (enabled: boolean) => {
    settings.set('music', enabled);
    playSfx('toggle');
  };

  const toggleSfx = (enabled: boolean) => {
    settings.set('sfx', enabled);
    playSfx('toggle');
  };

  const toggleVibration = (enabled: boolean) => {
    settings.set('haptics', enabled);
    playSfx('toggle');
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        {/* ---- Group 1: Preferences (Language, Vibrations, Music, Sounds, Themes) - */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {/* Language */}
          <Springy
            accessibilityRole="button"
            accessibilityLabel={`Language, current ${language}`}
            onPress={withClick(() => setShowLangModal(true))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="globe" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Language</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: palette.textFaint }]}>{language}</Text>
              <FontAwesome name="chevron-right" size={12} color={palette.textFaint} />
            </View>
          </Springy>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Vibrations */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="rss" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Vibrations</Text>
            </View>
            <Switch
              value={settings.haptics}
              onValueChange={toggleVibration}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Music */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="music" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Music</Text>
            </View>
            <Switch
              value={settings.music}
              onValueChange={toggleMusic}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Sounds */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="volume-up" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Sounds</Text>
            </View>
            <Switch
              value={settings.sfx}
              onValueChange={toggleSfx}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Themes */}
          <Springy
            accessibilityRole="button"
            accessibilityLabel={`Theme, current ${currentTheme.name}`}
            onPress={withClick(() => setShowThemeModal(true))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="paint-brush" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Themes</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: palette.textFaint }]}>{currentTheme.name}</Text>
              <FontAwesome name="chevron-right" size={12} color={palette.textFaint} />
            </View>
          </Springy>
        </View>

        {/* ---- Group 2: Account Connection -------------------------------- */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="user" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Account Connection</Text>
            </View>
            <Switch
              value={!!session}
              onValueChange={() => {
                playSfx('toggle');
                router.push('/account');
              }}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>
        </View>

        {/* ---- Group 3: Purchases (Remove Ads, Restore purchases) ---------- */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="ban" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Remove Ads</Text>
            </View>
            <Switch
              value={removeAds}
              onValueChange={(val) => {
                setRemoveAds(val);
                playSfx('toggle');
              }}
              trackColor={{ false: palette.border, true: palette.accent }}
              thumbColor={palette.surfaceRaised}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Springy
            accessibilityRole="button"
            onPress={withClick(() => playSfx('buttonClick'))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="refresh" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Restore purchases</Text>
            </View>
          </Springy>
        </View>

        {/* ---- Group 4: Feedback (Rate us, Write us) ------------------------ */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Springy
            accessibilityRole="button"
            onPress={withClick(() => playSfx('buttonClick'))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="star" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Rate us</Text>
            </View>
          </Springy>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Springy
            accessibilityRole="button"
            onPress={withClick(() => playSfx('buttonClick'))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="pencil" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Write us</Text>
            </View>
          </Springy>
        </View>

        {/* ---- Group 5: Legal (Privacy, Terms of Service) ------------------ */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Springy
            accessibilityRole="button"
            onPress={withClick(() => playSfx('buttonClick'))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="file-text-o" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Privacy</Text>
            </View>
          </Springy>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <Springy
            accessibilityRole="button"
            onPress={withClick(() => playSfx('buttonClick'))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="info-circle" size={16} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Terms of Service</Text>
            </View>
          </Springy>
        </View>

        {/* ---- Brand footer ------------------------------------------------ */}
        {/* The version sits beside the logo because it is the one detail support
            ever asks a player for, and a version tucked inside a numbered list
            reads as another setting rather than as an identifier. */}
        <View style={styles.footer}>
          <Image
            source={brandWordmark(isDarkColor(palette.background))}
            style={styles.footerWordmark}
            resizeMode="contain"
            accessibilityLabel={APP_NAME}
          />
          <Text style={[styles.footerVersion, { color: palette.textFaint }]}>
            {`${APP_NAME} v${APP_VERSION}`}
          </Text>
        </View>

        {/* ---- Language Selector Modal ------------------------------------ */}
        <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowLangModal(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Select Language</Text>
              {['English', 'Spanish', 'French', 'German', 'Japanese'].map((item) => (
                <Pressable
                  key={item}
                  onPress={() => {
                    setLanguage(item);
                    setShowLangModal(false);
                    playSfx('buttonClick');
                  }}
                  style={[styles.optionRow, { borderBottomColor: palette.border }]}
                >
                  <Text style={[styles.optionText, { color: palette.text }]}>{item}</Text>
                  {language === item ? <FontAwesome name="check" size={16} color={palette.accent} /> : null}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ---- Theme Selector Modal --------------------------------------- */}
        <Modal visible={showThemeModal} transparent animationType="fade" onRequestClose={() => setShowThemeModal(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowThemeModal(false)}>
            <Pressable style={[styles.modalSheet, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Select Theme</Text>
              {THEMES.map((theme) => (
                <Pressable
                  key={theme.id}
                  onPress={() => {
                    settings.set('themeId', theme.id);
                    setShowThemeModal(false);
                    playSfx('buttonClick');
                  }}
                  style={[styles.optionRow, { borderBottomColor: palette.border }]}
                >
                  <Text style={[styles.optionText, { color: palette.text }]}>{theme.name}</Text>
                  {settings.themeId === theme.id ? (
                    <FontAwesome name="check" size={16} color={palette.accent} />
                  ) : null}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  cardGroup: {
    borderRadius: radius.lg,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.xs,
  },
  icon: {
    width: 22,
    textAlign: 'center',
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.xs,
  },

  /* Brand footer */
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  footerWordmark: {
    width: 176,
    // The lockup's own aspect ratio (1200x278), so `contain` has nothing to letterbox.
    height: 41,
    // Just under full strength, so it signs the screen without competing with the
    // cards above it.
    opacity: 0.85,
  },
  footerVersion: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontFamily: fonts.displayExtra,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
