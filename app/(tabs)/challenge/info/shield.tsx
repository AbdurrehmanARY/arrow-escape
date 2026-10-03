/**
 * app/(tabs)/challenge/info/shield.tsx — the shield award's info screen.
 *
 * Purpose:      Render the fifth award, `shield`, exactly as the other eight do.
 * Notes:        **The shield id is read here rather than passed in as a query
 *               param.** It used to arrive as `?shieldId=…`, which meant a player
 *               who opened the route by hand — or followed a link minted before a
 *               league change — saw a shield that was not the one they hold.
 *               `useCurrentShield` is the single source of truth for "which shield
 *               is this", so the route asks it the same question every other
 *               surface asks and there is no second path to get wrong.
 */

import { useState } from 'react';

import { AwardInfoPage } from '@components';

import { useCurrentShield } from '../../../../src/hooks/useCurrentShield';

export default function ShieldInfoScreen() {
  // Mount-stable instant, matching every other caller — a re-render must not be
  // able to redraw this page against a different week than the one it opened on.
  const [nowMs] = useState(() => Date.now());
  const { shield } = useCurrentShield(nowMs);

  return <AwardInfoPage badgeId="shield" shieldId={shield?.id} nowMs={nowMs} />;
}