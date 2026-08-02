/**
 * What an audio-reactive preset actually wires.
 *
 * Split into two kinds, because they answer different questions:
 *
 *   RENDER presets touch only `renderSettings`, so they work on any flame and
 *   can be plain data. They are the safe quick start.
 *
 *   FLAME-AWARE presets reach into the loaded flame's transforms and variation
 *   weights, which is where the big visual change lives — but those targets
 *   only exist for THIS flame, so they cannot be static. They are computed
 *   from the transforms the panel already has.
 *
 * On which render settings are worth driving: the earlier presets leaned on
 * `highlightPower`, `skipIters` and `gamma`, which barely move the picture —
 * which is why they felt like they did nothing. The visible movers are
 * `vibrancy` (colour intensity), `palettePhase` (hue sweep), `exposure`
 * (brightness), `zoom`, and `contrast`. Everything here sticks to those, and
 * uses ranges wide enough to see from across the room.
 *
 * RANGES MUST MATCH flameSchema. Audio modulation writes into the live
 * descriptor, so a range past a schema bound leaves the flame permanently
 * invalid — `palettePhase` is 0-1 (NOT radians, which is what [0, 6.28] here
 * assumed), and driving it to 1.589 meant that flame could never be bred,
 * exported or opened in the ancestry tree again. `applyAudioMappingsToFlame`
 * clamps as a backstop; these ranges should not need it.
 */
import type { AudioFeature, AudioMappingEntry, FlameTarget, TransformInfo, } from './audioAnalysis'

/** A preset that needs nothing but render settings. */
export type RenderPresetId = 'pulse' | 'bloom' | 'drift'
/** A preset computed from the loaded flame. */
export type FlamePresetId = 'structure' | 'morph' | 'swarm'
export type WiringPresetId = RenderPresetId | FlamePresetId

export const RENDER_PRESET_IDS: RenderPresetId[] = ['pulse', 'bloom', 'drift']
export const FLAME_PRESET_IDS: FlamePresetId[] = ['structure', 'morph', 'swarm']

export const PRESET_LABELS: Record<WiringPresetId, string> = {
  pulse: 'Pulse',
  bloom: 'Bloom',
  drift: 'Drift',
  structure: 'Structure',
  morph: 'Morph',
  swarm: 'Swarm',
}

export const PRESET_DESCRIPTIONS: Record<WiringPresetId, string> = {
  pulse: 'Bass drives colour intensity, beats sweep the palette.',
  bloom: 'Loudness opens up brightness; highs lift saturation.',
  drift: 'Mids breathe the zoom while the palette rotates.',
  structure:
    "Bands re-weight this flame's transforms — the shape itself moves.",
  morph: "Bands drive this flame's variation weights, warping its geometry.",
  swarm: 'Bands scale transform affines, scattering and gathering the form.',
}

const ENTRY_DEFAULTS = { sensitivity: 1, attackMs: 40, releaseMs: 220 }

function entry(
  audioFeature: AudioFeature,
  target: FlameTarget,
  range: [number, number],
  overrides: Partial<AudioMappingEntry> = {},
): AudioMappingEntry {
  return { audioFeature, target, range, ...ENTRY_DEFAULTS, ...overrides }
}

const render = (param: Parameters<typeof renderTarget>[0]) =>
  renderTarget(param)

function renderTarget(
  param:
    | 'vibrancy'
    | 'exposure'
    | 'palettePhase'
    | 'paletteSpeed'
    | 'contrast'
    | 'zoom',
): FlameTarget {
  return { kind: 'renderSetting', param }
}

/**
 * Render-only presets. Deliberately few and strongly different from each
 * other — three recognisable characters beat six variations on one.
 */
export const RENDER_PRESETS: Record<RenderPresetId, AudioMappingEntry[]> = {
  pulse: [
    // Wide vibrancy swing is the single most legible reaction there is.
    entry('bass', render('vibrancy'), [0.25, 2.4], { releaseMs: 160 }),
    // A full turn of the palette on every beat, snapped hard.
    entry('beat', render('palettePhase'), [0, 1], {
      attackMs: 0,
      releaseMs: 320,
    }),
    entry('rms', render('exposure'), [0.75, 1.5]),
  ],
  bloom: [
    entry('rms', render('exposure'), [0.6, 1.9], { attackMs: 120 }),
    entry('presence', render('vibrancy'), [0.4, 1.9]),
    entry('centroid', render('palettePhase'), [0, 1], { attackMs: 200 }),
    entry('onset', render('contrast'), [0.9, 1.6], { releaseMs: 140 }),
  ],
  drift: [
    // Zoom needs a narrow range: past ~1.3x the flame leaves the frame.
    entry('mid', render('zoom'), [0.85, 1.22], {
      attackMs: 260,
      releaseMs: 420,
    }),
    entry('centroid', render('palettePhase'), [0, 1], { attackMs: 400 }),
    entry('hiMid', render('paletteSpeed'), [0.4, 2.4]),
    entry('subBass', render('vibrancy'), [0.5, 1.6], { attackMs: 180 }),
  ],
}

/**
 * Bands from low to high, so a preset can hand successive transforms
 * successive parts of the spectrum and the result reads as the flame being
 * played rather than shaken.
 */
const BAND_LADDER: AudioFeature[] = [
  'bass',
  'lowMid',
  'mid',
  'hiMid',
  'presence',
  'brilliance',
]

