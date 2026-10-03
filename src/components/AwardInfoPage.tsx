/**
 * src/components/AwardInfoPage.tsx — one award info page, driven by the badge id.
 *
 * Purpose:      Answer "show me this award" for any reward, so the eight routes
 *               under `app/(tabs)/challenge/info/` are names rather than copies.
 * Responsibilities:
 *               - Look the badge up in the live reward state.
 *               - Map it onto `AwardInfoLayout`, once, in one place.
 * Notes:        The eight routes were byte-identical from line 13 down and differ
 *               only in the id and the component name — checked before this file
 *               existed. That mapping had eight copies and no way to notice one
 *               drifting; it now has one. A badge that cannot be resolved renders
 *               nothing, exactly as each route did.
 */

import { useRewardBadge } from '@challenge';

import { AwardInfoLayout } from './AwardInfoLayout';

/** One award info page. */
export interface AwardInfoPageProps {
  /** Reward id, spelled exactly as the reward table spells it. */
  readonly badgeId: string;
  /** Optional shield id for the shield award. */
  readonly shieldId?: string | undefined;
  /** The instant to resolve weekly awards against. Callers own the clock. */
  readonly nowMs?: number | undefined;
}

/**
 * Render one award from its id.
 *
 * This belongs in the component layer rather than in the routes because the
 * *mapping* is the shared part: which fields the layout takes, and how `active`
 * becomes either "Unlocked!" or a progress line. That is what was being copied
 * eight times.
 */
export function AwardInfoPage({ badgeId, shieldId, nowMs }: AwardInfoPageProps) {
  const reward = useRewardBadge(badgeId, { shieldId, nowMs });

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
