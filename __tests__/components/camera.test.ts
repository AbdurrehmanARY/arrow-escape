/**
 * Pan and zoom limits.
 *
 * This is the maths that decides whether a 27x30 board can be flicked off into
 * empty space and lost. It runs as a worklet on the UI thread during a gesture,
 * where a debugger is not much use, so it is worth pinning here instead.
 *
 * The board sizes below are real: 810 cells at 26dp is what an Extreme level
 * actually produces.
 */

import { clampScale, clampTranslation, fitScale } from '@components/camera';

/** A phone-sized viewport, and an Extreme board drawn at the minimum cell size. */
const VIEWPORT = { width: 360, height: 520 };
const BIG_BOARD = { width: 27 * 26, height: 30 * 26 }; // 702 x 780

describe('fitScale', () => {
  it('shrinks a board until the whole thing is visible', () => {
    const scale = fitScale(BIG_BOARD.width, BIG_BOARD.height, VIEWPORT.width, VIEWPORT.height);
    expect(BIG_BOARD.width * scale).toBeLessThanOrEqual(VIEWPORT.width + 0.001);
    expect(BIG_BOARD.height * scale).toBeLessThanOrEqual(VIEWPORT.height + 0.001);
  });

  it('is limited by whichever axis is tighter', () => {
    // Wide content in a narrow viewport must fit by width, not height.
    expect(fitScale(1000, 100, 500, 500)).toBeCloseTo(0.5, 5);
    expect(fitScale(100, 1000, 500, 500)).toBeCloseTo(0.5, 5);
  });

  it('never enlarges a small board past its designed size', () => {
    // Cells have a designed size; a 8x8 level stretched across a tablet looks
    // like a bug, not a feature.
    expect(fitScale(200, 200, 1000, 1000)).toBe(1);
  });

  it('survives a zero-sized board rather than dividing by nothing', () => {
    expect(fitScale(0, 0, 360, 520)).toBe(1);
    expect(Number.isFinite(fitScale(0, 100, 360, 520))).toBe(true);
  });
});

describe('clampScale', () => {
  const fit = 0.5;

  it('refuses to zoom out past fit-to-screen', () => {
    expect(clampScale(0.1, fit, 3.5)).toBe(fit);
    expect(clampScale(fit, fit, 3.5)).toBe(fit);
  });

  it('caps zoom at the configured maximum', () => {
    expect(clampScale(99, fit, 3.5)).toBeCloseTo(fit * 3.5, 5);
  });

  it('leaves a scale inside the range alone', () => {
    expect(clampScale(1.2, fit, 3.5)).toBe(1.2);
  });
});

describe('clampTranslation', () => {
  it('pins a board smaller than the viewport dead centre', () => {
    // Otherwise a small board could be dragged off into blank space, and the
    // player would have to hunt for it.
    for (const attempt of [-500, -1, 0, 1, 500]) {
      expect(clampTranslation(attempt, 200, 360, 1)).toBe(0);
    }
  });

  it('allows exactly the overhang when the board is larger', () => {
    // 700 wide in a 360 viewport overhangs by 340, so 170 either side of centre.
    expect(clampTranslation(0, 700, 360, 1)).toBe(0);
    expect(clampTranslation(170, 700, 360, 1)).toBe(170);
    expect(clampTranslation(-170, 700, 360, 1)).toBe(-170);
  });

  it('refuses to move past the overhang in either direction', () => {
    expect(clampTranslation(9999, 700, 360, 1)).toBe(170);
    expect(clampTranslation(-9999, 700, 360, 1)).toBe(-170);
  });

  it('accounts for scale, not just raw content size', () => {
    // The same board zoomed in overhangs further, so it may travel further.
    const zoomedOut = clampTranslation(9999, 700, 360, 0.5);
    const zoomedIn = clampTranslation(9999, 700, 360, 2);
    expect(zoomedOut).toBe(0); // 350 wide fits inside 360
    expect(zoomedIn).toBeGreaterThan(zoomedOut);
    expect(zoomedIn).toBeCloseTo((700 * 2 - 360) / 2, 5);
  });

  it('never lets an edge of the board leave the viewport', () => {
    // The invariant that matters: at the extreme of travel, the board's edge
    // lands exactly on the viewport edge -- never inside it.
    for (const scale of [0.6, 1, 1.7, 3]) {
      for (const size of [BIG_BOARD.width, BIG_BOARD.height]) {
        const viewport = size === BIG_BOARD.width ? VIEWPORT.width : VIEWPORT.height;
        const offset = clampTranslation(1e6, size, viewport, scale);
        const scaled = size * scale;

        if (scaled <= viewport) {
          expect(offset).toBe(0);
        } else {
          // Left edge of content, relative to the viewport's left edge.
          const contentLeft = viewport / 2 - scaled / 2 + offset;
          expect(contentLeft).toBeCloseTo(0, 5);
        }
      }
    }
  });

  it('keeps a real Extreme board reachable in both corners', () => {
    const scale = 1;
    const maxX = clampTranslation(1e6, BIG_BOARD.width, VIEWPORT.width, scale);
    const minX = clampTranslation(-1e6, BIG_BOARD.width, VIEWPORT.width, scale);
    const maxY = clampTranslation(1e6, BIG_BOARD.height, VIEWPORT.height, scale);
    const minY = clampTranslation(-1e6, BIG_BOARD.height, VIEWPORT.height, scale);

    // Travel must cover the whole overhang, or part of the board is unreachable
    // and a level becomes unplayable.
    expect(maxX - minX).toBeCloseTo(BIG_BOARD.width - VIEWPORT.width, 5);
    expect(maxY - minY).toBeCloseTo(BIG_BOARD.height - VIEWPORT.height, 5);
  });
});
