/**
 * make-sounds.ts — synthesise the game's audio from scratch.
 *
 * Purpose:      Produce every sound effect and music bed as a real, playable file,
 *               so the game stops being silent before a composer is involved.
 * Responsibilities:
 *               - A small DSP toolkit: oscillators, noise, envelopes, a filter.
 *               - One declarative recipe per sound.
 *               - Write 44.1kHz mono 16-bit PCM WAVs.
 * Notes:        **These are placeholders, and deliberately honest ones.** Nothing
 *               here is recorded or composed — every sample is computed from a
 *               formula. The result is clean and plain, in the register of early
 *               system sounds rather than produced game audio. That is the right
 *               trade for now: the alternative was silence, and silence cannot be
 *               tested. Replacing any of them later is dropping a file in and
 *               changing one line of `audioAssets.ts`.
 *
 *               **WAV rather than the `.m4a` the README asks for**, because AAC
 *               encoding needs a codec this toolchain does not have. WAV is larger
 *               — about 17KB for a short effect — but `expo-audio` plays it, and
 *               the whole effect set still comes in under a megabyte.
 *
 *               **Music loops are seamless by construction, not by trimming.** Every
 *               partial in a bed is given a frequency that completes a whole number
 *               of cycles inside the loop, so the last sample runs into the first
 *               with no discontinuity. A 20ms click at the loop point is inaudible
 *               once and unbearable on the fortieth repeat.
 *
 *               Run: `npm run sounds:build`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 44100;
const OUT = join(process.cwd(), 'assets', 'audio');

// ---------------------------------------------------------------------------
// DSP toolkit
// ---------------------------------------------------------------------------

/** A mono buffer of floating-point samples in roughly -1..1. */
type Signal = Float32Array;

/** An empty buffer of `seconds` length. */
function buffer(seconds: number): Signal {
  return new Float32Array(Math.max(1, Math.floor(RATE * seconds)));
}

/** Seconds elapsed at sample `i`. */
const at = (i: number): number => i / RATE;

/**
 * Deterministic noise.
 *
 * `Math.random` would make every build produce different files, which turns a
 * rebuild into a diff nobody can review. This is a small LCG seeded per sound.
 */
function noiseSource(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0x100000000) * 2 - 1;
  };
}

/** Exponential decay from 1 to ~0. `rate` of 30 is a sharp click, 4 is a long tail. */
const decay = (t: number, rate: number): number => Math.exp(-rate * t);

/**
 * Attack-decay envelope with a soft edge.
 *
 * The attack matters more than it looks: a waveform that starts at full amplitude
 * produces a click at sample zero regardless of what follows it, which is heard as
 * a defect rather than as percussion.
 */
function envelope(t: number, duration: number, attack = 0.004, rate = 12): number {
  if (t >= duration) return 0;
  const rise = Math.min(1, t / attack);
  return rise * decay(t, rate);
}

/** Sine partial at `freq`, optionally sweeping to `endFreq` over the duration. */
function tone(
  signal: Signal,
  freq: number,
  duration: number,
  gain: number,
  options: { endFreq?: number; attack?: number; rate?: number; offset?: number } = {},
): void {
  const { endFreq = freq, attack = 0.004, rate = 12, offset = 0 } = options;
  const start = Math.floor(offset * RATE);
  const count = Math.floor(duration * RATE);
  let phase = 0;

  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    if (index >= signal.length) break;
    const t = at(i);
    // Linear frequency sweep, integrated into phase so there is no discontinuity.
    const f = freq + (endFreq - freq) * (t / duration);
    phase += (2 * Math.PI * f) / RATE;
    signal[index]! += Math.sin(phase) * envelope(t, duration, attack, rate) * gain;
  }
}

/** Filtered noise burst — the basis of whooshes, thuds and fireworks. */
function noise(
  signal: Signal,
  duration: number,
  gain: number,
  options: { seed?: number; cutoff?: number; rate?: number; offset?: number } = {},
): void {
  const { seed = 12345, cutoff = 0.25, rate = 14, offset = 0 } = options;
  const random = noiseSource(seed);
  const start = Math.floor(offset * RATE);
  const count = Math.floor(duration * RATE);
  let last = 0;

  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    if (index >= signal.length) break;
    // One-pole low-pass. Cheap, and enough to turn white noise into something with
    // a body rather than a hiss.
    last += (random() - last) * cutoff;
    signal[index]! += last * envelope(at(i), duration, 0.002, rate) * gain;
  }
}

