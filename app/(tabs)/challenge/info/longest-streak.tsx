/**
 * app/(tabs)/challenge/info/longest-streak.tsx — Longest Streak Info Page.
 */

import { AwardInfoLayout } from '@components';
import { useRewardBadge } from '@challenge';

export default function LongestStreakInfoScreen() {
  const reward = useRewardBadge('longest-streak');

  if (!reward) return null;

  return (
    <AwardInfoLayout
      image={reward.image}
      badgeNumber={reward.current}
      dateText={reward.statusText}
      title={reward.title}
      description={reward.description}
      nextTargetText={reward.active ? 'Unlocked!' : `Progress: ${reward.current} / ${reward.requirement}`}
      progressCurrent={reward.current}
      progressTotal={reward.requirement}
    />
  );
}
