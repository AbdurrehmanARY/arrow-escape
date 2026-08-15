/**
 * app/(tabs)/_layout.tsx — the five-tab shell.
 *
 * Purpose:      Put Home, Challenge, Leagues, Collection and Settings one tap from
 *               each other, as the reference design does.
 * Notes:        A tab bar rather than a menu screen is a real behavioural change,
 *               not a coat of paint. It is what makes a daily challenge a *habit*:
 *               the calendar is always one tap away instead of two, and the badge
 *               on the tab can say "there is something here today" without the
 *               player having to go and look.
 *
 *               The game screen deliberately sits **outside** this group. A board
 *               must not have a tab bar under it — it eats the space the board
 *               needs, and a stray tap on it during play is a lost read. `play`,
 *               `levels` and `account` stay stack routes for that reason.
 *
 *               Imported from `expo-router/js-tabs`: the `Tabs` re-export from
 *               `expo-router` itself is deprecated in this version.
 */

import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@components';
import { today } from '@challenge';
import { playSfx } from '@services/audio';
import { isDayWon, useChallengeStore } from '@state/challengeStore';
import { spacing, typography, type Palette } from '@theme';

/**
 * Tab icons are glyphs, not images.
 *
 * The reference design uses rendered 3D artwork throughout. That cannot be
 * generated here, and a missing-image placeholder is worse than a clean glyph — so
 * these are typographic, sized and weighted to read at tab-bar scale. Swapping in
 * real artwork later is replacing this one component.
 */
const ICONS = {
  index: '⌂',
  challenge: '▦',
  leagues: '◆',
  collection: '★',
  settings: '⚙',
} as const;

function TabIcon({
  glyph,
  focused,
  palette,
  badge = false,
}: {
  glyph: string;
  focused: boolean;
  palette: Palette;
  badge?: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <Text style={[styles.icon, { color: focused ? palette.accent : palette.textFaint }]}>
        {glyph}
      </Text>
      {badge ? <View style={[styles.badge, { backgroundColor: palette.danger }]} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const records = useChallengeStore((state) => state.records);

  // A dot on the Challenge tab while today is unplayed. Derived, so it clears the
  // moment the challenge is won and reappears by itself after midnight.
  const challengePending = !isDayWon({ records }, today());

  return (
    <Tabs
      // One listener for all five tabs rather than five identical `withClick`s.
      // These are the most-pressed controls in the app; a silent tab bar with
      // audible buttons everywhere else reads as sound being broken.
      screenListeners={{ tabPress: () => playSfx('buttonClick') }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textFaint,
        /*
          The bar grows by the bottom inset instead of being a fixed 64.

          At a fixed height the Android gesture pill sat directly on top of the
          tab labels — "Leagues" and "Collection" were struck through by it on
          every gesture-navigation phone, which is most of them. A hardcoded
          bottom padding is the same bug with a different number: the inset is
          0 on a device with hardware keys and ~24 with a gesture bar, and only
          the device knows which it is.
        */
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 64 + insets.bottom,
          paddingBottom: spacing.sm + insets.bottom,
          paddingTop: spacing.sm,
        },
        tabBarLabelStyle: { ...typography.small, fontWeight: '600' },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={ICONS.index} focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenge"
        options={{
          title: 'Challenge',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              glyph={ICONS.challenge}
              focused={focused}
              palette={palette}
              badge={challengePending}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: 'Leagues',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={ICONS.leagues} focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={ICONS.collection} focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon glyph={ICONS.settings} focused={focused} palette={palette} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 20, fontWeight: '700' },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
