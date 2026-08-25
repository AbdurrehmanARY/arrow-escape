/**
 * app/(tabs)/challenge/info/perfect-play.tsx — Perfect Play Info Page.
 */

import { AwardInfoLayout } from '@components';
import { useRewardBadge } from '@challenge';

export default function PerfectPlayInfoScreen() {
  const reward = useRewardBadge('perfect-play');

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
