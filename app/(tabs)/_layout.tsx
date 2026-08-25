/**
 * app/(tabs)/_layout.tsx — the five-tab shell.
 *
 * Purpose:      Put Home, Challenge, Leagues, Collection and Settings one tap from
 *               each other, using FontAwesome icon set directly.
 */

import { Tabs } from 'expo-router/js-tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { useTheme } from '@components';
import { today } from '@challenge';
import { playSfx } from '@services/audio';
import { isDayWon, useChallengeStore } from '@state/challengeStore';
import { spacing, typography, type Palette } from '@theme';

function TabIcon({
  name,
  focused,
  palette,
  badge = false,
}: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  focused: boolean;
  palette: Palette;
  badge?: boolean;
}) {
  return (
    <View style={styles.iconWrap}>
      <FontAwesome
        name={name}
        size={20}
        color={focused ? palette.accent : palette.textFaint}
      />
      {badge ? <View style={[styles.badge, { backgroundColor: palette.danger }]} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const records = useChallengeStore((state) => state.records);

  const challengePending = !isDayWon({ records }, today());

  return (
    <Tabs
      screenListeners={{ tabPress: () => playSfx('buttonClick') }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.textFaint,
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
            <TabIcon name="home" focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="challenge"
        options={{
          title: 'Challenge',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name="calendar"
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
            <TabIcon name="shield" focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'Collection',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="star" focused={focused} palette={palette} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="cog" focused={focused} palette={palette} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
