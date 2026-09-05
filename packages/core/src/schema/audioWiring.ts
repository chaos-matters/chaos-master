import * as v from 'valibot'

/**
 * Validated shape of the audio-reactive wiring.
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
  mappings: v.pipe(v.array(AudioMappingEntry), v.maxLength(512)),
})
export type AudioMapping = v.InferOutput<typeof AudioMapping>

export const AudioWiringSnapshot = v.object({
  mapping: AudioMapping,
  enabled: v.boolean(),
  source: v.picklist(['file', 'mic']),
  trackName: v.optional(v.string()),
})
export type AudioWiringSnapshot = v.InferOutput<typeof AudioWiringSnapshot>
