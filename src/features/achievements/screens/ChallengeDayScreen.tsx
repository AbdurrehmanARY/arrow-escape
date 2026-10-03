/**
 * src/features/achievements/screens/ChallengeDayScreen.tsx — one day's challenge, in detail.
 *
 * Purpose:      Everything about a single challenge: which puzzle it is, how it
 *               went, and how to play or replay it.
 * Responsibilities:
 *               - The day, its level and its difficulty.
 *               - The stored result, broken out.
 *               - Play, replay, or an explanation of why it is locked.
 * Notes:        The `day` it renders is a `YYYY-MM-DD`, so this screen is a deep
 *               link and will still be one when sharing arrives. It also serves as
 *               the **completion screen**: finishing a challenge lands back here
 *               with the result filled in, which is a truer summary than a modal
 *               because it is the same page the player can return to a week later.
 *
 *               The day arrives as a prop from `app/(tabs)/challenge/[day].tsx`,
 *               not from `useLocalSearchParams`, for the same reason
 *               `features/gameplay`'s screen does not read its own `[id]`: a
 *               screen that cannot be rendered without a navigator is a screen
 *               that can only ever be tested through one.
 */

import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PillButton, Screen, ScreenHeader, useTheme } from '@components';
import { challengeFor, isChallengeDay, parseChallengeId, today } from '@challenge';
import { TIER_LABELS } from '@game/codec';
import { summaryOf, tierOf } from '@data';
import { useChallengeStore } from '@state';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

import { formatDuration } from './ChallengeScreen';

/**
 * Props for {@link ChallengeDayScreen}, forwarded from the `[day]` route.
 *
 * Purpose:      Let the screen be rendered for an arbitrary day without a
 *               navigator, and keep the decision about what a malformed `day`
 *               means inside the feature that has to explain it to the player.
 * Notes:        `parseChallengeId` below is the only thing that reads this, and
 *               it returns `null` for anything it does not recognise — which the
 *               screen renders as "no challenge here" rather than crashing. That
 *               is deliberate: a shared link is untrusted input.
 */
export interface ChallengeDayScreenProps {
  /** The `[day]` route segment, a `YYYY-MM-DD` challenge id. */
  day: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export function ChallengeDayScreen({ day }: ChallengeDayScreenProps) {
  const router = useRouter();
  const { palette } = useTheme();

  const now = useMemo(() => today(), []);
  const date = parseChallengeId(day);
  const records = useChallengeStore((state) => state.records);

  if (!date) {
    return (
      <Screen palette={palette}>
        <ScreenHeader palette={palette} title="Challenge" onBack={() => router.back()} />
        <Text style={[styles.body, { color: palette.textMuted }]}>
          That is not a challenge date.
        </Text>
      </Screen>
    );
  }

  const levelId = challengeFor(date);
  const tier = levelId === undefined ? undefined : tierOf(levelId);
  const summary = levelId === undefined ? undefined : summaryOf(levelId);
  const record = records[day];
  const playable = isChallengeDay(date, now);
  const won = record?.outcome === 'won';
  const perfect = won && record.heartsLeft === 5 && record.hintsUsed === 0;

  return (
    <Screen palette={palette} scroll>
      <ScreenHeader
        palette={palette}
        title={`${MONTHS[date.month - 1]} ${date.day}`}
        subtitle={String(date.year)}
        onBack={() => router.back()}
      />

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {tier ? (
          <View style={[styles.badge, { backgroundColor: palette.accentMuted }]}>
            <Text style={[styles.badgeText, { color: palette.accent }]}>{TIER_LABELS[tier]}</Text>
          </View>
        ) : null}

        {summary ? (
          <Text style={[styles.boardMeta, { color: palette.textMuted }]}>
            {summary.rows}×{summary.cols} board
          </Text>
        ) : null}

        {won ? (
          <>
            <Text style={[styles.verdict, { color: palette.success }]}>
              {perfect ? 'Flawless' : 'Completed'}
            </Text>
            <View style={styles.grid}>
              <Cell palette={palette} label="Time" value={formatDuration(record.timeMs)} />
              <Cell palette={palette} label="Moves" value={String(record.moves)} />
              <Cell palette={palette} label="Hearts" value={`${record.heartsLeft}/5`} />
              <Cell palette={palette} label="Hints" value={String(record.hintsUsed)} />
            </View>
            {perfect ? null : (
              <Text style={[styles.nudge, { color: palette.textFaint }]}>
                A replay can only improve this — a worse attempt will not overwrite it.
              </Text>
            )}
          </>
        ) : record ? (
          <>
            <Text style={[styles.verdict, { color: palette.danger }]}>Out of hearts</Text>
            <Text style={[styles.body, { color: palette.textMuted }]}>
              The board was still winnable. It always is.
            </Text>
          </>
        ) : (
          <Text style={[styles.body, { color: palette.textMuted }]}>
            {playable ? 'Not played yet.' : 'This challenge has not arrived yet.'}
          </Text>
        )}

        {playable && levelId !== undefined ? (
          <PillButton
            palette={palette}
            label={won ? 'Play again' : record ? 'Try again' : 'Play'}
            primary={!won}
            onPress={() => router.replace(`/play/${levelId}?challenge=${day}`)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Cell({ palette, label, value }: { palette: Palette; label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text style={[styles.cellValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.cellLabel, { color: palette.textFaint }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  badge: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill },
  badgeText: { ...typography.small, fontWeight: '700' },
  boardMeta: { ...typography.small },
  verdict: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
  body: { ...typography.body, textAlign: 'center' },
  nudge: { ...typography.small, textAlign: 'center' },

  grid: { flexDirection: 'row', gap: spacing.xl, marginVertical: spacing.sm },
  cell: { alignItems: 'center' },
  cellValue: { ...typography.heading, fontFamily: fonts.displayExtra, fontWeight: '800' },
  cellLabel: { ...typography.small },
});
