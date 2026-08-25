import { GROUP_SHAPE_CUES, shapeCueForGroup } from '../../src/render/scene';
import { NO_GROUP } from '../../src/game';

describe('shapeCueForGroup', () => {
  it('has 5 group shape cues', () => {
    expect(GROUP_SHAPE_CUES.length).toBe(5);
  });

  it('returns undefined for NO_GROUP', () => {
    expect(shapeCueForGroup(NO_GROUP)).toBeUndefined();
  });

  it('maps groups deterministically to geometric shape cues', () => {
    expect(shapeCueForGroup(0)).toBe('circle');
    expect(shapeCueForGroup(1)).toBe('square');
    expect(shapeCueForGroup(2)).toBe('triangle');
    expect(shapeCueForGroup(3)).toBe('diamond');
    expect(shapeCueForGroup(4)).toBe('star');
  });

  it('wraps around for groups exceeding palette length', () => {
    expect(shapeCueForGroup(5)).toBe('circle');
    expect(shapeCueForGroup(6)).toBe('square');
  });
});
