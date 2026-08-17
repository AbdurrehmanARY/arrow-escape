/**
 * app/(tabs)/leagues.tsx — the weekly competition.
 *
 * Purpose:      Show which league the player is in, how long the week has left,
 *               where they stand, and what happens at the end of it.
 * Notes:        **The leaderboard shows one real entry — the player — and says the
 *               rest are not connected.** It does not invent opponents.
 *
 *               That is a deliberate departure from the reference design, which
 *               shows a populated table of names, flags and scores. Shipping
 *               invented players would tell someone they are 32nd of 50 in a
 *               competition that does not exist, and that they beat a person who is
 *               not real. It is the one thing here that a later release could not
 *               undo, because the player would already have believed it.
 *
 *               Everything else is built and live: the six-league ladder, the UTC
 *               week and its countdown, the score derived from arrows actually
 *               cleared, and the promotion and demotion zones. When accounts and
 *               sync exist, `rows` stops being a single local entry and `LeagueRow`
 *               renders the rest unchanged.
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen, Springy, useSheetSound, useTheme, withClick } from '@components';
import { today } from '@challenge';
import {
  arrowsFor,
  DEMOTION_PLACES,
  formatRemaining,
  LEAGUES,
  leagueForArrows,
  msRemaining,
  nextLeague,
  PROMOTION_PLACES,
  weekOf,
  zoneFor,
} from '@league';
import { leaderboard, type LeaderboardRow } from '@services/sync';
import { useAuthStore } from '@state/authStore';
import { statsOf, useChallengeStore } from '@state/challengeStore';
import { arrowsThisWeek, useLeagueStore } from '@state/leagueStore';
import { fonts, radius, spacing, typography, type Palette } from '@theme';

/** One row of the table. Shaped for the server rows that will join it. */
interface Standing {
  readonly id: string;
  readonly name: string;
  readonly arrows: number;
  readonly you: boolean;
}

