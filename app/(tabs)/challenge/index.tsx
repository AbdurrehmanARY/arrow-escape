/**
 * app/challenge.tsx — Challenge Mode's home.
 *
 * Purpose:      Show today's challenge, the month's calendar, and how the player
 *               is doing.
 * Responsibilities:
 *               - Today's puzzle, its difficulty, and whether it is done.
 *               - A month grid with a dot per completed day.
 *               - Streak and record summary.
 *               - Month navigation, and playing any past day.
 * Notes:        Every number on this screen is **derived from the stored records**,
 *               never read from a stored counter — see `challengeStore`. The month
 *               being viewed is local state; the day being played is a route
 *               parameter, so a challenge is a deep link and will still be one when
 *               sharing arrives.
 *
 *               There is no reward, league or leaderboard UI here, deliberately.
 *               The brief asked for those to be designed *for* rather than built,
 *               and an empty rewards shelf teaches a player the feature is dead.
 */

import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PillButton, Screen, ScreenHeader, useTheme, withClick } from '@components';
import {
  challengeFor,
  challengeId,
  daysInMonth,
  earnedCount,
  firstWeekdayOfMonth,
  nextReward,
  REWARDS,
  isChallengeDay,
  today,
  type ChallengeDate,
} from '@challenge';
import { TIER_LABELS } from '@game/codec';
import { tierOf } from '@data/levels';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { radius, spacing, typography, type Palette } from '@theme';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** `2:05` from milliseconds. Challenges are minutes, never hours. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ChallengeScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const now = useMemo(() => today(), []);
  const [view, setView] = useState({ year: now.year, month: now.month });

  const records = useChallengeStore((state) => state.records);
  const stats = useMemo(() => statsOf({ records }, now), [records, now]);

  /**
   * Which day the card at the top is describing. Defaults to today.
   *
   * Selecting a day **stays on this screen** rather than pushing a detail route.
   * A calendar and a card describing one of its cells are one thing, and splitting
   * them across two screens meant every glance at a past day cost a navigation
   * there and a back press home. The card is the header for the calendar under it,
   * so the calendar changes the header — and Play is where it always was.
   */
  const [selected, setSelected] = useState<ChallengeDate>(now);

  const selectedLevel = challengeFor(selected);
  const selectedTier = selectedLevel === undefined ? undefined : tierOf(selectedLevel);
  const selectedRecord = records[challengeId(selected)];
  const selectedIsToday =
    selected.year === now.year && selected.month === now.month && selected.day === now.day;

  const play = useCallback(
    (date: ChallengeDate) => {
      const levelId = challengeFor(date);
      if (levelId === undefined) return;
      router.push(`/play/${levelId}?challenge=${challengeId(date)}`);
    },
    [router],
  );

  const shiftMonth = useCallback((delta: number) => {
    setView((current) => {
      const d = new Date(current.year, current.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }, []);

  // A leading blank for each day before the 1st, so the grid lines up under the
  // weekday headings. Monday-first — see `firstWeekdayOfMonth`.
  const cells = useMemo(() => {
    const lead = firstWeekdayOfMonth(view.year, view.month);
    const count = daysInMonth(view.year, view.month);
    const out: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= count; day += 1) out.push(day);
    return out;
  }, [view]);

  const monthWins = useMemo(() => {
    let won = 0;
    for (let day = 1; day <= daysInMonth(view.year, view.month); day += 1) {
      const record = records[challengeId({ ...view, day })];
      if (record?.outcome === 'won') won += 1;
    }
    return won;
  }, [records, view]);

  const isCurrentMonth = view.year === now.year && view.month === now.month;
  const monthDays = daysInMonth(view.year, view.month);

  // Reward standing, shown as a nudge rather than a separate trip.
  const earned = useMemo(() => earnedCount(stats), [stats]);
  const next = useMemo(() => nextReward(stats), [stats]);
  const totalRewards = REWARDS.length;

  return (
    <Screen scroll>
      <ScreenHeader
        palette={palette}
        title="Challenge"
        subtitle="A new puzzle every day"
        onBack={() => router.back()}
      />

      {/*
        ---- The selected day ------------------------------------------

        This card is the calendar's header, not a separate screen. Tapping a cell
        below changes what it describes; Play always plays whatever it is showing.
      */}
      <View style={[styles.today, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.todayDate, { color: palette.textMuted }]}>
          {MONTHS[selected.month - 1]} {selected.day}
          {selected.year === now.year ? '' : ` ${selected.year}`}
          {selectedIsToday ? ' · TODAY' : ''}
        </Text>

        {selectedTier ? (
          <View style={[styles.badge, { backgroundColor: palette.accentMuted }]}>
            <Text style={[styles.badgeText, { color: palette.accent }]}>
              {TIER_LABELS[selectedTier]}
            </Text>
          </View>
        ) : null}

        {selectedRecord?.outcome === 'won' ? (
          <>
            <Text style={[styles.doneMark, { color: palette.success }]}>Completed</Text>
            <View style={styles.resultRow}>
              <Stat palette={palette} label="Time" value={formatDuration(selectedRecord.timeMs)} />
              <Stat palette={palette} label="Moves" value={String(selectedRecord.moves)} />
              <Stat palette={palette} label="Hearts" value={`${selectedRecord.heartsLeft}/5`} />
              <Stat palette={palette} label="Hints" value={String(selectedRecord.hintsUsed)} />
            </View>
            <PillButton palette={palette} label="Play again" onPress={() => play(selected)} />
          </>
        ) : (
          <>
            <Text style={[styles.todayHint, { color: palette.textMuted }]}>
              {selectedRecord
                ? 'You ran out of hearts. The board is still winnable.'
                : selectedIsToday
                  ? 'One hard puzzle. Same for everyone, everywhere.'
                  : 'Not played yet. Past challenges stay open.'}
            </Text>
            <PillButton palette={palette} label="Play" primary onPress={() => play(selected)} />
          </>
        )}
      </View>

      {/* ---- Streak and records --------------------------------------- */}
      <View style={styles.statRow}>
        <Stat palette={palette} label="Streak" value={String(stats.currentStreak)} big />
        <Stat palette={palette} label="Best streak" value={String(stats.longestStreak)} big />
        <Stat palette={palette} label="Won" value={String(stats.won)} big />
        <Stat
          palette={palette}
          label="Fastest"
          value={stats.bestTimeMs === undefined ? '—' : formatDuration(stats.bestTimeMs)}
          big
        />
      </View>

      {/* ---- Calendar -------------------------------------------------- */}
      <View style={styles.monthBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          onPress={withClick(() => shiftMonth(-1))}
          hitSlop={12}
        >
          <Text style={[styles.monthArrow, { color: palette.accent }]}>‹</Text>
        </Pressable>

        <Text style={[styles.monthLabel, { color: palette.text }]}>
          {MONTHS[view.month - 1]} {view.year}
        </Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next month"
          onPress={withClick(() => shiftMonth(1))}
          disabled={isCurrentMonth}
          hitSlop={12}
        >
          <Text
            style={[
              styles.monthArrow,
              { color: isCurrentMonth ? palette.textFaint : palette.accent },
            ]}
          >
            ›
          </Text>
        </Pressable>
      </View>

      {/*
        Month progress, as a bar rather than only a number.

        The count alone ("6 of 31") is accurate and says nothing about *shape* — a
        bar shows at a glance whether a month is nearly done or barely begun, which
        is the thing that makes someone come back tomorrow.
      */}
      <View style={styles.progressRow}>
        <View style={[styles.progressTrack, { backgroundColor: palette.surfaceRaised }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: palette.success,
                width: `${Math.max(8, Math.round((monthWins / monthDays) * 100))}%`,
              },
            ]}
          >
            <Text style={[styles.progressCount, { color: palette.textOnAccent }]}>
              {monthWins}
            </Text>
          </View>
        </View>
        <Text style={[styles.progressTotal, { color: palette.textFaint }]}>{monthDays}</Text>
      </View>

      <View style={styles.weekHeader}>
        {WEEKDAYS.map((day) => (
          <Text key={day} style={[styles.weekday, { color: palette.textFaint }]}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (day === null) return <View key={`pad${index}`} style={styles.cell} />;

          const date = { year: view.year, month: view.month, day };
          const record = records[challengeId(date)];
          const playable = isChallengeDay(date, now);
          const isToday =
            date.year === now.year && date.month === now.month && date.day === now.day;

          return (
            <DayCell
              key={day}
              palette={palette}
              day={day}
              won={record?.outcome === 'won'}
              attempted={record !== undefined && record.outcome !== 'won'}
              isToday={isToday}
              selected={
                date.year === selected.year &&
                date.month === selected.month &&
                date.day === selected.day
              }
              playable={playable}
              onPress={() => setSelected(date)}
            />
          );
        })}
      </View>

      {/* ---- The rest of Challenge Mode -------------------------------- */}
      <View style={styles.links}>
        <PillButton
          palette={palette}
          label={`Rewards · ${earned} of ${totalRewards}`}
          onPress={() => router.push('/challenge/rewards')}
        />
        <PillButton
          palette={palette}
          label="History"
          onPress={() => router.push('/challenge/history')}
        />
        <PillButton
          palette={palette}
          label="Statistics"
          onPress={() => router.push('/challenge/stats')}
        />
        <PillButton
          palette={palette}
          label="Leagues"
          onPress={() => router.push('/leagues')}
        />
      </View>

      {next ? (
        <Text style={[styles.footnote, { color: palette.textMuted }]}>
          Next reward: {next.definition.name} — {next.current} of {next.definition.threshold}
        </Text>
      ) : null}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        Challenges are Hard, Super Hard or Brutal only. Missed a day? Past challenges
        stay open.
      </Text>
    </Screen>
  );
}

/** One day in the month grid. */
function DayCell({
  palette,
  day,
  won,
  attempted,
  isToday,
  selected,
  playable,
  onPress,
}: {
  palette: Palette;
  day: number;
  won: boolean;
  attempted: boolean;
  isToday: boolean;
  /** The day the card above is describing. */
  selected: boolean;
  playable: boolean;
  onPress: () => void;
}) {
  const background = won
    ? palette.success
    : isToday
      ? palette.accent
      : attempted
        ? palette.dangerMuted
        : 'transparent';

  const color = won || isToday ? palette.textOnAccent : playable ? palette.text : palette.textFaint;

  const label = won
    ? `${day}, completed`
    : playable
      ? `${day}, show this challenge`
      : `${day}, not yet available`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !playable, selected }}
      disabled={!playable}
      onPress={withClick(onPress)}
      style={styles.cell}
    >
      {/*
        Selection is a ring around the cell rather than a change of fill.

        The fill already carries three separate facts — won, today, attempted — and
        overloading it with a fourth would mean a selected won day and a selected
        today day could not both be read. A ring sits outside all of them and
        composes with every combination.
      */}
      <View
        style={[
          styles.dayDot,
          { backgroundColor: background },
          selected && { borderWidth: 2, borderColor: palette.accent },
        ]}
      >
        {/*
          A won day is a solid disc with no number on it.

          The date is not lost — it is the cell's position in the grid, which is
          what a calendar is for. Dropping the digit is what lets a filled month
          read as a run of colour at a glance instead of as thirty-one numbers that
          happen to be tinted: the difference between a streak you can see and one
          you have to count.

          The accessibility label still carries the day, because position conveys
          nothing to a screen reader.
        */}
        {won ? null : <Text style={[styles.dayText, { color }]}>{day}</Text>}
      </View>
    </Pressable>
  );
}

