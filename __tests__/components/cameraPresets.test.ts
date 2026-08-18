/**
 * The starting zoom, and the one rule that overrides every tier.
 *
 * `initialScaleForTier` decides what a player sees in the first second of a
 * level, which makes it a difficulty knob wearing a camera's clothes. Worth
 * pinning because the interesting behaviour is a *conflict*: three tiers ask to
 * fit the whole board, and a readability floor is allowed to overrule all of
 * them.
 *
 * Pure arithmetic — no React, no Skia, no device.
 *
 * Imported by direct path rather than through '@components'. The barrel now
 * re-exports `Pressable.tsx`, which pulls in Reanimated and worklets, neither of
 * which loads under Jest — so importing one pure function through it would drag
 * the whole animation stack in behind it.
 */

import { initialScaleForTier } from '../../src/components/cameraPresets';

/** A board small enough that fitting it leaves cells comfortably readable. */
const COMFORTABLE_CELL = 40;
/** A cell size where fitting the whole board would render it unreadably small. */
const TIGHT_CELL = 34;

describe('initialScaleForTier', () => {
  describe('without a cell size', () => {
    it('fits the easy tiers exactly, as it always did', () => {
      expect(initialScaleForTier('tutorial', 0.8)).toBe(0.8);
      expect(initialScaleForTier('casual', 0.5)).toBe(0.5);
      expect(initialScaleForTier('tricky', 1)).toBe(1);
    });

    it('snugs Hard in a little', () => {
      expect(initialScaleForTier('hard', 0.5)).toBeCloseTo(0.6);
    });

    it('starts the big tiers zoomed in, with an absolute floor', () => {
      // A 50x50 board fits at ~0.2; 3x that is 0.6, but the floor wins.
      expect(initialScaleForTier('nightmare', 0.2)).toBe(0.9);
      // Where 3x clears the floor, 3x is used.
      expect(initialScaleForTier('brutal', 0.5)).toBeCloseTo(1.5);
    });
  });

  /**
   * The floor is the fix for a real complaint: a 23x25 Casual level fitted to a
   * phone rendered roughly 12dp cells. Casual is meant to be *easy*, and an
   * arrowhead that small is a smudge.
   */
  describe('with a cell size, the readability floor applies', () => {
    it('leaves a comfortable board exactly as it was', () => {
      // 0.8 x 40dp = 32dp on glass, already well above the floor.
      expect(initialScaleForTier('casual', 0.8, COMFORTABLE_CELL)).toBe(0.8);
    });

    it('overrules a fit tier when fitting would be unreadable', () => {
      // 0.35 x 34dp = 11.9dp on glass — the reported case.
      const scale = initialScaleForTier('casual', 0.35, TIGHT_CELL);
      expect(scale).toBeGreaterThan(0.35);
      expect(scale * TIGHT_CELL).toBeGreaterThanOrEqual(22);
    });

    it('applies to Hard as well, on top of its snug multiplier', () => {
      const scale = initialScaleForTier('hard', 0.3, TIGHT_CELL);
      expect(scale * TIGHT_CELL).toBeGreaterThanOrEqual(22);
    });

    /**
     * The trade, stated as a test: past the floor the board no longer fits, and
     * that is the intended outcome rather than a regression. A board you must
     * pan is mildly annoying; a board you cannot read is not playable.
     */
    it('accepts that a floored board stops fitting', () => {
      const fit = 0.35;
      const scale = initialScaleForTier('casual', fit, TIGHT_CELL);
      expect(scale).toBeGreaterThan(fit);
    });

    it('never zooms *out* to reach the floor', () => {
      // A board already larger than the floor requires must not be shrunk to it.
      expect(initialScaleForTier('casual', 2, TIGHT_CELL)).toBe(2);
    });

    it('ignores a nonsense cell size rather than dividing by zero', () => {
      expect(initialScaleForTier('casual', 0.5, 0)).toBe(0.5);
      expect(Number.isFinite(initialScaleForTier('casual', 0.5, 0))).toBe(true);
    });
  });
});