export default function LeaguesScreen() {
  const router = useRouter();
  const { palette } = useTheme();

  const weeks = useLeagueStore((state) => state.weeks);
  const challengeRecords = useChallengeStore((state) => state.records);

  const [showIntro, setShowIntro] = useState(false);

  // The countdown only needs to be right to the minute — it is displayed as
  // "5d 13h". A per-second tick would re-render the screen 86,400 times a day to
  // change nothing.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const week = useMemo(() => weekOf(now), [now]);
  const stats = useMemo(
    () => statsOf({ records: challengeRecords }, today()),
    [challengeRecords],
  );

  const arrows = arrowsFor(arrowsThisWeek({ weeks }, now), stats.won);
  const league = leagueForArrows(arrows);
  const promotesTo = nextLeague(league);

  /**
   * The week's table, from the server when there is one.
   *
   * Starts empty and stays empty without an account or a connection, which is
   * what keeps the promise at the top of this file: the fallback below is the
   * player's own row and nothing invented. `leaderboard` never throws and returns
   * `[]` for every failure, so there is no error state to render here — an empty
   * table and an unreachable one look the same to a player, and they should.
   */
  const [remote, setRemote] = useState<readonly LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void leaderboard(week.id).then((table) => {
      if (cancelled) return;
      setRemote(table);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [week.id]);

  const session = useAuthStore((state) => state.session);
  const myId = session?.user.id;

  // Not memoised: at most fifty rows mapped once per render, against a screen
  // that re-renders on a one-minute timer. A memo here would cost more to keep
  // correct than the work it saves.
  const rows: readonly Standing[] =
    remote.length === 0
      ? // No table yet: the player's own row, honestly labelled, exactly as before.
        [{ id: 'you', name: 'You', arrows, you: true }]
      : remote.map((row) => ({
          id: row.userId,
          // The player's own row says "You" even though the server knows their
          // name — finding yourself in a list of fifty is the single most common
          // thing anyone does on this screen.
          name: row.userId === myId ? 'You' : row.name,
          arrows: row.arrows,
          you: row.userId === myId,
        }));

  const rank = Math.max(1, rows.findIndex((row) => row.you) + 1);
  const zone = zoneFor(rank, rows.length, league.id);
  /** True only when the table is real — drives the notice at the bottom. */
  const live = remote.length > 0;

  return (
    <Screen scroll>
      {/* ---- Header --------------------------------------------------- */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.leagueName, { color: palette.accent }]}>{league.name} League</Text>
          <Text style={[styles.countdown, { color: palette.textMuted }]}>
            {formatRemaining(msRemaining(week, now))}
          </Text>
        </View>
        <Springy
          accessibilityRole="button"
          accessibilityLabel="How leagues work"
          onPress={withClick(() => setShowIntro(true))}
          hitSlop={12}
        >
          <Text style={[styles.info, { color: palette.textFaint }]}>ⓘ</Text>
        </Springy>
      </View>

      <View style={[styles.shield, { backgroundColor: palette.accentMuted }]}>
        <Text style={[styles.shieldGlyph, { color: palette.accent }]}>◆</Text>
      </View>

      <Text style={[styles.score, { color: palette.text }]}>{arrows}</Text>
      <Text style={[styles.scoreLabel, { color: palette.textFaint }]}>arrows this week</Text>

      {/* ---- The ladder ------------------------------------------------ */}
      <View style={styles.ladder}>
        {LEAGUES.map((entry) => {
          const current = entry.id === league.id;
          return (
            <View
              key={entry.id}
              style={[
                styles.rung,
                {
                  backgroundColor: current ? palette.accent : palette.surfaceRaised,
                  borderColor: current ? palette.accent : palette.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.rungText,
                  { color: current ? palette.textOnAccent : palette.textFaint },
                ]}
              >
                {entry.name[0]}
              </Text>
            </View>
          );
        })}
      </View>

      {promotesTo ? (
        <Text style={[styles.nextLine, { color: palette.textMuted }]}>
          {Math.max(0, promotesTo.entryArrows - arrows)} more arrows reaches {promotesTo.name}
        </Text>
      ) : (
        <Text style={[styles.nextLine, { color: palette.textMuted }]}>Top league reached.</Text>
      )}

      {/* ---- Standings -------------------------------------------------- */}
      <Text style={[styles.sectionTitle, { color: palette.textFaint }]}>This week</Text>

      {rows.map((row, index) => (
        <LeagueRow
          key={row.id}
          palette={palette}
          rank={index + 1}
          name={row.name}
          arrows={row.arrows}
          highlight={row.you}
        />
      ))}

      <View style={styles.zoneMark}>
        <Text style={[styles.zoneText, { color: palette.success }]}>
          ▲ Promotion zone — top {PROMOTION_PLACES}
        </Text>
        <Text style={[styles.zoneText, { color: palette.textFaint }]}>
          ▼ Bottom {DEMOTION_PLACES} drop a league
        </Text>
      </View>

      {/*
        The notice earns its place only while the table is not real.

        It has been on this screen since before there was anywhere to sync to, and
        leaving it up next to a live table of fifty players would be the app
        calling itself a liar.
      */}
      {live ? null : (
        <View style={[styles.notice, { borderColor: palette.border }]}>
          <Text style={[styles.noticeTitle, { color: palette.text }]}>
            {loading ? 'Loading the table…' : 'No one to compare with yet'}
          </Text>
          <Text style={[styles.noticeBody, { color: palette.textMuted }]}>
            {loading
              ? 'Fetching this week’s standings.'
              : session
                ? 'No scores have been posted for this week yet. Clear a level and yours will be the first.'
                : 'Leagues need an account so scores can be compared fairly. Until then this board shows only you — rather than made-up players, which would make your rank meaningless.'}
          </Text>
          {session ? null : (
            <Springy accessibilityRole="button" onPress={withClick(() => router.push('/account'))}>
              <Text style={[styles.link, { color: palette.accent }]}>About accounts →</Text>
            </Springy>
          )}
        </View>
      )}

      <Text style={[styles.footnote, { color: palette.textFaint }]}>
        You are {zone === 'promotion' ? 'in the promotion zone' : 'safe'} this week. The
        league resets every Monday.
      </Text>

      <LeagueIntro
        visible={showIntro}
        palette={palette}
        onClose={() => setShowIntro(false)}
      />
    </Screen>
  );
}

function LeagueRow({
  palette,
  rank,
  name,
  arrows,
  highlight,
}: {
  palette: Palette;
  rank: number;
  name: string;
  arrows: number;
  highlight: boolean;
}) {
  const medal = rank <= 3;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: highlight ? palette.accentMuted : palette.surface,
          borderColor: highlight ? palette.accent : palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.rankBadge,
          { backgroundColor: medal ? palette.accent : 'transparent' },
        ]}
      >
        <Text
          style={[
            styles.rankText,
            { color: medal ? palette.textOnAccent : palette.success },
          ]}
        >
          {rank}
        </Text>
      </View>
      <Text style={[styles.rowName, { color: palette.text }]}>{name}</Text>
      <Text style={[styles.rowScore, { color: palette.text }]}>{arrows}</Text>
    </View>
  );
}

