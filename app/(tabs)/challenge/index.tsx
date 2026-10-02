/**
 * app/(tabs)/challenge/index.tsx — Challenge Mode Home.
 *
 * Purpose:      Display monthly challenge calendar, trophy progress, and month
 *               navigation matching reference design.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import {
  MonthlyTrophyBadge,
  MonthlyTrophyModal,
  Screen,
  Springy,
  useTheme,
  withClick,
} from '@components';
import { playMusic } from '@services/audio';
import {
  challengeFor,
  challengeId,
  daysInMonth,
  firstWeekdayOfMonth,
  isChallengeDay,
  today,
  type ChallengeDate,
} from '@challenge';
import { useChallengeStore } from '@state';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
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
  const params = useLocalSearchParams<{ month?: string; year?: string }>();
  const { palette } = useTheme();

  useEffect(() => {
    playMusic('menu');
  }, []);

  const now = useMemo(() => today(), []);

  const paramView = useMemo(() => {
    if (params.month) {
      const m = Number(params.month);
      const y = Number(params.year) || now.year;
      if (m >= 1 && m <= 12) {
        return { year: y, month: m };
      }
    }
    return undefined;
  }, [params.month, params.year, now.year]);

  const [overrideView, setOverrideView] = useState<{ year: number; month: number } | undefined>(undefined);
  const view = useMemo(
    () => paramView ?? overrideView ?? { year: now.year, month: now.month },
    [paramView, overrideView, now.year, now.month],
  );

  const [overrideSelected, setOverrideSelected] = useState<ChallengeDate | undefined>(undefined);
  const selected = useMemo(() => {
    if (overrideSelected) return overrideSelected;
    if (paramView) return { ...paramView, day: 1 };
    return now;
  }, [overrideSelected, paramView, now]);

  const setSelected = useCallback((date: ChallengeDate) => {
    setOverrideSelected(date);
  }, []);

  const records = useChallengeStore((state) => state.records);

  const shiftMonth = useCallback((delta: number) => {
    setOverrideView((current) => {
      const base = current ?? paramView ?? { year: now.year, month: now.month };
      const d = new Date(base.year, base.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  }, [paramView, now.year, now.month]);

  const isCurrentMonth = view.year === now.year && view.month === now.month;
  const monthDays = daysInMonth(view.year, view.month);

  const monthWins = useMemo(() => {
    let won = 0;
    for (let day = 1; day <= monthDays; day += 1) {
      const record = records[challengeId({ ...view, day })];
      if (record?.outcome === 'won') won += 1;
    }
    return won;
  }, [records, view, monthDays]);

  const isMonthCompleted = monthWins === monthDays;

  const cells = useMemo(() => {
    const lead = firstWeekdayOfMonth(view.year, view.month);
    const count = daysInMonth(view.year, view.month);
    const out: (number | null)[] = Array.from({ length: lead }, () => null);
    for (let day = 1; day <= count; day += 1) out.push(day);
    return out;
  }, [view]);

  const play = useCallback(
    (date: ChallengeDate) => {
      const levelId = challengeFor(date);
      if (levelId === undefined) return;
      router.push(`/play/${levelId}?challenge=${challengeId(date)}`);
    },
    [router],
  );

  const selectedRecord = records[challengeId(selected)];
  const isSelectedWon = selectedRecord?.outcome === 'won';
  const [showTrophyModal, setShowTrophyModal] = useState(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > 20 && Math.abs(gestureState.dy) < 30;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx < -40) {
            if (!isCurrentMonth) {
              shiftMonth(1);
            }
          } else if (gestureState.dx > 40) {
            shiftMonth(-1);
          }
        },
      }),
    [isCurrentMonth, shiftMonth],
  );

  return (
    <Screen palette={palette} scroll={false}>
      <View style={styles.container} {...panResponder.panHandlers}>
        {/* ---- Trophy header with month navigation arrows ------------------ */}
        <View style={styles.trophyHeader}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={withClick(() => shiftMonth(-1))}
            style={[styles.arrowButton, { backgroundColor: palette.accentMuted }]}
            hitSlop={12}
          >
            <FontAwesome name="chevron-left" size={14} color={palette.accent} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View ${MONTHS[view.month - 1]} ${view.year} challenge trophy`}
            onPress={withClick(() => setShowTrophyModal(true))}
            style={styles.trophyContainer}
          >
            <MonthlyTrophyBadge month={view.month} earned={isMonthCompleted} size={150} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={withClick(() => shiftMonth(1))}
            disabled={isCurrentMonth}
            style={[
              styles.arrowButton,
              { backgroundColor: palette.accentMuted },
              isCurrentMonth && { opacity: 0.4 },
            ]}
            hitSlop={12}
          >
            <FontAwesome
              name="chevron-right"
              size={14}
              color={isCurrentMonth ? palette.textFaint : palette.accent}
            />
          </Pressable>
        </View>

        {/* ---- Progress Pill ----------------------------------------------- */}
        <View style={styles.progressRow}>
          <View style={[styles.progressTrack, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: palette.success,
                  width: `${Math.max(14, Math.round((monthWins / monthDays) * 100))}%`,
                },
              ]}
            >
              <Text style={[styles.progressCount, { color: palette.textOnAccent }]}>{monthWins}</Text>
            </View>
          </View>
          <Text style={[styles.progressTotal, { color: palette.textFaint }]}>{monthDays}</Text>
        </View>

        {/* ---- Month Title ------------------------------------------------- */}
        <Text style={[styles.monthTitle, { color: palette.accent }]}>
          {MONTHS[view.month - 1]} {view.year}
        </Text>

        {/* ---- Weekday Headers --------------------------------------------- */}
        <View style={styles.weekHeader}>
          {WEEKDAYS.map((day) => (
            <Text key={day} style={[styles.weekday, { color: palette.textMuted }]}>
              {day}
            </Text>
          ))}
        </View>

        {/* ---- Calendar Grid ----------------------------------------------- */}
        <View style={styles.grid}>
          {cells.map((day, index) => {
            if (day === null) return <View key={`pad${index}`} style={styles.cell} />;

            const date = { year: view.year, month: view.month, day };
            const record = records[challengeId(date)];
            const playable = isChallengeDay(date, now);
            const isSelected =
              date.year === selected.year &&
              date.month === selected.month &&
              date.day === selected.day;

            return (
              <DayCell
                key={day}
                palette={palette}
                day={day}
                won={record?.outcome === 'won'}
                isSelected={isSelected}
                playable={playable}
                onPress={() => setSelected(date)}
              />
            );
          })}
        </View>

        {/* ---- Play Action Button ------------------------------------------ */}
        <View style={styles.actionContainer}>
          <Springy
            accessibilityRole="button"
            accessibilityLabel={`Play challenge for ${MONTHS[selected.month - 1]} ${selected.day}`}
            onPress={withClick(() => play(selected))}
            style={[styles.playButton, { backgroundColor: palette.accent }]}
          >
            <Text style={[styles.playButtonText, { color: palette.textOnAccent }]}>
              {isSelectedWon ? 'Play Again' : 'Play'}
            </Text>
          </Springy>
        </View>

        {/* ---- Monthly Trophy Modal ---------------------------------------- */}
        <MonthlyTrophyModal
          visible={showTrophyModal}
          onClose={() => setShowTrophyModal(false)}
          month={view.month}
          year={view.year}
          wins={monthWins}
          totalDays={monthDays}
          onGoToMonth={() => setSelected({ year: view.year, month: view.month, day: 1 })}
          palette={palette}
        />
      </View>
    </Screen>
  );
}

function DayCell({
  palette,
  day,
  won,
  isSelected,
  playable,
  onPress,
}: {
  palette: Palette;
  day: number;
  won: boolean;
  isSelected: boolean;
  playable: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!playable}
      onPress={withClick(onPress)}
      style={styles.cell}
    >
      <View style={styles.dayContainer}>
        {won ? (
          <View style={[styles.wonDot, { backgroundColor: palette.success }]} />
        ) : isSelected ? (
          <View style={[styles.selectedCircle, { backgroundColor: palette.accent }]}>
            <Text style={[styles.dayText, { color: palette.textOnAccent, fontWeight: '800' }]}>
              {day}
            </Text>
          </View>
        ) : (
          <Text
            style={[
              styles.dayText,
              playable ? { color: palette.text } : { color: palette.textFaint },
            ]}
          >
            {day}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const CELL = `${100 / 7}%`;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 0,
    paddingBottom: spacing.sm,
  },
  trophyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowButtonDisabled: {
    opacity: 0.4,
  },
  trophyContainer: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyImage: {
    width: 160,
    height: 160,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.sm,
    marginTop: 2,
    marginBottom: spacing.xs,
  },
  progressTrack: {
    flex: 1,
    height: 22,
    borderRadius: 11,
    overflow: 'hidden',
  },
  progressFill: {
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCount: {
    fontWeight: '800',
    fontSize: 13,
  },
  progressTotal: {
    fontSize: 14,
    fontWeight: '700',
  },
  monthTitle: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 4,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  weekday: {
    ...typography.small,
    width: CELL,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2,
  },
  cell: {
    width: CELL,
    aspectRatio: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayContainer: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wonDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  selectedCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: spacing.xs,
    marginBottom: 2,
    alignItems: 'center',
  },
  playButton: {
    width: '85%',
    maxWidth: 340,
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    fontFamily: fonts.displayExtra,
    fontWeight: '800',
    fontSize: 16,
  },
});
