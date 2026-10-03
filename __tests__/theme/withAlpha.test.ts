/**
 * withAlpha — tinting a theme colour without freezing it.
 *
 * The helper exists because the alternative was `rgba(16, 185, 129, 0.3)` written
 * by hand, which is a *snapshot* of one theme's `success` at one opacity. It looked
 * like a theme colour and behaved like a constant, so it stayed correct on Kinetic
 * Neon and silently wrong on the other five. The tests below are mostly about the
 * failure modes that would reintroduce exactly that: a theme written in a form the
 * parser rejects, or an unparseable value quietly returning the *wrong* colour.
 */

import { THEMES, withAlpha } from '@theme';

describe('withAlpha', () => {
  it('tints a six-digit hex at the requested opacity', () => {
    // #10B981 is Kinetic Neon's `success` - the exact colour that used to be
    // frozen into the Leagues promotion border as rgba(16, 185, 129, 0.3).
    expect(withAlpha('#10B981', 0.3)).toBe('rgba(16, 185, 129, 0.3)');
  });

  it('treats the alpha as caller-supplied, not derived from the hex', () => {
    expect(withAlpha('#000000', 0)).toBe('rgba(0, 0, 0, 0)');
    expect(withAlpha('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('expands three-digit shorthand rather than misreading it', () => {
    // '#abc' is #aabbcc. Naive slice() here would read 'aa', 'bc' and 'c' + NaN.
    expect(withAlpha('#abc', 0.5)).toBe('rgba(170, 187, 204, 0.5)');
  });

  it('ignores a hex that already carries its own alpha', () => {
    // The requested opacity wins; an 8-digit input does not get its alpha compounded
    // into the result, which would be a double-application.
    expect(withAlpha('#11223344', 0.3)).toBe('rgba(17, 34, 51, 0.3)');
  });

  it('passes through anything it cannot parse, rather than guessing', () => {
    // Returning the input unchanged is the honest answer. The alternative - parsing
    // 'rgba(...)' or a colour name - risks a *wrong* tint, which is much harder to
    // spot on screen than an obviously unthemed one.
    expect(withAlpha('rgba(148, 163, 184, 0.25)', 0.3)).toBe('rgba(148, 163, 184, 0.25)');
    expect(withAlpha('transparent', 0.3)).toBe('transparent');
    expect(withAlpha('#12345', 0.3)).toBe('#12345');
    expect(withAlpha('', 0.3)).toBe('');
  });

  it('is case-insensitive, since hex literals are written both ways', () => {
    expect(withAlpha('#10b981', 0.3)).toBe('rgba(16, 185, 129, 0.3)');
    expect(withAlpha('#AbC', 1)).toBe('rgba(170, 187, 204, 1)');
  });

  it('tints every colour role of every shipped theme, so no theme can fall through', () => {
    // The property that matters: no theme's palette may contain a colour this helper
    // silently refuses. If a future theme is authored in a form the parser does not
    // understand, it fails here rather than as a border that ignores the player's
    // chosen skin on the one screen that uses it.
    const untinted: string[] = [];

    for (const theme of THEMES) {
      for (const [role, value] of Object.entries(theme.palette)) {
        if (typeof value !== 'string') continue;
        // `scheme` is `'light' | 'dark'` for the status bar, not a colour, and
        // `rgba()` values already carry their own opacity and pass through by
        // design. Those are the two legitimate cases of an unchanged result.
        if (role === 'scheme') continue;
        if (value.startsWith('rgba(')) continue;

        const tinted = withAlpha(value, 0.3);
        if (tinted === value) untinted.push(`${theme.id}.${role}`);
        expect({ role: `${theme.id}.${role}`, tinted }).toEqual({
          role: `${theme.id}.${role}`,
          tinted: expect.stringMatching(/^rgba\(\d+, \d+, \d+, 0\.3\)$/),
        });
      }
    }

    // One assertion, and it names every role that fell through rather than just
    // counting them — a count would tell you something broke but not what.
    expect(untinted).toEqual([]);
  });
});
