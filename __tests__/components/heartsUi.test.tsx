/**
 * The heart count on screen must match the hearts actually left.
 *
 * The reducer's arithmetic was already covered by `heartAccounting.test.ts`, and it
 * was already correct — which is exactly why this file exists. A report that the
 * counter was stuck at five could not be explained by any of those tests, because
 * every one of them called the reducer directly and none of them went through the
 * thing a player actually touches.
 *
 * The cause was a tap that never arrived. `BoardCanvas` had been changed to run its
 * hit test inside a gesture worklet, reading occupancy from a shared array — a
 * `useCallback` carrying `'worklet'`, containing a *nested* worklet closure. When
 * that fails to workletize the gesture's handler throws, the tap does nothing at
 * all, and the symptom is indistinguishable from a broken counter: you tap a
 * blocked arrow and the hearts do not move.
 *
 * So this drives the real component with real gestures and reads the count back
 * out. It is the only test that covers the whole path — tap surface, hit test,
 * callback, reducer, rendered HUD.
 */

/*
 * `require` inside the mock factories is not a style choice: Jest hoists
 * `jest.mock` above the imports, so an imported binding is not yet initialised
 * when a factory runs.
 */
/* eslint-disable @typescript-eslint/no-require-imports, react/display-name */

import { createElement, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { buildLevel, parseAscii, type BoardState } from '@game';
import { defaultTheme } from '@theme';
import { gameReducer, initGameState, type GameState } from '@state/gameReducer';

jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const passthrough = (name: string) => (props: { children?: ReactNode }) =>
    React.createElement(name, null, props.children);
  return {
    __esModule: true,
    default: passthrough('Svg'),
    Svg: passthrough('Svg'),
    Circle: passthrough('Circle'),
    Defs: passthrough('Defs'),
    G: passthrough('G'),
    Line: passthrough('Line'),
    Path: passthrough('Path'),
    Pattern: passthrough('Pattern'),
    Polygon: passthrough('Polygon'),
    Polyline: passthrough('Polyline'),
    Rect: passthrough('Rect'),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (component: unknown) => component },
    createAnimatedComponent: (component: unknown) => component,
    runOnJS: (fn: unknown) => fn,
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    withTiming: (value: unknown) => value,
    withSequence: (value: unknown) => value,
    Easing: {
      bezier: () => undefined,
      in: () => undefined,
      out: () => undefined,
      quad: {},
      cubic: {},
      elastic: () => undefined,
    },
  };
});

/**
 * A gesture-handler stand-in that records the handlers and can fire them.
 *
 * The point is to exercise the *real* wiring: whatever `BoardCanvas` attaches to
 * `onEnd` is what this calls, with the coordinates a finger would produce. A stub
 * that called `onTapArrow` directly would pass even with the hit test broken,
 * which is the bug this file is about.
 */
const mockHandlers: { onEnd?: (event: { x: number; y: number }, success: boolean) => void } = {};

jest.mock('react-native-gesture-handler', () => {
  const React = require('react') as typeof import('react');

  const builder = {
    maxDistance: () => builder,
    maxDuration: () => builder,
    onBegin: () => builder,
    onEnd: (fn: (event: { x: number; y: number }, success: boolean) => void) => {
      mockHandlers.onEnd = fn;
      return builder;
    },
    onFinalize: () => builder,
  };

  return {
    GestureDetector: (props: { children?: ReactNode }) =>
      React.createElement('GestureDetector', null, props.children),
    Gesture: { Tap: () => builder },
  };
});

// Imported after the mocks so the components pick them up.
/* eslint-disable import/first */
import { BoardCanvas } from '@components/BoardCanvas';
import { Hud } from '@components/Hud';
/* eslint-enable import/first */

/**
 * Three snakes in a queue: only `a` can leave, `b` and `c` are blocked behind it.
 *
 * Tapping `c` is therefore always a mistake, however many times it is done — which
 * is what makes it possible to walk the hearts all the way down.
 */
const CHAIN = 'c C b B a A';

const CELL = 26;
const ORIGIN = 13;

function setup() {
  const built = buildLevel(parseAscii(CHAIN, { hearts: 5 }));
  if (!built.ok) throw new Error(built.error);
  return built.value;
}

