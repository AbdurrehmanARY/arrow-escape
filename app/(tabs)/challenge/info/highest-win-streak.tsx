/**
 * app/(tabs)/challenge/info/highest-win-streak.tsx — Highest Win Streak Info Page.
 */

import { AwardInfoLayout } from '@components';
import { useRewardBadge } from '@challenge';

export default function HighestWinStreakInfoScreen() {
  const reward = useRewardBadge('highest-win-streak');

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
