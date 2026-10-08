/**
 * src/features/achievements/screens/AwardInfoScreen.tsx — Award Info screen.
 *
 * Purpose: Display detailed information about player achievements.
 */

import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme, Screen, ScreenHeader } from '@components';
import { challengeFor, isChallengeDay, parseChallengeId, today } from '@challenge';
import { useChallengeStore } from '@state';
import { TIER_LABELS } from '@game/codec';
import { summaryOf, tierOf } from '@data';
import { fonts, spacing } from '@theme';

export function AwardInfoScreen({ id }: { id: string }) {
  const router = useRouter();
  const { palette } = useTheme();

  const now = useMemo(() => today(), []);
  const date = parseChallengeId(id);
  const records = useChallengeStore((state) => state.records);

  if (!date) {
    return (
      <Screen palette={palette}>
        <ScreenHeader palette={palette} title="Award Info" onBack={() => router.back()} />
        <Text style={[styles.body, { color: palette.textMuted }]}>
          Invalid challenge ID.
        </Text>
      </Screen>
    );
  }

  const levelId = challengeFor(date);
  const tier = levelId === undefined ? undefined : tierOf(levelId);
  const summary = levelId === undefined ? undefined : summaryOf(levelId);
  const record = records[id];
  const playable = isChallengeDay(date, now);

  const tierLabel = tier ? TIER_LABELS[tier] : 'Unknown';
  const summaryText = summary ? summary.rows * summary.cols : 'No summary';

  return (
    <Screen palette={palette}>
      <ScreenHeader palette={palette} title="Award Info" onBack={() => router.back()} />
      <Text style={[styles.title, { color: palette.textFaint }]}>
        Award Information
      </Text>
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>
        {date.year} – {date.month} – {date.day}
      </Text>
      <View style={styles.content}>
        <Text style={[styles.tileSub, { color: palette.text }]}>
          {tierLabel}
        </Text>
        <Text style={[styles.body, { color: palette.textMuted }]}>
          {summaryText}
        </Text>
        {playable && levelId !== undefined ? (
          <>
            <Text style={[styles.verdict, { color: palette.success }]}>
              Flawless
            </Text>
            <Text style={[styles.verdict, { color: palette.danger }]}>
              Completed
            </Text>
          </>
        ) : record ? (
          <>
            <Text style={[styles.verdict, { color: palette.textMuted }]}>
              Not Played Yet
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.verdict, { color: palette.textMuted }]}>
              No Record
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 14,
    fontFamily: fonts.bodyRegular,
    textAlign: 'center',
    marginTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: fonts.displayBold,
    textAlign: 'center',
    marginBottom: 8,
  },
  content: {
    padding: spacing.md,
  },
  tileSub: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    textAlign: 'center',
    marginTop: 1,
  },
  verdict: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fonts.displayExtra,
    marginTop: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
});

export default AwardInfoScreen;
