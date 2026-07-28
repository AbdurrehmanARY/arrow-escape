/**
 * Arrow drawing geometry.
 *
 * The maths that decides where an arrowhead sits is easy to get subtly wrong —
 * a head pointing the wrong way, or a triangle narrower than the body it sits on,
 * looks broken but throws no error. These tests pin the parts that must hold for
 * an arrow to read correctly at all.
 */

import { buildLevel, parseAscii, type Board } from '@game';
// Imported from the module directly, not through the `@components` barrel: the
// barrel also exports the renderer, which pulls in Reanimated and its native
// runtime. This file is about pure maths and should not need any of that.
import {
  buildArrowGeometry,
  cellCentre,
  fitCellSize,
  toPointsAttr,
} from '@components/arrowGeometry';
import { THEMES, themeById } from '@theme';

const CELL = 40;

function boardFrom(art: string): Board {
  const result = buildLevel(parseAscii(art));
  if (!result.ok) throw new Error(result.error);
  return result.value.board;
}

const classic = themeById('paper').arrow;

describe('cellCentre', () => {
  it('puts a cell centre half a cell in from its corner', () => {
    expect(cellCentre(0, 4, CELL, 0, 0)).toEqual({ x: 20, y: 20 });
    // Cell 6 on a 4-wide board is row 1, col 2.
    expect(cellCentre(6, 4, CELL, 0, 0)).toEqual({ x: 100, y: 60 });
  });

  it('respects the board origin offset', () => {
    expect(cellCentre(0, 4, CELL, 10, 5)).toEqual({ x: 30, y: 25 });
  });
});

describe('fitCellSize', () => {
  it('fits the grid plus its padding ring into the space available', () => {
    // 8 columns plus a half-cell ring on each side is 9 cells across.
    expect(fitCellSize(8, 8, 0.5, 360, 360)).toBe(40);
  });

  it('is limited by the tighter of the two dimensions', () => {
    expect(fitCellSize(8, 4, 0, 400, 160)).toBe(20);
  });
});

describe('buildArrowGeometry', () => {
  it('runs the body tail-first so the head decoration lands on top', () => {
    // Head at (0,0) pointing left, body trailing to the right.
    const board = boardFrom('A a a .');
    const g = buildArrowGeometry(board, 0, CELL, 0, 0, classic);

    expect(g.body).toHaveLength(3);
    expect(g.body[0]).toEqual({ x: 100, y: 20 }); // tail, at col 2
    expect(g.body[2]).toEqual({ x: 20, y: 20 }); // head, at col 0
  });

  it.each([
    ['left', 'A a a .', { x: -1, y: 0 }],
    ['right', '. a a A', { x: 1, y: 0 }],
  ])('points the head %s', (_label, art, expected) => {
    const board = boardFrom(art);
    const g = buildArrowGeometry(board, 0, CELL, 0, 0, classic);
    expect(g.forward).toEqual(expected);
  });

  it('points a head up when its neck is below it', () => {
    const board = boardFrom('A\na\na');
    const g = buildArrowGeometry(board, 0, CELL, 0, 0, classic);
    expect(g.forward).toEqual({ x: 0, y: -1 });
    // Tip must be above the head centre on screen.
    expect(g.tip.y).toBeLessThan(g.body[g.body.length - 1]!.y);
  });

  it('places the tip ahead of the head and the base back at the line end', () => {
    const board = boardFrom('. a a A');
    const g = buildArrowGeometry(board, 0, CELL, 0, 0, classic);
    const head = g.body[g.body.length - 1]!;

    expect(g.tip.x - head.x).toBeCloseTo(CELL * classic.headTipRatio, 5);
    // The base sits essentially where the body line ends, so the triangle meets
    // the rope rather than floating past it or being swallowed by it.
    expect(Math.abs(g.baseCentre.x - head.x)).toBeLessThan(CELL * 0.1);
  });

  it('makes the arrowhead wider than the body it sits on', () => {
    // Otherwise the head vanishes into the rope and direction becomes unreadable.
    for (const theme of THEMES) {
      if (theme.arrow.head === 'none') continue;
      const board = boardFrom('. a a A');
      const g = buildArrowGeometry(board, 0, CELL, 0, 0, theme.arrow);
      const headWidth = Math.hypot(g.baseLeft.x - g.baseRight.x, g.baseLeft.y - g.baseRight.y);
      expect(headWidth).toBeGreaterThan(g.stroke);
    }
  });

  it('puts the two shoulders on opposite sides of the base, equally far out', () => {
    const board = boardFrom('. a a A');
    const g = buildArrowGeometry(board, 0, CELL, 0, 0, classic);

    // A rightward head spreads across the y axis, so both shoulders share an x.
    expect(g.baseLeft.x).toBeCloseTo(g.baseRight.x, 5);
    expect(g.baseLeft.y).not.toBeCloseTo(g.baseRight.y, 1);

    // Mirrored about the base centre — an off-centre head reads as a bent arrow.
    expect((g.baseLeft.y + g.baseRight.y) / 2).toBeCloseTo(g.baseCentre.y, 5);
    expect(Math.abs(g.baseLeft.y - g.baseCentre.y)).toBeCloseTo(
      Math.abs(g.baseRight.y - g.baseCentre.y),
      5,
    );
  });

  it('scales every measurement with the cell size', () => {
    const board = boardFrom('. a a A');
    const small = buildArrowGeometry(board, 0, 20, 0, 0, classic);
    const large = buildArrowGeometry(board, 0, 40, 0, 0, classic);
    expect(large.stroke).toBeCloseTo(small.stroke * 2, 5);
  });

  it('omits eyes unless the theme asks for them', () => {
    const board = boardFrom('. a a A');
    expect(buildArrowGeometry(board, 0, CELL, 0, 0, classic).eyes).toEqual([]);

    const noodles = themeById('noodles');
    const withEyes = buildArrowGeometry(board, 0, CELL, 0, 0, noodles.arrow);
    expect(withEyes.eyes).toHaveLength(2);
    expect(withEyes.pupils).toHaveLength(2);
    // Eyes sit behind the tip, not out in front of it.
    expect(withEyes.eyes[0]!.x).toBeLessThan(withEyes.tip.x);
  });
});

describe('toPointsAttr', () => {
  it('formats a polyline the way SVG expects', () => {
    expect(toPointsAttr([{ x: 1.2345, y: 2 }, { x: 3, y: 4.6789 }])).toBe('1.23,2.00 3.00,4.68');
  });
});
