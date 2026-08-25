/**
 * DummyAdModal.tsx — Simulated Rewarded Video Ad Player for Development.
 *
 * Displays a realistic full-screen / overlay video ad playback experience when
 * running in Expo Go or dev mode so developers can test ad playback and hints.
 */

import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { Springy } from './Pressable';
import { withClick } from './sound';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

export interface DummyAdModalProps {
  readonly visible: boolean;
  readonly onClose: (earned: boolean) => void;
  readonly palette: Palette;
}

export function DummyAdModal({ visible, onClose, palette }: DummyAdModalProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 1) {
          clearInterval(interval);
          setTimeout(() => {
            onClose(true);
            setProgress(0);
          }, 300);
          return 1;
        }
        return p + 0.2;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.container}>
        <View
          style={[
            styles.card,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={[styles.adTag, { backgroundColor: palette.accentMuted }]}>
            <Text style={[styles.adTagText, { color: palette.accent }]}>REWARDED AD DEMO</Text>
          </View>

          <View style={styles.iconCircle}>
            <FontAwesome name="play-circle" size={56} color="#5B67F6" />
          </View>

          <Text style={[styles.title, { color: palette.text }]}>Watching Video Ad</Text>
          <Text style={[styles.subtitle, { color: palette.textMuted }]}>
            Watch until complete to earn +1 Hint
          </Text>

          <View style={[styles.track, { backgroundColor: palette.surfaceRaised }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: '#5B67F6', width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>

          {progress >= 1 ? (
            <Text style={[styles.statusText, { color: palette.success }]}>
              ✓ Ad Completed! Reward Granted.
            </Text>
          ) : (
            <Springy
              accessibilityRole="button"
              accessibilityLabel="Skip ad"
              onPress={withClick(() => onClose(false))}
              style={styles.closeBtn}
            >
              <Text style={[styles.closeText, { color: palette.textFaint }]}>Close Early</Text>
            </Springy>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  adTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  adTagText: {
    ...typography.tiny,
    fontWeight: '800',
    letterSpacing: 1,
  },
  iconCircle: {
    marginVertical: spacing.xs,
  },
  title: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 20,
  },
  subtitle: {
    ...typography.small,
    textAlign: 'center',
  },
  track: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  statusText: {
    ...typography.body,
    fontWeight: '800',
  },
  closeBtn: {
    paddingVertical: spacing.xs,
  },
  closeText: {
    ...typography.small,
  },
});
