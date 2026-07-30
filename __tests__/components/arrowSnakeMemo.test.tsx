/**
 * The board must not re-render every snake on every tap.
 *
 * This exists because of a failure mode with no symptoms. `ArrowSnake` is memoised
 * so that tapping one arrow redraws that arrow and its blocker, not the other
 * ninety — but a memo only works if every prop is referentially stable, and when
 * one is not, nothing anywhere reports it. The component still renders correctly.
 * It is merely several times slower, on exactly the boards that can least afford
 * it.
 *
 * It had in fact been broken since the touch rewrite: `BoardCanvas` passed
 * `onDepartComplete={() => onDepartComplete(index)}`, a fresh closure per arrow per
 * render, so the memo compared unequal for all of them and did nothing at all.
 *
 * So this test counts renders. It is the only test in the project that measures a
 * performance property rather than a correctness one, and it is here because that
 * property is invisible to every other kind of check.
 */

/*
 * `require` inside the mock factories is not a style choice: Jest hoists
 * `jest.mock` above the imports, so an imported binding is not yet initialised when
 * a factory runs. The stub components are anonymous because they are throwaway
 * passthroughs that never appear in any UI or stack a person will read.
 */
/* eslint-disable @typescript-eslint/no-require-imports, react/display-name */

import { createElement, type ReactNode } from 'react';
import { act, create } from 'react-test-renderer';

import { buildLevel, parseAscii, resolveTap, applyOutcome, type BoardState } from '@game';
import { defaultTheme } from '@theme';

// `BoardCanvas` renders SVG and gesture-handler; both are stubbed rather than run,
// because what is being measured is React's reconciliation, not drawing.
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

// Reanimated reaches for a native worklets module on import. Only the four hooks
// the board and the viewport actually call are needed, and none of them has to do
// anything: no animation runs in this test, only reconciliation.
jest.mock('react-native-reanimated', () => {
  const React = require('react') as typeof import('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (component: unknown) => component },
    createAnimatedComponent: (component: unknown) => component,
    runOnJS: (fn: unknown) => fn,
    // Must be stable across renders, like the real hook. A fresh object each call
    // would change the `pressedArrow` prop identity every render and fail the memo
    // for reasons that live only in this file.
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
    useAnimatedStyle: () => ({}),
    useAnimatedProps: () => ({}),
    useAnimatedReaction: () => undefined,
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
    View: (props: { children?: ReactNode }) => React.createElement('View', null, props.children),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const React = require('react') as typeof import('react');
  const chainable: Record<string, unknown> = {};
  for (const key of ['maxDistance', 'maxDuration', 'onBegin', 'onEnd', 'onFinalize']) {
    chainable[key] = () => chainable;
  }
  return {
    GestureDetector: (props: { children?: ReactNode }) =>
      React.createElement('GestureDetector', null, props.children),
    Gesture: { Tap: () => chainable },
  };
});

/**
 * How many times each arrow index has rendered.
 *
 * Module-level so the mock factory below can reach it. Jest only permits that for
 * names beginning `mock`, hence the prefix on what is otherwise just a counter.
 */
const mockRenders = new Map<number, number>();

/**
 * Stands in for `ArrowSnake`, counting renders.
 *
 * Wrapped in `memo` with the default shallow comparison — the same guard the real
 * component uses — so what is being tested is the *props the board passes*, which
 * is where the regression was. It draws nothing, because what happens inside an
 * arrow is not the subject.
 */
jest.mock('@components/ArrowSnake', () => {
  const React = require('react') as typeof import('react');

  const Counting = React.memo(function Counting({ arrowIndex }: { arrowIndex: number }) {
    mockRenders.set(arrowIndex, (mockRenders.get(arrowIndex) ?? 0) + 1);
    return null;
  });

  return { ArrowSnake: Counting };
});

// Imported after the mocks so `BoardCanvas` picks up the counting component.
// eslint-disable-next-line import/first
import { BoardCanvas } from '@components/BoardCanvas';

/** Five arrows in a row; only the leftmost can leave, so taps are deterministic. */
const BOARD = 'A a . B b . C c . D d . E e';

function setup() {
  const built = buildLevel(parseAscii(BOARD, {}));
  if (!built.ok) throw new Error(built.error);
  return built.value;
}

// Built once. Rebuilding it per render would hand every arrow a new `board` prop,
// which defeats the memo legitimately — the play screen holds it in a `useMemo`
// keyed on the level for exactly this reason.
const FIXTURE = setup();

/**
 * The board as the play screen renders it, with one thing varying at a time.
 *
 * `departingArrows` is passed because the real screen does: an arrow that has left
 * `state` keeps drawing until its animation finishes, so it stays mounted and is
 * expected to redraw. Omitting it would unmount the arrow and the test would be
 * measuring something else entirely.
 */
function render(
  state: BoardState,
  onDepartComplete: (index: number) => void,
  departingArrows: readonly number[] = [],
) {
  return createElement(BoardCanvas, {
    board: FIXTURE.board,
    state,
    cellSize: 26,
    width: 400,
    height: 200,
    originX: 13,
    originY: 13,
    palette: defaultTheme.palette,
    arrowStyle: defaultTheme.arrow,
    boardStyle: defaultTheme.board,
    departingArrows,
    onTapArrow: () => undefined,
    onDepartComplete,
  });
}

/**
 * Which arrow indices rendered again between the two snapshots.
 *
 * Compared as counts rather than presence, because every arrow renders once on
 * mount and the question is only which ones render a *second* time.
 */
function renderedAgainSince(before: Map<number, number>): number[] {
  return [...mockRenders.entries()]
    .filter(([index, count]) => count > (before.get(index) ?? 0))
    .map(([index]) => index)
    .sort((a, b) => a - b);
}

describe('BoardCanvas re-render behaviour', () => {
  beforeEach(() => mockRenders.clear());

  it('redraws only the arrows whose props changed when one leaves', () => {
    const { board, initial } = FIXTURE;
    // Stable, exactly as the play screen passes it. An inline arrow here is the
    // regression this test exists to catch.
    const onDepartComplete = () => undefined;

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(render(initial, onDepartComplete));
    });

    const first = new Map(mockRenders);
    expect(first.size).toBe(5);

    // Arrow 0 leaves. Its own props change — it becomes `departing` and drops out
    // of `state` — so it must redraw. The other four are untouched, and on a real
    // 90-snake board they are the reason this matters.
    const after = applyOutcome(initial, resolveTap(board, initial, 0));
    act(() => {
      tree.update(render(after, onDepartComplete, [0]));
    });

    expect(renderedAgainSince(first)).toEqual([0]);
    act(() => tree.unmount());
  });

  it('redraws every arrow when the depart callback is not stable', () => {
    // The negative control, and the thing that makes the test above mean something.
    // Without it, that test would still pass with the memo deleted entirely — it
    // would only be demonstrating that React skips work it was never given.
    //
    // This is the exact shape of the regression: a fresh closure per render.
    const { board, initial } = FIXTURE;

    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(render(initial, () => undefined));
    });
    const first = new Map(mockRenders);

    const after = applyOutcome(initial, resolveTap(board, initial, 0));
    act(() => {
      tree.update(render(after, () => undefined, [0]));
    });

    expect(renderedAgainSince(first)).toEqual([0, 1, 2, 3, 4]);
    act(() => tree.unmount());
  });
});
