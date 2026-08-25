/**
 * app/(tabs)/challenge/info/league-fighter.tsx — League Fighter Info Page.
 */

import { AwardInfoLayout } from '@components';
import { useRewardBadge } from '@challenge';

export default function LeagueFighterInfoScreen() {
  const reward = useRewardBadge('league-fighter');

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
