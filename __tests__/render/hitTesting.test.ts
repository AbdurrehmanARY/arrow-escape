/**
 * Taps must land on the same arrow under Skia as they did under SVG.
 *
 * This is the one genuinely dangerous part of the Skia migration. Under SVG the tap
 * surface lived *inside* the transformed view, so a touch arrived already in board
 * coordinates and no conversion existed to get wrong. A Skia matrix does not move
 * the view, so the camera transform is now inverted by hand.
 *
 * Getting it wrong does not crash and does not look broken — it selects the arrow
 * next to the one the player aimed at, which costs a heart and reads as the game
 * cheating. Two previous touch bugs in this project were found by players rather
 * than by tests, so the maths is pure and asserted here rather than trusted.
 */

import { buildLevel, parseAscii, EMPTY } from '@game';

// Imported from the pure module rather than the renderer: `SkiaBoard` pulls in
// Skia's native bindings, which Jest cannot load. That separation is the point —
// the maths is testable precisely because it does not live next to the GPU code.
import { arrowAtBoardPoint, toBoardPoint } from '../../src/render/hitTest';

const CELL = 26;
const ORIGIN = 26;
const VIEWPORT_W = 360;
const VIEWPORT_H = 640;

/** Five arrows in a row, so every index is easy to aim at. */
const BOARD = 'A a . B b . C c . D d . E e';

function setup() {
  const built = buildLevel(parseAscii(BOARD, {}));
  if (!built.ok) throw new Error(built.error);
  return built.value;
}

const FIXTURE = setup();
const CONTENT_W = (FIXTURE.board.cols + 2) * CELL;
const CONTENT_H = (FIXTURE.board.rows + 2) * CELL;

/** Board-space centre of a cell. */
function centreOf(cell: number): { x: number; y: number } {
  const cols = FIXTURE.board.cols;
  return {
    x: ORIGIN + ((cell % cols) + 0.5) * CELL,
    y: ORIGIN + (Math.floor(cell / cols) + 0.5) * CELL,
  };
}

/** Forward transform: board space -> screen space. The inverse of `toBoardPoint`. */
function toScreen(
  bx: number,
  by: number,
  translateX: number,
  translateY: number,
  scale: number,
): { x: number; y: number } {
  return {
    x: (bx - CONTENT_W / 2) * scale + VIEWPORT_W / 2 + translateX,
    y: (by - CONTENT_H / 2) * scale + VIEWPORT_H / 2 + translateY,
  };
}

describe('camera coordinate inversion', () => {
  // Every combination a player can actually produce: zoomed out, at 1:1, zoomed
  // right in, and panned in each direction.
  const cases: { scale: number; tx: number; ty: number }[] = [
    { scale: 1, tx: 0, ty: 0 },
    { scale: 0.4, tx: 0, ty: 0 },
    { scale: 2.5, tx: 0, ty: 0 },
    { scale: 1, tx: 120, ty: -80 },
    { scale: 1.75, tx: -200, ty: 140 },
    { scale: 0.6, tx: 55, ty: 55 },
  ];

  it('round-trips a screen point back to the board point it came from', () => {
    for (const { scale, tx, ty } of cases) {
      for (const cell of [0, 3, 7, 11, 14]) {
        const board = centreOf(cell);
        const screen = toScreen(board.x, board.y, tx, ty, scale);
        const back = toBoardPoint(
          screen.x,
          screen.y,
          VIEWPORT_W,
          VIEWPORT_H,
          CONTENT_W,
          CONTENT_H,
          tx,
          ty,
          scale,
        );

        expect(back.x).toBeCloseTo(board.x, 6);
        expect(back.y).toBeCloseTo(board.y, 6);
      }
    }
  });

  it('selects the same arrow at every zoom and pan the player can reach', () => {
    const { board, initial } = FIXTURE;

    for (let index = 0; index < board.arrows.length; index += 1) {
      const head = board.arrows[index]!.body[0]!;
      const target = centreOf(head);

      for (const { scale, tx, ty } of cases) {
        const screen = toScreen(target.x, target.y, tx, ty, scale);
        const point = toBoardPoint(
          screen.x,
          screen.y,
          VIEWPORT_W,
          VIEWPORT_H,
          CONTENT_W,
          CONTENT_H,
          tx,
          ty,
          scale,
        );
        const hit = arrowAtBoardPoint(
          initial,
          board,
          point.x,
          point.y,
          CELL,
          ORIGIN,
          ORIGIN,
        );

        expect(hit).toBe(index);
      }
    }
  });
});

describe('arrow hit testing', () => {
  it('forgives a near miss, exactly as the SVG renderer did', () => {
    const { board, initial } = FIXTURE;
    const head = board.arrows[0]!.body[0]!;
    const target = centreOf(head);

    // A third of a cell off still selects the arrow.
    const hit = arrowAtBoardPoint(
      initial,
      board,
      target.x,
      target.y - CELL * 0.6,
      CELL,
      ORIGIN,
      ORIGIN,
    );
    expect(hit).toBe(0);
  });

  it('selects nothing on genuinely empty board', () => {
    const { board, initial } = FIXTURE;
    // Far outside the board entirely. A too-eager hit test here would spend a
    // heart on a tap the player never aimed at anything.
    const hit = arrowAtBoardPoint(initial, board, -500, -500, CELL, ORIGIN, ORIGIN);
    expect(hit).toBe(EMPTY);
  });

  it('ignores arrows that have already left', () => {
    const { board, initial } = FIXTURE;
    const head = board.arrows[0]!.body[0]!;
    const target = centreOf(head);

    const cleared = { ...initial, alive: Uint8Array.from(initial.alive) };
    cleared.alive[0] = 0;

    const hit = arrowAtBoardPoint(cleared, board, target.x, target.y, CELL, ORIGIN, ORIGIN);
    expect(hit).not.toBe(0);
  });
});