/** Normalise to a peak, so nothing clips and everything sits at a known level. */
function normalise(signal: Signal, peak = 0.85): Signal {
  let max = 0;
  for (const sample of signal) max = Math.max(max, Math.abs(sample));
  if (max === 0) return signal;
  const scale = peak / max;
  for (let i = 0; i < signal.length; i += 1) signal[i]! *= scale;
  return signal;
}

/** Fade the first and last few milliseconds, so no file starts or ends on a step. */
function fadeEdges(signal: Signal, seconds = 0.006): Signal {
  const n = Math.min(Math.floor(RATE * seconds), Math.floor(signal.length / 2));
  for (let i = 0; i < n; i += 1) {
    const k = i / n;
    signal[i]! *= k;
    signal[signal.length - 1 - i]! *= k;
  }
  return signal;
}

/** RIFF/WAVE container around 16-bit PCM. */
function encodeWav(signal: Signal): Buffer {
  const data = Buffer.alloc(signal.length * 2);
  for (let i = 0; i < signal.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, signal[i]!));
    data.writeInt16LE(Math.round(clamped * 32767), i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/** A short, bright blip. The basis of most UI. */
function blip(freq: number, duration: number, seed: number): Signal {
  const signal = buffer(duration);
  tone(signal, freq, duration, 0.7, { rate: 26 });
  tone(signal, freq * 2, duration * 0.6, 0.18, { rate: 34 });
  noise(signal, 0.012, 0.06, { seed, cutoff: 0.5, rate: 60 });
  return fadeEdges(normalise(signal, 0.7));
}

/** Two notes, up or down. Used wherever something got better or worse. */
function twoTone(a: number, b: number, duration: number): Signal {
  const signal = buffer(duration);
  const half = duration / 2;
  tone(signal, a, half, 0.7, { rate: 16 });
  tone(signal, b, half, 0.7, { rate: 14, offset: half * 0.85 });
  return fadeEdges(normalise(signal, 0.75));
}

/** An ascending arpeggio. Every "you did well" sound is one of these. */
function arpeggio(root: number, steps: readonly number[], duration: number): Signal {
  const signal = buffer(duration);
  const step = duration / (steps.length + 1);
  steps.forEach((semitone, index) => {
    const freq = root * Math.pow(2, semitone / 12);
    tone(signal, freq, duration - step * index, 0.55, {
      rate: 6,
      offset: step * index,
      attack: 0.006,
    });
    // A quiet octave above gives it some shine without adding a second voice.
    tone(signal, freq * 2, duration - step * index, 0.12, {
      rate: 8,
      offset: step * index,
    });
  });
  return fadeEdges(normalise(signal, 0.8));
}

/** A swept noise band — an arrow leaving the board. */
function whoosh(duration: number, seed: number): Signal {
  const signal = buffer(duration);
  // Two overlapping bands, the second brighter and later, so it reads as movement
  // away from the listener rather than a single burst.
  noise(signal, duration, 0.5, { seed, cutoff: 0.12, rate: 9 });
  noise(signal, duration * 0.7, 0.3, { seed: seed + 7, cutoff: 0.32, rate: 13, offset: duration * 0.15 });
  tone(signal, 420, duration * 0.8, 0.12, { endFreq: 180, rate: 8 });
  return fadeEdges(normalise(signal, 0.55));
}

/** A low, blunt impact. */
function thud(duration: number, seed: number): Signal {
  const signal = buffer(duration);
  tone(signal, 150, duration, 0.8, { endFreq: 62, rate: 22 });
  noise(signal, duration * 0.4, 0.35, { seed, cutoff: 0.09, rate: 26 });
  return fadeEdges(normalise(signal, 0.8));
}

/**
 * A looping ambient pad.
 *
 * Every partial's frequency is rounded to a whole number of cycles per loop, which
 * is what makes the join seamless without any trimming. The slow amplitude drift
 * is likewise a whole number of cycles, so it does not jump either.
 */
function pad(seconds: number, root: number, partials: readonly number[]): Signal {
  const signal = buffer(seconds);
  const base = 1 / seconds;

  partials.forEach((semitone, index) => {
    const wanted = root * Math.pow(2, semitone / 12);
    // Snap to the nearest frequency that completes whole cycles in the loop.
    const freq = Math.round(wanted / base) * base;
    const lfoCycles = index + 1;
    const gain = 0.5 / (index + 1.4);

    for (let i = 0; i < signal.length; i += 1) {
      const t = at(i);
      const drift = 0.72 + 0.28 * Math.sin((2 * Math.PI * lfoCycles * t) / seconds);
      signal[i]! += Math.sin(2 * Math.PI * freq * t) * gain * drift;
    }
  });

  // No edge fade: fading would defeat the seamless join this function exists for.
  return normalise(signal, 0.5);
}

/** Every effect, by output filename. */
const EFFECTS: Record<string, () => Signal> = {
  // --- Gameplay ---
  'arrow-pickup': () => blip(660, 0.07, 11),
  'arrow-release': () => whoosh(0.22, 23),
  'correct-move': () => blip(880, 0.1, 31),
  'wrong-move': () => twoTone(300, 220, 0.18),
  collision: () => thud(0.16, 41),
  'heart-lost': () => twoTone(520, 330, 0.32),
  'last-heart': () => {
    // A minor second held together: deliberately uncomfortable, and it only ever
    // fires once a level so it can afford to be.
    const signal = buffer(0.5);
    tone(signal, 440, 0.5, 0.5, { rate: 4 });
    tone(signal, 466, 0.5, 0.5, { rate: 4 });
    return fadeEdges(normalise(signal, 0.7));
  },
  hint: () => arpeggio(700, [0, 7], 0.26),
  undo: () => twoTone(520, 700, 0.16),
  restart: () => twoTone(400, 600, 0.2),
  pause: () => blip(400, 0.09, 53),
  resume: () => blip(600, 0.09, 59),

  // --- UI ---
  button: () => blip(760, 0.055, 61),
  toggle: () => blip(560, 0.05, 67),
  'popup-open': () => twoTone(500, 760, 0.14),
  'popup-close': () => twoTone(760, 500, 0.14),
  'reward-collected': () => arpeggio(600, [0, 4, 7, 12], 0.5),

  // --- Progress ---
  'level-complete': () => arpeggio(523, [0, 4, 7, 12], 0.62),
  fireworks: () => {
    // Texture under the confetti rather than an event: several soft bursts, none
    // of them sharp enough to become the thing you notice.
    const signal = buffer(0.85);
    for (let i = 0; i < 5; i += 1) {
      noise(signal, 0.22, 0.28, {
        seed: 101 + i * 13,
        cutoff: 0.2 + i * 0.05,
        rate: 16,
        offset: i * 0.13,
      });
    }
    return fadeEdges(normalise(signal, 0.45));
  },
  star: () => arpeggio(880, [0, 7], 0.3),
  'difficulty-unlocked': () => arpeggio(440, [0, 5, 9, 14], 0.75),
  achievement: () => arpeggio(523, [0, 7, 12, 16], 0.8),

  // --- Failure ---
  'out-of-hearts': () => {
    const signal = buffer(0.7);
    tone(signal, 400, 0.7, 0.6, { endFreq: 180, rate: 5 });
    tone(signal, 300, 0.6, 0.3, { endFreq: 140, rate: 6, offset: 0.06 });
    return fadeEdges(normalise(signal, 0.7));
  },
  'game-over': () => arpeggio(392, [0, -3, -7, -12], 0.9),

  // --- Miscellaneous ---
  countdown: () => blip(1040, 0.11, 71),
  notification: () => arpeggio(784, [0, 4], 0.28),
  'reward-ready': () => arpeggio(660, [0, 5, 9], 0.45),
};

/** The music beds. Loops first, then the two stings. */
const MUSIC: Record<string, () => Signal> = {
  // Warmer and a little more present than the gameplay bed — it is the first thing
  // anyone hears.
  menu: () => pad(12, 196, [0, 7, 12, 16, 19]),
  // No strong melody, by design. It has to survive being heard for an hour.
  gameplay: () => pad(16, 147, [0, 7, 12, 19]),
  victory: () => arpeggio(523, [0, 4, 7, 12, 16], 1.8),
  failure: () => arpeggio(392, [0, -2, -5, -9], 1.8),
};

// ---------------------------------------------------------------------------

mkdirSync(join(OUT, 'sfx'), { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });

let bytes = 0;
let count = 0;

for (const [name, make] of Object.entries(EFFECTS)) {
  const wav = encodeWav(make());
  writeFileSync(join(OUT, 'sfx', `${name}.wav`), wav);
  bytes += wav.length;
  count += 1;
}

for (const [name, make] of Object.entries(MUSIC)) {
  const wav = encodeWav(make());
  writeFileSync(join(OUT, 'music', `${name}.wav`), wav);
  bytes += wav.length;
  count += 1;
}

console.log(`Wrote ${count} files, ${(bytes / 1024 / 1024).toFixed(1)} MB total.`);
console.log(`  ${Object.keys(EFFECTS).length} effects in assets/audio/sfx/`);
console.log(`  ${Object.keys(MUSIC).length} beds in assets/audio/music/`);
console.log('\nSynthesised placeholders — every sample is computed, none recorded.');
console.log('Replacing one is dropping a file in and editing audioAssets.ts.');
