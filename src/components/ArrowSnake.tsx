/**
 * ArrowSnake.tsx — draws one arrow.
 *
 * Purpose:      Turn a snake's body cells into the thing the player actually sees:
 *               a rope with rounded corners and a head that points somewhere.
 * Responsibilities:
 *               - Paint the body, its shadow, and its highlight.
 *               - Paint the head in whatever shape the theme asks for.
 * Notes:        All coordinates come from `arrowGeometry`, so this file is only
 *               about *painting*. It never hardcodes a look and never branches on
 *               which theme is active — adding a theme is a data change; adding a
 *               new kind of head is one branch in `renderHead`.
 *
 *               One `<Polyline>` per snake rather than one node per cell: a
 *               7-cell body is a single draw call, and `strokeLinejoin="round"`
 *               is what turns a chain of cells into something that looks like rope.
 *
 *               Purely presentational — taps are handled by real touch targets
 *               that `BoardCanvas` overlays on the board.
 */

import { memo } from 'react';
import { Circle, G, Path, Polygon, Polyline } from 'react-native-svg';

import type { Board } from '@game';
import type { ArrowStyle, Palette } from '@theme';

import {
  buildArrowGeometry,
  offsetPoints,
  roundedHeadPath,
  toPointsAttr,
} from './arrowGeometry';

/** Which visual state an arrow is in. Only ever driven by gameplay, never identity. */
export type ArrowVisualState = 'normal' | 'blocked' | 'blocker' | 'safe';

export interface ArrowSnakeProps {
  board: Board;
  arrowIndex: number;
  cellSize: number;
  /** Board-space offset, so the drawing can be inset from the panel edge. */
  originX: number;
  originY: number;
  style: ArrowStyle;
  palette: Palette;
  visual: ArrowVisualState;
}

const LINE_CAP: Record<ArrowStyle['tail'], 'round' | 'butt' | 'square'> = {
  round: 'round',
  flat: 'butt',
  square: 'square',
  tapered: 'round',
};

/** Gameplay state wins over theme colour — a blocked arrow must always read as blocked. */
function colorFor(
  visual: ArrowVisualState,
  arrowIndex: number,
  style: ArrowStyle,
  palette: Palette,
): string {
  if (visual === 'blocked') return palette.arrowBlocked;
  if (visual === 'blocker') return palette.arrowBlocker;
  if (visual === 'safe') return palette.arrowSafe;

  const variants = palette.arrowVariants;
  if (style.colorful && variants && variants.length > 0) {
    return variants[arrowIndex % variants.length]!;
  }
  return palette.arrow;
}

function ArrowSnakeInner({
  board,
  arrowIndex,
  cellSize,
  originX,
  originY,
  style,
  palette,
  visual,
}: ArrowSnakeProps) {
  const geometry = buildArrowGeometry(board, arrowIndex, cellSize, originX, originY, style);
  const { body, tip, baseLeft, baseRight, stroke } = geometry;

  const color = colorFor(visual, arrowIndex, style, palette);
  const bodyAttr = toPointsAttr(body);
  const cap = LINE_CAP[style.tail];

  const renderHead = () => {
    switch (style.head) {
      case 'none':
        return null;

      case 'chevron':
        // An open "V" stroked in the body's weight, so it reads as part of the line.
        return (
          <Polyline
            points={toPointsAttr([baseLeft, tip, baseRight])}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );

      case 'rounded':
        return <Path d={roundedHeadPath(geometry, cellSize)} fill={color} />;

      case 'pencil':
      case 'triangle':
      default:
        return <Polygon points={toPointsAttr([tip, baseLeft, baseRight])} fill={color} />;
    }
  };

  const renderEyes = () => {
    if (!style.eyes || geometry.eyes.length === 0) return null;
    return (
      <G>
        {geometry.eyes.map((eye, i) => (
          <Circle key={`e${i}`} cx={eye.x} cy={eye.y} r={geometry.eyeRadius} fill="#FFFFFF" />
        ))}
        {geometry.pupils.map((pupil, i) => (
          <Circle
            key={`p${i}`}
            cx={pupil.x}
            cy={pupil.y}
            r={geometry.eyeRadius * 0.45}
            fill="#1A1A1A"
          />
        ))}
      </G>
    );
  };

  return (
    <G>
      {style.shadow ? (
        <Polyline
          points={toPointsAttr(offsetPoints(body, 0, cellSize * style.shadowOffsetRatio))}
          fill="none"
          stroke={palette.arrowShadow}
          strokeWidth={stroke}
          strokeLinecap={cap}
          strokeLinejoin={style.join}
        />
      ) : null}

      <Polyline
        points={bodyAttr}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap={cap}
        strokeLinejoin={style.join}
      />

      {style.highlight ? (
        <Polyline
          points={toPointsAttr(offsetPoints(body, 0, -stroke * 0.18))}
          fill="none"
          stroke={palette.arrowHighlight}
          strokeWidth={stroke * 0.24}
          strokeLinecap="round"
          strokeLinejoin={style.join}
        />
      ) : null}

      {renderHead()}
      {renderEyes()}
    </G>
  );
}

/**
 * Memoised because a board redraws on every tap, but only the tapped arrow and
 * its blocker actually change. On a dense level that is 20+ untouched snakes.
 */
export const ArrowSnake = memo(ArrowSnakeInner);
