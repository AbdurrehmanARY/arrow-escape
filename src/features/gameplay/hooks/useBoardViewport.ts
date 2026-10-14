/**
 * features/gameplay/hooks/useBoardViewport.ts — how much of the screen the board is allowed.
 *
 * Purpose:      Turn the window, the safe-area insets and the fixed chrome into
 *               the viewport the board is fitted into, fit the board into it, and
 *               choose the scale it opens at.
 * Responsibilities:
 *               - Own `CHROME_HEIGHT` and `MIN_CELL_SIZE`.
 *               - Size the viewport, including the 600dp cap on `width`.
 *               - Lay the board out with `computeBoardLayout`.
 *               - Produce `computedInitialScale` for the tier.
 * Notes:        The layout is measured once and must not change mid-level: a board
 *               that shifts under a finger turns a correct read into a mis-tap, and
 *               the player will blame themselves. Nothing here fetches, and no
 *               effect runs — it is arithmetic over values the caller already has,
 *               so moving it out of the screen cannot have changed when a board is
 *               laid out. Extracted verbatim from what is now
 *               `features/gameplay/screens/PlayScreen.tsx`.
 */

import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { computeBoardLayout, initialScaleForTier } from '@render';
import type { BuiltLevel, DifficultyTier, Result } from '@game';
import { bannerHeight } from '@services/ads';

/**
 * Chrome above and below the board that the board must not overlap.
 *
 * Raised from 210, and it was measurably too small: the pan-hint row under the
 * board was being covered by the Restart/Hint buttons, leaving a sliver of text
 * visible between them. The board is fitted into whatever is left after this, so
 * an under-estimate does not shrink the chrome — it pushes the board on top of it.
 *
 * The safe-area inset is added separately from this constant, because it is a
 * property of the device rather than of the layout.
 */
const CHROME_HEIGHT = 64;

/**
 * Smallest a cell may be drawn.
 *
 * Below roughly this an arrowhead stops being readable and a tap stops being
 * reliable, so an oversized board is drawn at this size and panned rather than
 * squeezed onto the screen. It is the number that turns "the board does not fit"
 * from a rendering problem into a gameplay feature.
 *
 * **Raised from 26 to make arrows bigger while panning**, and it is worth writing
 * down why this works, because at first glance it should not: making cells larger
 * also lowers `fitScale` by the same proportion, so a board that fits the screen
 * looks identical either way. A 10x10 level went from 27dp cells at 1.0x to 34dp
 * cells at 0.80x — the same 27dp on glass. Nothing changes for small boards.
 *
 * What breaks the symmetry is the **absolute floor** in `initialScaleForTier`:
 * exploration tiers start at `max(fitScale * 3, 0.9)`, and on a large board the
 * 0.9 wins. That floor is in scale units, not board units, so a bigger cell passes
 * straight through it. On a 50x54 board an arrow cell goes from 26 x 0.9 = 23dp to
 * 34 x 0.9 = 31dp — about a third larger, and the board needs about a third more
 * panning to cross, which is the intent.
 *
 * The cost is that fully zoomed out shows a smaller overview. That is the trade:
 * legibility while exploring, against the value of the bird's-eye view.
 */
const MIN_CELL_SIZE = 34;

/** Everything `useBoardViewport` needs to frame one level. */
export interface UseBoardViewportArgs {
  /** The built level, or `undefined` while it is loading or has failed to build. */
  readonly built: Result<BuiltLevel> | undefined;
  /** Cells of margin the theme draws around the board — `boardStyle.padCells`. */
  readonly padCells: number;
  /** Read from the encoded pack rather than the decoded level: tier is metadata. */
  readonly tier: DifficultyTier;
}

/** The room the board has, and where it sits in that room. */
export interface BoardViewport {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly layout: ReturnType<typeof computeBoardLayout>;
  /** The scale the board mounts at, before any pinch or fit-snap. */
  readonly computedInitialScale: number;
}

/**
 * Sizes the viewport, lays the board into it, and picks the opening scale.
 *
 * Returns new objects for `layout` each time its inputs change, but the hooks
 * behind the numbers are plain — no shared values, so nothing here has an
 * identity the render layer has to hold on to.
 */
export function useBoardViewport({
  built,
  padCells,
  tier,
}: UseBoardViewportArgs): BoardViewport {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const viewportWidth = Math.min(width, 600);
  const availableVertical = Math.max(
    220,
    height - insets.top - insets.bottom - bannerHeight(),
  );
  const viewportHeight = Math.max(220, availableVertical - CHROME_HEIGHT);

  const layout = useMemo(
    () =>
      built?.ok
        ? computeBoardLayout(
          built.value.board.rows,
          built.value.board.cols,
          padCells,
          viewportWidth,
          viewportHeight,
          MIN_CELL_SIZE,
        )
        : computeBoardLayout(8, 8, padCells, viewportWidth, viewportHeight, MIN_CELL_SIZE),
    [built, padCells, viewportWidth, viewportHeight],
  );

  const computedInitialScale = useMemo(
    () => {
      const fit = Math.min(
        viewportWidth / layout.width,
        viewportHeight / layout.height,
        1,
      );
      return initialScaleForTier(tier, fit, layout.cellSize);
    },
    [tier, layout.width, layout.height, layout.cellSize, viewportWidth, viewportHeight],
  );

  return { viewportWidth, viewportHeight, layout, computedInitialScale };
}
