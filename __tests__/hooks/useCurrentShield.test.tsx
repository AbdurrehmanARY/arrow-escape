/**
 * `useCurrentShield` — the one place that answers "which shield is this?".
 *
 * This hook replaced the same three-step chain written out by hand in three
 * places (`app/(tabs)/index.tsx`, `useLeagueBoard`, `challenge/rewards.ts`). What
 * needed protecting is not the arithmetic — `league.test.ts` already covers the
 * league table — but the *representation*: a player who played nothing this week
 * must get `shield: undefined`, not Bronze. `leagueForArrows(0)` returns Bronze, so
 * the difference between a correct implementation and a plausible one is a single
 * comparison, and getting it wrong hands every new player a shield nobody won.
 *
 * The week boundary is the second one. A shield belongs to the week it was earned
 * in, so last week's arrows must not carry it into this week — otherwise every
 * player who has ever played would hold one forever.
 */

import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { LEAGUES, leagueForArrows, weekOf } from '@league';
import { useChallengeStore, useLeagueStore } from '@state';

import { useCurrentShield } from '../../src/hooks/useCurrentShield';

/** A known instant: Wednesday 5 August 2026, 12:00 UTC — mid-week, mid-cycle. */
const WEDNESDAY = Date.UTC(2026, 7, 5, 12, 0, 0);
const WEEK_ID = weekOf(WEDNESDAY).id;
const ONE_WEEK = 7 * 86_400_000;

let renderer: ReactTestRenderer | undefined;

/** The hook's answer, flattened to what the assertions actually read. */
interface ShieldProbe {
  readonly shieldId: string | undefined;
  readonly score: number;
  readonly weekId: string;
  readonly hasShield: boolean;
}

/**
 * Renders the hook's result as host props so it can be read back off the tree.
 *
 * Notes: An earlier version stashed the result in a module-level variable from
 * inside the component body. That is a render-phase side effect on shared state,
 * it is why the linter rejects it, and it would have made two concurrently
 * mounted probes read each other's answer.
 */
function Probe({ atMs }: { atMs: number }) {
  const shield = useCurrentShield(atMs);
  return createElement('shield', {
    shieldId: shield.shield?.id,
    score: shield.score,
    weekId: shield.weekId,
    hasShield: shield.hasShield,
  });
}

/** Mount the hook at `atMs` and hand back what it returned. */
function shieldAt(atMs: number): ShieldProbe {
  act(() => {
    renderer?.unmount();
    renderer = create(createElement(Probe, { atMs }));
  });
  return (renderer!.toJSON() as unknown as { props: ShieldProbe }).props;
}

function withArrows(arrows: number, atMs = WEDNESDAY): void {
  useLeagueStore.setState({ weeks: { [weekOf(atMs).id]: arrows }, counted: [] });
}

beforeEach(() => {
  useLeagueStore.setState({ weeks: {}, counted: [] });
  useChallengeStore.setState({ records: {} });
});

afterEach(() => {
  act(() => {
    renderer?.unmount();
  });
  renderer = undefined;
});

describe('holding no shield', () => {
  it('is representable, and is not Bronze', () => {
    const shield = shieldAt(WEDNESDAY);
    expect(shield.hasShield).toBe(false);
    expect(shield.shieldId).toBeUndefined();
  });

  it('still reports the score and the week, so no caller rebuilds the chain', () => {
    const shield = shieldAt(WEDNESDAY);
    expect(shield.score).toBe(0);
    expect(shield.weekId).toBe(WEEK_ID);
  });

  it('does not inherit last week, because the race resets on Monday', () => {
    useLeagueStore.setState({ weeks: { [weekOf(WEDNESDAY - ONE_WEEK).id]: 9000 } });
    expect(shieldAt(WEDNESDAY).shieldId).toBeUndefined();
  });

  it('counts a challenge win toward the score without creating a shield', () => {
    // Lifetime wins raise the score — and therefore the tier — but a shield is won
    // in the weekly race. A player with a perfect record and nothing played *this
    // week* is a high-scoring player holding nothing.
    useChallengeStore.setState({
      records: {
        '2026-08-04': {
          id: '2026-08-04',
          levelId: 1,
          tier: 'hard',
          outcome: 'won',
          timeMs: 1000,
          moves: 5,
          heartsLeft: 5,
          hintsUsed: 0,
          completedAt: 0,
          syncedAt: null,
        },
      },
    });
    const shield = shieldAt(WEDNESDAY);
    expect(shield.score).toBeGreaterThan(0);
    expect(shield.hasShield).toBe(false);
    expect(shield.shieldId).toBeUndefined();
  });
});

describe('holding a shield', () => {
  it('is Bronze from a single arrow', () => {
    withArrows(1);
    expect(shieldAt(WEDNESDAY).shieldId).toBe('bronze');
  });

  it('is placed by the highest threshold this week reached', () => {
    withArrows(500);
    const shield = shieldAt(WEDNESDAY);
    expect(shield.hasShield).toBe(true);
    expect(shield.shieldId).toBe('silver');
  });

  it('reaches the top of the ladder', () => {
    withArrows(99_999);
    expect(shieldAt(WEDNESDAY).shieldId).toBe(LEAGUES[LEAGUES.length - 1]!.id);
  });

  it('agrees with the domain, rather than restating it', () => {
    // The hook must not carry its own thresholds. Hard-coding `gold` here would
    // pass even if the hook disagreed with the ladder, so it is compared against
    // `leagueForArrows` — the one function allowed to answer this question.
    withArrows(1234);
    expect(shieldAt(WEDNESDAY).shieldId).toBe(leagueForArrows(1234).id);
  });
});

describe('the instant it is given', () => {
  it('decides which week is on screen', () => {
    withArrows(500);
    expect(shieldAt(WEDNESDAY).shieldId).toBe('silver');
    // Same stored arrows, the following Monday: a new week, so nothing held.
    expect(shieldAt(WEDNESDAY + ONE_WEEK).shieldId).toBeUndefined();
  });

  it('reports the week id it resolved', () => {
    expect(shieldAt(WEDNESDAY + ONE_WEEK).weekId).not.toBe(WEEK_ID);
  });
});