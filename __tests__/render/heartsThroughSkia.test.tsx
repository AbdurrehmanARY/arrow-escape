/**
 * A tap that misses still has to cost exactly one heart, under Skia.
 *
 * This replaces `heartsUi.test.tsx`, which drove the SVG board's real gesture
 * surface and asserted the count fell 5-4-3-2-1-0. That test cannot survive the
 * migration: a Skia canvas draws pixels and exposes no element tree, so there is
 * nothing for a renderer test to query and no way to fire its gestures in Jest.
 *
 * **What is covered here, and what is not**, stated plainly because the difference
 * matters. Covered: a screen-space touch converted through the real camera maths,
 * resolved to an arrow by the real hit test, fed through the real reducer, and
 * rendered by the real HUD. Not covered: the gesture handler wiring itself — the
 * `onEnd` -> `runOnJS` hop that `heartsUi` exercised.
 *
 * That gap is the honest cost of moving to a canvas. It is narrowed by the fact
 * that the wiring is now four lines with no conditional logic, and by
 * `hitTesting.test.ts` proving the conversion those four lines depend on.
 *
 * The bug this guards against is worth restating: the reducer's arithmetic was
 * never wrong. A tap that never arrived looked exactly like a frozen counter.
 */

/* eslint-disable @typescript-eslint/no-require-imports */

import { createElement, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { buildLevel, parseAscii, EMPTY } from '@game';
import { defaultTheme } from '@theme';
import { gameReducer, initGameState, type GameState } from '@state/gameReducer';

import { arrowAtBoardPoint, toBoardPoint } from '../../src/render/hitTest';

jest.mock('react-native-reanimated', () => {
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (c: unknown) => c },
    createAnimatedComponent: (c: unknown) => c,
    runOnJS: (fn: unknown) => fn,
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useDerivedValue: () => ({ value: 0 }),
    withTiming: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    Easing: {
      bezier: () => undefined,
      in: () => undefined,
      out: () => undefined,
      inOut: () => undefined,
      ease: {},
      quad: {},
      cubic: {},
      elastic: () => undefined,
    },
    View: (props: { children?: ReactNode }) => React.createElement('View', null, props.children),
  };
});

// eslint-disable-next-line import/first
import { Hud } from '@components/Hud';

/** Three snakes queued up: only `a` can leave, so tapping `c` is always a mistake. */
const CHAIN = 'c C b B a A';

const CELL = 26;
const ORIGIN = 26;
const VIEWPORT_W = 360;
const VIEWPORT_H = 640;

function setup() {
  const built = buildLevel(parseAscii(CHAIN, { hearts: 5 }));
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

/** Board space -> screen space, so the test can tap where a finger would. */
function toScreen(bx: number, by: number, scale: number): { x: number; y: number } {
  return {
    x: (bx - CONTENT_W / 2) * scale + VIEWPORT_W / 2,
    y: (by - CONTENT_H / 2) * scale + VIEWPORT_H / 2,
  };
}

/** The whole chain the app runs, minus the gesture handler itself. */
function tapAtScreen(game: GameState, sx: number, sy: number, scale: number): GameState {
  const point = toBoardPoint(sx, sy, VIEWPORT_W, VIEWPORT_H, CONTENT_W, CONTENT_H, 0, 0, scale);
  const index = arrowAtBoardPoint(
    game.session.state,
    FIXTURE.board,
    point.x,
    point.y,
    CELL,
    ORIGIN,
    ORIGIN,
  );
  if (index === EMPTY) return game;
  return gameReducer(game, { type: 'tap', board: FIXTURE.board, arrowIndex: index });
}

function hud(session: GameState['session']) {
  return createElement(Hud, {
    palette: defaultTheme.palette,
    levelName: 'Test',
    levelNumber: 1,
    tierLabel: 'Easy',
    heartsLeft: session.heartsLeft,
    maxHearts: session.maxHearts,
    arrowsLeft: session.state.remaining,
    arrowsTotal: 3,
    onPause: () => undefined,
  });
}

/** Reads the heart count back out of the rendered HUD. */
function heartsShown(tree: ReturnType<typeof create>): number {
  return tree.root
    .findAll((node) => node.props?.accessibilityLabel?.endsWith?.('hearts left') === true)
    .flatMap((node) => String(node.props.accessibilityLabel).match(/^(\d+) of/) ?? [])
    .map(Number)
    .filter((v) => Number.isFinite(v))[1] as number;
}

describe('hearts, through the Skia hit-test path', () => {
  it('counts down 5-4-3-2-1-0 as a blocked arrow is tapped', () => {
    let game: GameState = initGameState(FIXTURE.initial, 5);

    // `c` (index 2) sits at the back of the queue and can never move.
    const blocked = FIXTURE.board.arrows[2]!.body[0]!;
    const target = centreOf(blocked);
    const screen = toScreen(target.x, target.y, 1);

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(hud(game.session));
    });

    const seen: number[] = [heartsShown(tree)];
    for (let i = 0; i < 5; i += 1) {
      game = tapAtScreen(game, screen.x, screen.y, 1);
      act(() => tree.update(hud(game.session)));
      seen.push(heartsShown(tree));
    }

    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
    expect(game.session.status).toBe('failed');
    act(() => tree.unmount());
  });

  it('costs nothing when the tapped arrow can actually leave', () => {
    let game: GameState = initGameState(FIXTURE.initial, 5);
    const free = FIXTURE.board.arrows[0]!.body[0]!;
    const target = centreOf(free);
    const screen = toScreen(target.x, target.y, 1);

    game = tapAtScreen(game, screen.x, screen.y, 1);

    expect(game.session.heartsLeft).toBe(5);
    expect(game.session.state.remaining).toBe(2);
  });

  it('charges exactly one heart per tap at every zoom level', () => {
    // The migration's real risk: a mis-converted touch selects a *different* arrow,
    // which still costs a heart and so looks identical to working correctly until
    // the player notices the wrong snake reacting.
    for (const scale of [0.4, 1, 1.75, 2.5]) {
      let game: GameState = initGameState(FIXTURE.initial, 5);
      const blocked = FIXTURE.board.arrows[2]!.body[0]!;
      const target = centreOf(blocked);
      const screen = toScreen(target.x, target.y, scale);

      game = tapAtScreen(game, screen.x, screen.y, scale);

      expect(game.session.heartsLeft).toBe(4);
      // And it was the arrow actually aimed at that reacted.
      expect(game.highlight?.blocked).toBe(2);
    }
  });
});
