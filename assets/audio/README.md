# Audio assets

The game runs perfectly without these files — **every audio call is a no-op when
the asset is missing** (see `src/services/audio.ts`). Every event listed below is
already wired at its call site; enabling a sound is dropping in a file and
uncommenting one line in `src/services/audioAssets.ts`.

Nothing here is required for the game to ship. It is required for the game to
sound like anything.

---

## Layout

```
assets/audio/
  music/    menu.m4a  gameplay.m4a  victory.m4a  failure.m4a
  sfx/      arrow-pickup.m4a  arrow-release.m4a  …
```

---

## Music

Four beds. `menu` and `gameplay` **loop**; `victory` and `failure` play once over
the top, ducking whatever is underneath.

| File | When | What it should be |
|---|---|---|
| `music/menu.m4a` | main menu, level select | unhurried, a little warmer than the gameplay bed. This is the first thing anyone hears |
| `music/gameplay.m4a` | during a level | soft, low-key, **no strong melody**. It has to survive being heard for an hour without becoming the thing you notice |
| `music/victory.m4a` | level cleared | 2–3 seconds, resolved and warm. It plays *over* the bed, so leave headroom |
| `music/failure.m4a` | out of hearts, or a board sealed shut | 2–3 seconds, gentle and descending. Deliberately not harsh — on almost every level the board behind it was still winnable |

**Loops must be seamless.** Trim on a zero crossing with no trailing silence. A
20ms gap is inaudible once and unbearable on the fortieth repeat, and it will
become the most noticeable thing in the game.

---

## Sound effects

### Gameplay

| File | When |
|---|---|
| `sfx/arrow-pickup.m4a` | a finger lands on an arrow, before the tap completes |
| `sfx/arrow-release.m4a` | an arrow threads off the board — **fires constantly, so it must never grate** |
| `sfx/correct-move.m4a` | a tap that clears an arrow |
| `sfx/wrong-move.m4a` | a tap on a blocked arrow |
| `sfx/collision.m4a` | the moment the arrow hits what is in its way |
| `sfx/heart-lost.m4a` | the heart drains. Soft and low — the player misread, they did not fail |
| `sfx/last-heart.m4a` | one heart remaining. Fires once a level, so it can afford to be distinctive |
| `sfx/hint.m4a` | a hint is spent |
| `sfx/undo.m4a` | reserved; no undo is exposed today |
| `sfx/restart.m4a` | level restarted |
| `sfx/pause.m4a` · `sfx/resume.m4a` | the pause sheet opening and closing |

### UI

`sfx/button.m4a` · `sfx/toggle.m4a` · `sfx/popup-open.m4a` ·
`sfx/popup-close.m4a` · `sfx/reward-collected.m4a`

Short and quiet. These fire on every interaction, and their job is to be felt
rather than heard.

### Progress

`sfx/level-complete.m4a` · `sfx/fireworks.m4a` · `sfx/star.m4a` ·
`sfx/difficulty-unlocked.m4a` · `sfx/achievement.m4a`

`fireworks` plays under the confetti burst and should be soft — it is texture,
not an event.

### Failure

`sfx/out-of-hearts.m4a` · `sfx/game-over.m4a`

### Miscellaneous

`sfx/countdown.m4a` · `sfx/notification.m4a` · `sfx/reward-ready.m4a`

---

## Format

- **`.m4a` (AAC)** — small, and hardware-decoded on Android, which matters because
  `arrow-release` can fire several times a second.
- **Mono, 44.1 kHz.** These carry no stereo information, and mono halves the bundle.
- Normalise to about **−14 LUFS**, with **no clipping**. The app applies its own
  per-sound gain on top, so files should be consistent with each other rather than
  pre-balanced against each other.
- **Trim leading silence.** Silence at the head of a file is indistinguishable from
  audio latency, and this game plays a sound on every tap.
- Keep effects **under ~700ms**; `arrow-release` under 250ms so it finishes before
  the animation does.

## Mixing

Relative levels are set in code, not baked into the files — see `SFX_GAIN` and
`MUSIC_GAIN` in `src/services/audioAssets.ts`. Two behaviours worth knowing when
judging a file:

- The same effect will not retrigger within 45ms (`RETRIGGER_GAP_MS`). Two copies
  of one short sound that close together sum and clip rather than sounding like two
  events — which is what "no overlapping distortion" actually requires.
- Music cross-fades over 600ms and ducks to a quarter under a sting.

Audio mixes with other apps rather than seizing focus, and respects the device
silent switch — this is a quiet puzzle game, not something that should stop
someone's podcast.

## Licensing

Whatever you use must be cleared for commercial distribution. Keep the licence or
purchase receipt for each file somewhere outside the repo; Google Play will not
ask, but a rights holder might.