/**
 * Build a flame-aware preset for the transforms actually present.
 *
 * Deterministic: the same flame always yields the same wiring, so a preset is
 * something a user can come back to rather than a surprise. Randomisation is
 * what the Randomize button is for.
 *
 * Returns an empty array when the flame has nothing to offer (no transforms,
 * or no variations for `morph`), and the caller falls back to a render preset —
 * silently wiring nothing would look like the preset was broken.
 */
export function buildFlamePreset(
  id: FlamePresetId,
  transforms: TransformInfo[],
): AudioMappingEntry[] {
  if (transforms.length === 0) return []

  // Cap the fan-out: every mapping is evaluated per frame, and past a handful
  // the picture stops reading as a response to anything in particular.
  const used = transforms.slice(0, 6)
  const out: AudioMappingEntry[] = []

  if (id === 'structure') {
    used.forEach((t, i) => {
      const band = BAND_LADDER[i % BAND_LADDER.length]!
      // Probability must never reach 0 — a transform with no weight stops
      // contributing points and the branch simply vanishes.
      out.push(
        entry(
          band,
          {
            kind: 'transformProperty',
            transformIdx: t.index,
            property: 'probability',
          },
          [0.06, 0.55],
          { attackMs: 90, releaseMs: 320 },
        ),
      )
    })
    // One global mover, so quiet passages still breathe.
    out.push(entry('rms', render('vibrancy'), [0.5, 1.7]))
    return out
  }

  if (id === 'morph') {
    for (const t of used) {
      for (const [vi, variation] of t.variations.slice(0, 2).entries()) {
        const band = BAND_LADDER[(t.index + vi) % BAND_LADDER.length]!
        out.push(
          entry(
            band,
            {
              kind: 'variationWeight',
              transformIdx: t.index,
              variationType: variation.type,
            },
            [0, 1.5],
            { attackMs: 70, releaseMs: 260 },
          ),
        )
      }
    }
    if (out.length === 0) return []
    out.push(entry('centroid', render('palettePhase'), [0, 1]))
    return out
  }

  // swarm — scale each transform's pre-affine. `a` and `d` together are a
  // uniform scale, so driving both from one band grows and shrinks a branch
  // instead of shearing it.
  used.forEach((t, i) => {
    const band = BAND_LADDER[i % BAND_LADDER.length]!
    for (const param of ['a', 'd'] as const) {
      out.push(
        entry(
          band,
          {
            kind: 'transformAffine',
            transformIdx: t.index,
            matrix: 'preAffine',
            param,
          },
          [0.62, 1.35],
          { attackMs: 60, releaseMs: 240 },
        ),
      )
    }
  })
  out.push(entry('beat', render('exposure'), [0.85, 1.45], { releaseMs: 180 }))
  return out
}

/** Everything a preset id resolves to, whichever kind it is. */
export function buildPreset(
  id: WiringPresetId,
  transforms: TransformInfo[],
): AudioMappingEntry[] {
  if ((RENDER_PRESET_IDS as string[]).includes(id)) {
    return RENDER_PRESETS[id as RenderPresetId].map((m) => ({ ...m }))
  }
  const built = buildFlamePreset(id as FlamePresetId, transforms)
  // A flame with nothing to wire still deserves a working preset.
  return built.length > 0 ? built : RENDER_PRESETS.pulse.map((m) => ({ ...m }))
}

/**
 * A fresh random wiring for the loaded flame.
 *
 * Weighted towards the targets that visibly do something — an even draw across
 * every render setting produces the "preset that does nothing" the old ones
 * were. Roughly two thirds flame structure, one third render settings, which
 * is the mix that actually looks like the flame is dancing.
 */
export function randomizeMappings(
  transforms: TransformInfo[],
  random: () => number = Math.random,
): AudioMappingEntry[] {
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)]!

  const out: AudioMappingEntry[] = []
  const bands = [...BAND_LADDER].sort(() => random() - 0.5)

  if (transforms.length > 0) {
    const count = Math.min(transforms.length, 2 + Math.floor(random() * 3))
    const chosen = [...transforms].sort(() => random() - 0.5).slice(0, count)
    chosen.forEach((t, i) => {
      const band = bands[i % bands.length]!
      const roll = random()
      if (roll < 0.45) {
        out.push(
          entry(
            band,
            {
              kind: 'transformProperty',
              transformIdx: t.index,
              property: 'probability',
            },
            [0.06, 0.55],
          ),
        )
      } else if (roll < 0.8 && t.variations.length > 0) {
        out.push(
          entry(
            band,
            {
              kind: 'variationWeight',
              transformIdx: t.index,
              variationType: pick(t.variations).type,
            },
            [0, 1.5],
          ),
        )
      } else {
        out.push(
          entry(
            band,
            {
              kind: 'transformAffine',
              transformIdx: t.index,
              matrix: 'preAffine',
              param: pick(['a', 'd'] as const),
            },
            [0.62, 1.35],
          ),
        )
      }
    })
  }

  // Always at least one global mover, so a flame with no usable transform
  // targets still reacts.
  const globals: [AudioFeature, FlameTarget, [number, number]][] = [
    ['bass', render('vibrancy'), [0.35, 2.1]],
    ['rms', render('exposure'), [0.7, 1.6]],
    ['beat', render('palettePhase'), [0, 1]],
    ['centroid', render('paletteSpeed'), [0.4, 2.2]],
    ['onset', render('contrast'), [0.9, 1.6]],
  ]
  const globalCount = 1 + Math.floor(random() * 2)
  for (const [feature, target, range] of [...globals]
    .sort(() => random() - 0.5)
    .slice(0, globalCount)) {
    out.push(entry(feature, target, range))
  }

  return out
}