function Stat({
  palette,
  label,
  value,
  big = false,
}: {
  palette: Palette;
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[big ? styles.statValueBig : styles.statValue, { color: palette.text }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: palette.textFaint }]}>{label}</Text>
    </View>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  today: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  todayDate: { ...typography.small, textTransform: 'uppercase', letterSpacing: 1 },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  badgeText: { ...typography.small, fontWeight: '700' },
  todayHint: { ...typography.body, textAlign: 'center', marginBottom: spacing.xs },
  doneMark: { ...typography.body, fontWeight: '700' },
  resultRow: { flexDirection: 'row', gap: spacing.lg, marginVertical: spacing.sm },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { ...typography.body, fontWeight: '700' },
  statValueBig: { ...typography.title, fontWeight: '800' },
  statLabel: { ...typography.small },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  monthArrow: { fontSize: 30, lineHeight: 34, fontWeight: '700', paddingHorizontal: spacing.md },
  monthLabel: { ...typography.heading, fontWeight: '700' },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  progressTrack: { flex: 1, height: 26, borderRadius: 13, overflow: 'hidden' },
  progressFill: {
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 34,
  },
  progressCount: { ...typography.small, fontWeight: '800' },
  progressTotal: { ...typography.body, fontWeight: '700' },

  weekHeader: { flexDirection: 'row', marginBottom: spacing.xs },
  weekday: { ...typography.small, width: CELL, textAlign: 'center' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { ...typography.body, fontWeight: '600' },

  links: { gap: spacing.sm, marginTop: spacing.lg },
  footnote: {
    ...typography.small,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