/**
 * The three-card explainer, shown from the ⓘ button.
 *
 * Manual rather than automatic on first open: a modal that appears before a player
 * has any idea what a league is teaches nothing, and is dismissed reflexively.
 */
function LeagueIntro({
  visible,
  palette,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);

  useSheetSound(visible);

  const pages = [
    { glyph: '➤', text: 'Collect arrows in levels to build up your score.' },
    { glyph: '◆', text: 'Compete with others to collect the most arrows before the league ends.' },
    { glyph: '▲', text: 'Finish inside the promotion zone to move up to a higher league.' },
  ];

  const last = page === pages.length - 1;
  const current = pages[page]!;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={[styles.sheet, { backgroundColor: palette.surface }]}>
          <Text style={[styles.sheetTitle, { color: palette.text }]}>Leagues</Text>

          <View style={[styles.sheetEmblem, { backgroundColor: palette.accentMuted }]}>
            <Text style={[styles.sheetGlyph, { color: palette.accent }]}>{current.glyph}</Text>
          </View>

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
            style={[
              styles.continue,
              { backgroundColor: palette.accent },
            ]}
          >
            <Text style={[styles.continueLabel, { color: palette.textOnAccent }]}>
              {last ? 'Got it' : 'Continue'}
            </Text>
          </Springy>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { gap: 2 },
  leagueName: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
  countdown: { ...typography.body },
  info: { fontSize: 22 },

  shield: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
  },
  shieldGlyph: { fontSize: 46, fontWeight: '800' },

  score: { ...typography.display, textAlign: 'center' },
  scoreLabel: { ...typography.small, textAlign: 'center', marginBottom: spacing.lg },

  ladder: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  rung: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rungText: { ...typography.body, fontWeight: '800' },
  nextLine: { ...typography.small, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.lg },

  sectionTitle: {
    ...typography.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rankBadge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rankText: { ...typography.body, fontWeight: '800' },
  rowName: { ...typography.body, fontWeight: '700', flex: 1 },
  rowScore: { ...typography.body, fontWeight: '700' },

  zoneMark: { alignItems: 'center', gap: 2, marginVertical: spacing.md },
  zoneText: { ...typography.small, fontWeight: '700' },

  notice: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  noticeTitle: { ...typography.body, fontWeight: '700' },
  noticeBody: { ...typography.small },
  link: { ...typography.small, fontWeight: '700', marginTop: spacing.xs },

  footnote: { ...typography.small, textAlign: 'center', marginTop: spacing.lg },

  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  sheetTitle: { ...typography.title, fontFamily: fonts.displayExtra, fontWeight: '800' },
  sheetEmblem: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  sheetGlyph: { fontSize: 40, fontWeight: '800' },
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
