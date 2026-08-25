import { useStreakStore, STREAK_REWARDS } from '../../src/state/streakStore';

describe('streakStore', () => {
  beforeEach(() => {
    useStreakStore.getState().resetStreak();
  });

  it('defines 7 daily streak rewards', () => {
    expect(STREAK_REWARDS.length).toBe(7);
  });

  it('initializes on Day 1 with canClaimToday as true', () => {
    const state = useStreakStore.getState();
    expect(state.currentDay).toBe(1);
    expect(state.canClaimToday('2026-08-24')).toBe(true);
  });

  it('claims reward and advances day', () => {
    const reward = useStreakStore.getState().claimToday('2026-08-24');
    expect(reward).toBeDefined();
    expect(reward?.day).toBe(1);
    expect(reward?.arrows).toBe(50);

    const nextState = useStreakStore.getState();
    expect(nextState.currentDay).toBe(2);
    expect(nextState.canClaimToday('2026-08-24')).toBe(false);
  });

  it('prevents double claim on same day', () => {
    useStreakStore.getState().claimToday('2026-08-24');
    const secondTry = useStreakStore.getState().claimToday('2026-08-24');
    expect(secondTry).toBeNull();
  });

  it('cycles back to Day 1 after Day 7 Golden Chest', () => {
    for (let day = 1; day <= 7; day += 1) {
      const date = `2026-08-${String(20 + day).padStart(2, '0')}`;
      const reward = useStreakStore.getState().claimToday(date);
      if (day === 7) {
        expect(reward?.isGoldenChest).toBe(true);
        expect(reward?.hints).toBe(5);
        expect(reward?.arrows).toBe(500);
      }
    }
    expect(useStreakStore.getState().currentDay).toBe(1);
  });
});
