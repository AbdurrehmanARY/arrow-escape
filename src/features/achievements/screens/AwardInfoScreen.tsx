import { useEffect, useState } from 'react';
import { useTheme } from '@components';
import { Screen, ScreenHeader, withClick } from '@components';
import { challengeFor, isChallengeDay, parseChallengeId, today } from '@challenge';
import { TIER_LABELS } from '@game/codec';
import { summaryOf, tierOf } from '@data';
import { formatDuration } from './ChallengeScreen';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

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
  const playable = isChallengeDay(id);

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
      <div style={[styles.content, { padding: spacing.md }]}>
        <Text style={[styles.tileSub, { color: palette.text }]}>
          {tierLabel}
        </Text>
        {summaryText}
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
      </div>
    </Screen>
  );
}

function styles() {
  return {
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
      marginTop: spacing.sm,
    },
    subtitle: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.textMuted,
      marginBottom: spacing.xs,
    },
  };
}

export default AwardInfoScreen;