const FIXTURE = setup();

/** Centre of a cell, in the coordinates the tap surface receives. */
function centreOf(cell: number, cols: number): { x: number; y: number } {
  return {
    x: ORIGIN + ((cell % cols) + 0.5) * CELL,
    y: ORIGIN + (Math.floor(cell / cols) + 0.5) * CELL,
  };
}

/** Reads the heart glyphs out of the rendered HUD, filled ones first. */
function heartsShown(tree: ReturnType<typeof create>): number {
  return tree.root
    .findAll((node) => node.props?.accessibilityLabel?.endsWith?.('hearts left') === true)
    .flatMap((node) => String(node.props.accessibilityLabel).match(/^(\d+) of/) ?? [])
    .map((match) => Number(match))
    .filter((value) => Number.isFinite(value))[1] as number;
}

function board(state: BoardState, onTapArrow: (index: number) => void) {
  return createElement(BoardCanvas, {
    board: FIXTURE.board,
    state,
    cellSize: CELL,
    width: 300,
    height: 100,
    originX: ORIGIN,
    originY: ORIGIN,
    palette: defaultTheme.palette,
    arrowStyle: defaultTheme.arrow,
    boardStyle: defaultTheme.board,
    onTapArrow,
  });
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

describe('the heart count a player sees', () => {
  it('counts down 5 - 4 - 3 - 2 - 1 - 0 as blocked arrows are tapped', () => {
    let game: GameState = initGameState(FIXTURE.initial, 5);

    // The whole loop, as the app runs it: the tap surface resolves a touch to an
    // arrow, that reaches the reducer, and the HUD renders the result.
    const tapArrow = (index: number) => {
      game = gameReducer(game, { type: 'tap', board: FIXTURE.board, arrowIndex: index });
    };

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(board(game.session.state, tapArrow));
    });

    expect(mockHandlers.onEnd).toBeDefined();

    // Arrow `c` (index 2) sits at the back of the queue and can never move.
    const blocked = FIXTURE.board.arrows[2]!.body[0]!;
    const point = centreOf(blocked, FIXTURE.board.cols);

    const seen: number[] = [];

    let hudTree!: ReturnType<typeof create>;
    act(() => {
      hudTree = create(hud(game.session));
    });
    seen.push(heartsShown(hudTree));

    for (let i = 0; i < 5; i += 1) {
      act(() => {
        mockHandlers.onEnd!(point, true);
      });
      act(() => {
        hudTree.update(hud(game.session));
      });
      seen.push(heartsShown(hudTree));
    }

    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
    expect(game.session.status).toBe('failed');

    act(() => tree.unmount());
    act(() => hudTree.unmount());
  });

  it('does not charge a heart for tapping an arrow that can leave', () => {
    let game: GameState = initGameState(FIXTURE.initial, 5);
    const tapArrow = (index: number) => {
      game = gameReducer(game, { type: 'tap', board: FIXTURE.board, arrowIndex: index });
    };

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(board(game.session.state, tapArrow));
    });

    // Arrow `a` (index 0) is the only one with a clear run.
    const free = FIXTURE.board.arrows[0]!.body[0]!;
    act(() => {
      mockHandlers.onEnd!(centreOf(free, FIXTURE.board.cols), true);
    });

    expect(game.session.heartsLeft).toBe(5);
    expect(game.session.state.remaining).toBe(2);
    act(() => tree.unmount());
  });

  it('resolves a tap that lands slightly off the arrow', () => {
    // The near-miss tolerance, exercised through the real hit test rather than
    // asserted about it. A tap a third of a cell away from a snake still selects it.
    let game: GameState = initGameState(FIXTURE.initial, 5);
    const tapArrow = (index: number) => {
      game = gameReducer(game, { type: 'tap', board: FIXTURE.board, arrowIndex: index });
    };

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(board(game.session.state, tapArrow));
    });

    const free = centreOf(FIXTURE.board.arrows[0]!.body[0]!, FIXTURE.board.cols);
    act(() => {
      mockHandlers.onEnd!({ x: free.x, y: free.y - CELL * 0.6 }, true);
    });

    expect(game.session.state.remaining).toBe(2);
    act(() => tree.unmount());
  });
});
