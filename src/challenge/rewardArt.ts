/**
 * rewardArt.ts — the picture for each reward.
 *
 * Purpose:      Give every achievement an image, earned and unearned.
 * Responsibilities:
 *               - Map a `RewardDefinition.id` to its two bitmaps.
 * Notes:        Kept out of `rewards.ts` on purpose. That file is the *ladder* —
 *               pure data with no platform dependency, shared with the off-device
 *               tooling — and `require` of a PNG is a Metro feature that would
 *               drag bundler behaviour into it. Art is a presentation concern, so
 *               it lives in its own module that only the screen imports.
 *
 *               **Unearned is a separate render, not the earned one faded.** The
 *               rewards screen is almost entirely unearned for a new player, and
 *               a wall of ghosts reads as broken rather than aspirational. The
 *               locked art is the same object drained of colour, so the shape
 *               still tells you what you are working toward.
 *
 *               The images are PNG with a real alpha channel. They were generated
 *               as JPEG on a white ground, which would have put a white card
 *               behind every badge on Midnight and Kinetic Neon; the background is
 *               flood-filled away from the border rather than keyed on white, so
 *               the white skull and the target's white rings survive.
 */

/** Both states of one reward's artwork. */
export interface RewardArt {
  readonly earned: number;
  readonly locked: number;
}

/**
 * Art per reward id.
 *
 * Objects are chosen so a track reads at a glance and its top rung still feels
 * like an arrival: the `won` ladder runs arrowhead → gloves → trophy → crown, and
 * `perfect` ends on a skull because a 50-flawless-win badge should look like one.
 */
const ART: Record<string, RewardArt> = {
  'first-win': {
    earned: require('../../assets/awards/level_legend_active.png'),
    locked: require('../../assets/awards/level_legend_locked.png'),
  },
  'won-5': {
    earned: require('../../assets/awards/level_legend_active.png'),
    locked: require('../../assets/awards/level_legend_locked.png'),
  },
  'won-25': {
    earned: require('../../assets/awards/level_legend_active.png'),
    locked: require('../../assets/awards/level_legend_locked.png'),
  },
  'won-100': {
    earned: require('../../assets/records/largest streak.png'),
    locked: require('../../assets/records/largest streak_locked.png'),
  },
  'streak-3': {
    earned: require('../../assets/awards/league_climber_active.png'),
    locked: require('../../assets/awards/league_climber_locked.png'),
  },
  'streak-7': {
    earned: require('../../assets/awards/league_fighter_active.png'),
    locked: require('../../assets/awards/league_fighter_locked.png'),
  },
  'streak-30': {
    earned: require('../../assets/records/largest streak.png'),
    locked: require('../../assets/records/largest streak_locked.png'),
  },
  'perfect-1': {
    earned: require('../../assets/awards/perfect_play_active.png'),
    locked: require('../../assets/awards/perfect_play_locked.png'),
  },
  'perfect-10': {
    earned: require('../../assets/awards/perfect_play_active.png'),
    locked: require('../../assets/awards/perfect_play_locked.png'),
  },
  'perfect-50': {
    earned: require('../../assets/awards/unstoppable_active.png'),
    locked: require('../../assets/awards/unstoppable_locked.png'),
  },
};

/**
 * The artwork for a reward, or `undefined` if it has none.
 *
 * Total rather than throwing, so adding a reward to the ladder without art yet
 * degrades to the glyph the screen already knows how to draw instead of taking
 * the whole screen down.
 */
export function rewardArt(id: string): RewardArt | undefined {
  return ART[id];
}
