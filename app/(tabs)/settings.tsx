/**
 * app/(tabs)/settings.tsx — Preferences & Settings.
 *
 * Purpose:      Everything the player can customize, matching the exact reference
 *               design with grouped card rows and smooth interactive controls.
 */

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Screen, Springy, useTheme, withClick } from '@components';
import { playSfx } from '@services/audio';
import { accountEmail, useAuthStore } from '@state/authStore';
import { useSettingsStore } from '@state/settingsStore';
import { fonts, radius, spacing, THEMES, typography } from '@theme';

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

  const toggleSound = (enabled: boolean) => {
    settings.set('sfx', enabled);
    settings.set('music', enabled);
    playSfx('toggle');
  };

  const toggleVibration = (enabled: boolean) => {
    settings.set('haptics', enabled);
    playSfx('toggle');
  };

  return (
    <Screen scroll>
      <View style={styles.container}>
        {/* ---- Group 1: Preferences (Language, Vibrations, Sounds, Themes) - */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {/* Language */}
          <Springy
            accessibilityRole="button"
            accessibilityLabel={`Language, current ${language}`}
            onPress={withClick(() => setShowLangModal(true))}
            style={styles.row}
          >
            <View style={styles.rowLeft}>
              <FontAwesome name="globe" size={20} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Language</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: palette.textFaint }]}>{language}</Text>
              <FontAwesome name="chevron-right" size={14} color={palette.textFaint} />
            </View>
          </Springy>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          {/* Vibrations */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="rss" size={18} color={palette.textMuted} style={styles.icon} />
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

          {/* Sounds */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="volume-up" size={19} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Sounds</Text>
            </View>
            <Switch
              value={settings.sfx || settings.music}
              onValueChange={toggleSound}
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
              <FontAwesome name="paint-brush" size={18} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Themes</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: palette.textFaint }]}>{currentTheme.name}</Text>
              <FontAwesome name="chevron-right" size={14} color={palette.textFaint} />
            </View>
          </Springy>
        </View>

        {/* ---- Group 2: Account Connection -------------------------------- */}
        <View style={[styles.cardGroup, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <FontAwesome name="user" size={20} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="ban" size={19} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="refresh" size={19} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="star" size={19} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="pencil" size={19} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="file-text-o" size={19} color={palette.textMuted} style={styles.icon} />
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
              <FontAwesome name="info-circle" size={20} color={palette.textMuted} style={styles.icon} />
              <Text style={[styles.rowLabel, { color: palette.text }]}>Terms of Service</Text>
            </View>
          </Springy>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  cardGroup: {
    borderRadius: radius.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  rowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginRight: spacing.xs,
  },
  icon: {
    width: 26,
    textAlign: 'center',
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.xs,
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  modalTitle: {
    ...typography.title,
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  optionText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
