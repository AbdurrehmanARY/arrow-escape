/**
 * Which colour an arrow is drawn in, and why.
 *
 * `visualForArrow` is four lines and decides something a player reads on every
 * frame, so it is worth pinning precisely. It became worth *testing* when the
 * collision marks stopped being a single index and became sets that stand for the
 * rest of the level: an arrow can now be several things at once, and which one
 * wins is a gameplay decision rather than an implementation detail.
 *
 * Pure — no Skia, no React. `scene.ts` deliberately imports neither, which is what
 * makes this testable at all (decision 103).
 */

import { visualForArrow } from '@render/scene';

const none = new Set<number>();

describe('visualForArrow', () => {
  it('is normal when nothing applies', () => {
    expect(visualForArrow(0, none, none, undefined, none)).toBe('normal');
  });

  it('reads each state on its own', () => {
    expect(visualForArrow(1, new Set([1]), none, undefined, none)).toBe('blocked');
    expect(visualForArrow(2, none, new Set([2]), undefined, none)).toBe('blocker');
    expect(visualForArrow(3, none, none, 3, none)).toBe('hinted');
    expect(visualForArrow(4, none, none, undefined, new Set([4]))).toBe('safe');
  });

  it('marks every arrow in a set, not just the newest', () => {
    const blocked = new Set([2, 7, 11]);
    for (const index of blocked) {
      expect(visualForArrow(index, blocked, none, undefined, none)).toBe('blocked');
    }
    expect(visualForArrow(3, blocked, none, undefined, none)).toBe('normal');
  });

  /**
   * Precedence, stated as behaviour rather than as line order.
   *
   * Blocked beats everything because it is the most urgent thing true of an arrow
   * — the player just spent a heart on it. Hinted losing to both collision states
   * is deliberate: if the game is pointing at an arrow that also blocked you, the
   * collision is the more useful reading, and the camera move plus the shiver
   * already say which arrow the hint meant.
   */
  describe('precedence', () => {
    it('blocked beats blocker', () => {
      expect(visualForArrow(5, new Set([5]), new Set([5]), undefined, none)).toBe('blocked');
    });

    it('blocked beats hinted and safe', () => {
      expect(visualForArrow(5, new Set([5]), none, 5, new Set([5]))).toBe('blocked');
    });

    it('blocker beats hinted and safe', () => {
      expect(visualForArrow(5, none, new Set([5]), 5, new Set([5]))).toBe('blocker');
    });

    it('hinted beats safe', () => {
      expect(visualForArrow(5, none, none, 5, new Set([5]))).toBe('hinted');
    });
  });

  it('treats an absent hint as no hint, never as arrow zero', () => {
    // `undefined === 0` is false in JS, but a truthiness check would get this
    // wrong and arrow 0 is a real arrow on every board.
    expect(visualForArrow(0, none, none, undefined, none)).toBe('normal');
    expect(visualForArrow(0, none, none, 0, none)).toBe('hinted');
  });
});
