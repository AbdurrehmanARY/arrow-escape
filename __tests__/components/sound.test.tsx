/**
 * The sound glue, which now sits under every button in the app.
 *
 * Worth testing precisely *because* it is invisible: `withClick` wraps handlers in
 * six shared components, so a mistake here is not one broken button, it is every
 * button — and the failure mode is silence, which no other test would notice.
 *
 * Two properties matter more than the rest and are asserted directly:
 *
 * - **Order.** The sound is played before the handler runs. Handlers navigate, and
 *   a sound queued after a navigation may be running in an unmounted tree.
 * - **Edges, not levels.** `useSheetSound` fires on a change of visibility and
 *   never on a re-render, or every modal in the app would chirp on each keystroke
 *   behind it.
 */

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { useSheetSound, withClick } from '@components/sound';

jest.mock('@services/audio', () => ({
  playSfx: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { playSfx } = require('@services/audio') as { playSfx: jest.Mock };

beforeEach(() => {
  playSfx.mockClear();
});

describe('withClick', () => {
  it('plays before it calls, so a navigating handler cannot cut the sound off', () => {
    const order: string[] = [];
    playSfx.mockImplementation(() => order.push('sound'));

    withClick(() => order.push('handler'))();

    expect(order).toEqual(['sound', 'handler']);
  });

  it('defaults to buttonClick', () => {
    withClick(() => undefined)();
    expect(playSfx).toHaveBeenCalledWith('buttonClick');
  });

  it('takes a different effect for controls that are not buttons', () => {
    withClick(() => undefined, 'toggle')();
    expect(playSfx).toHaveBeenCalledWith('toggle');
  });

  it('forwards its arguments untouched', () => {
    const handler = jest.fn();
    withClick(handler)(1, 'two', { three: true });
    expect(handler).toHaveBeenCalledWith(1, 'two', { three: true });
  });

  it('still sounds, and does not throw, with no handler at all', () => {
    expect(() => withClick(undefined)()).not.toThrow();
    expect(playSfx).toHaveBeenCalledWith('buttonClick');
  });
});

describe('useSheetSound', () => {
  function Harness({ visible, enabled }: { visible: boolean; enabled?: boolean }) {
    useSheetSound(visible, enabled);
    return null;
  }

  /** Render the harness and return a setter for its props. */
  function mount(props: { visible: boolean; enabled?: boolean }) {
    let tree!: ReturnType<typeof create>;
    act(() => {
      tree = create(createElement(Harness, props));
    });
    return (next: { visible: boolean; enabled?: boolean }) =>
      act(() => tree.update(createElement(Harness, next)));
  }

  it('says nothing for a sheet that mounts already open', () => {
    mount({ visible: true });
    expect(playSfx).not.toHaveBeenCalled();
  });

  it('opens and closes', () => {
    const update = mount({ visible: false });

    update({ visible: true });
    expect(playSfx).toHaveBeenLastCalledWith('popupOpen');

    update({ visible: false });
    expect(playSfx).toHaveBeenLastCalledWith('popupClose');
    expect(playSfx).toHaveBeenCalledTimes(2);
  });

  it('does not re-fire when something else re-renders behind an open sheet', () => {
    const update = mount({ visible: false });

    update({ visible: true });
    update({ visible: true });
    update({ visible: true });

    expect(playSfx).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when the caller has a voice of its own', () => {
    const update = mount({ visible: false, enabled: false });
    update({ visible: true, enabled: false });
    expect(playSfx).not.toHaveBeenCalled();
  });

  /**
   * A disabled sheet must still *track* its visibility, or enabling the sound
   * later would replay the transition that happened while it was off.
   */
  it('tracks transitions it did not announce', () => {
    const update = mount({ visible: false, enabled: false });
    update({ visible: true, enabled: false });
    update({ visible: true, enabled: true });

    expect(playSfx).not.toHaveBeenCalled();
  });
});
