/**
 * src/components/LeagueIntro.tsx — the three-page "how leagues work" sheet.
 *
 * Purpose:      Explain the league loop in three pages the player can tap through,
 *               and open with a sheet sound so it arrives like the rest of the game's
 *               sheets.
 * Responsibilities:
 *               - Hold the page index and reset it on the way out.
 *               - Show the right artwork per page.
 *               - Advance, or close, from the one Continue button.
 * Notes:        The page resets to 0 when the last page is confirmed rather than on
 *               close, because the sheet is unmounted by the parent's `visible` and a
 *               reopen that started on page three would read as a bug. Owns the twelve
 *               style keys it uses and none of the screen's.
 *
 *               Moved verbatim out of `app/(tabs)/leagues.tsx`. The `themeAssets`
 *               prop is still `any` as it was there; tightening it is a separate
 *               change from the move.
 */

import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radius, spacing, typography, type Palette } from '@theme';

import { Springy } from '@shared/primitives/Pressable';
import { useSheetSound, withClick } from './sound';

export function LeagueIntro({
  visible,
  palette,
  themeAssets,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  themeAssets: any;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  useSheetSound(visible);

  const pages = [
    { glyph: '➤', text: 'Collect arrows in levels to build up your weekly score.' },
    { glyph: '◆', text: 'Compete with players in your league table.' },
    { glyph: '▲', text: 'Finish in the top zone at the end of the week to promote to a higher league!' },
  ];

  const last = page === pages.length - 1;
  const current = pages[page]!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: palette.surface }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.sheetTitle, { color: palette.text }]}>Leagues</Text>

          {page === 2 ? (
            <View style={styles.bannerContainer}>
              <Image
                source={themeAssets.finishingImage}
                style={styles.finishingBannerImg}
                resizeMode="contain"
              />
            </View>
          ) : page === 1 ? (
            <View style={styles.introIconContainer}>
              <Image
                source={themeAssets.arrowIcon}
                style={styles.introArrowIcon}
                resizeMode="contain"
              />
            </View>
          ) : (
            <View style={styles.introIconContainer}>
              <Image
                source={themeAssets.leagueInfoImage ?? themeAssets.arrowIcon}
                style={styles.introArrowIcon}
                resizeMode="contain"
              />
            </View>
          )}

          <Text style={[styles.sheetBody, { color: palette.textMuted }]}>{current.text}</Text>

          <View style={styles.dots}>
            {pages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  {
                    backgroundColor: index === page ? palette.accent : palette.border,
                    width: index === page ? 10 : 8,
                    height: index === page ? 10 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <Springy
            accessibilityRole="button"
            accessibilityLabel={last ? 'Close' : 'Continue'}
            onPress={withClick(() => {
              if (last) {
                setPage(0);
                onClose();
              } else {
                setPage((value) => value + 1);
              }
            })}
            style={[styles.continue, { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.continueLabel, { color: palette.textOnAccent }]}>
              {last ? 'Got it' : 'Continue'}
            </Text>
          </Springy>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    maxWidth: 400,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  bannerContainer: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishingBannerImg: {
    width: '100%',
    height: 110,
  },
  introIconContainer: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  introArrowIcon: {
    width: 80,
    height: 80,
  },
  sheetTitle: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
  sheetBody: { ...typography.body, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dot: { borderRadius: 5 },
  continue: {
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  continueLabel: { ...typography.body, fontWeight: '800' },
});
