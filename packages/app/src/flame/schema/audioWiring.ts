import * as v from '@/valibot'

/**
 * Validated shape of the audio-reactive wiring.
 *
 * The types in `utils/audioAnalysis.ts` are the source of truth for the app's
 * own use; this is the same shape as data that has crossed a JSON boundary —
 * a recorded session, a dropped `.steps.json`. The mapping drives writes into
 * the flame descriptor by index and by key, so an unvalidated one from a
 * hand-edited file would write nonsense into the document every audio frame.
 *
 * The audio FILE is deliberately not part of this. A buffer cannot ride in a
 * JSON session, and pretending otherwise would make replays silently
 * different from the recording; `trackName` names what is missing instead.
 */

export const AudioFeature = v.picklist([
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'hiMid',
  'presence',
  'brilliance',
  'fullSpectrum',
  'rms',
  'centroid',
  'flatness',
  'beat',
  'onset',
])

export const RenderSettingKey = v.picklist([
  'vibrancy',
  'exposure',
  'palettePhase',
  'paletteSpeed',
  'contrast',
  'gamma',
  'highlightPower',
  'lightPower',
  'depthColorPower',
  'zoom',
  'skipIters',
])

export const AffineKey = v.picklist(['a', 'b', 'c', 'd', 'e', 'f'])

export const TransformPropertyKey = v.picklist([
  'probability',
  'colorX',
  'colorY',
  'colorSpeed',
])

const TransformIndex = v.pipe(v.number(), v.integer(), v.minValue(0))

export const FlameTarget = v.variant('kind', [
  v.object({ kind: v.literal('renderSetting'), param: RenderSettingKey }),
  v.object({
    kind: v.literal('transformAffine'),
    transformIdx: TransformIndex,
    matrix: v.picklist(['preAffine', 'postAffine']),
    param: AffineKey,
  }),
  v.object({
    kind: v.literal('transformProperty'),
    transformIdx: TransformIndex,
    property: TransformPropertyKey,
  }),
  v.object({
    kind: v.literal('variationWeight'),
    transformIdx: TransformIndex,
    variationType: v.string(),
  }),
  v.object({ kind: v.literal('finalAffine'), param: AffineKey }),
])

export const AudioMappingEntry = v.object({
  audioFeature: AudioFeature,
  target: FlameTarget,
  sensitivity: v.pipe(v.number(), v.finite()),
  range: v.tuple([
    v.pipe(v.number(), v.finite()),
    v.pipe(v.number(), v.finite()),
  ]),
  attackMs: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
  releaseMs: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0))),
})

/** Mirrors `WiringPresetId | 'custom'` from the panel. A closed set, because
 *  the panel switches behaviour on it and an unknown name would leave the UI
 *  in a state it has no branch for. */
export const AudioPreset = v.picklist([
  'pulse',
  'bloom',
  'drift',
  'structure',
  'morph',
  'swarm',
  'custom',
])

export const AudioMapping = v.object({
  preset: AudioPreset,
  mappings: v.array(AudioMappingEntry),
})
export type AudioMapping = v.InferOutput<typeof AudioMapping>

/** Everything about audio reactivity that a session can carry. */
export const AudioWiringSnapshot = v.object({
  mapping: AudioMapping,
  enabled: v.boolean(),
  source: v.picklist(['file', 'mic']),
  /** The audio file's name, when one was loaded. Not the audio — a replay
   *  uses this only to tell the viewer which track to supply. */
  trackName: v.optional(v.string()),
})
export type AudioWiringSnapshot = v.InferOutput<typeof AudioWiringSnapshot>
