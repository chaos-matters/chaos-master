import { describe, expect, it } from 'vitest'
import { validateFlame } from '@/flame/schema/flameSchema'
import { applyAudioMappingsToFlame } from './audioAnalysis'
import type { AudioMappingEntry, FrameData, MappingSmoothingState, } from './audioAnalysis'

const QUIET_FRAME: FrameData & { isBeat: boolean } = {
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  hiMid: 0,
  presence: 0,
  brilliance: 0,
  fullSpectrum: 0,
  rms: 0,
  centroid: 0,
  flatness: 0,
  onset: 0,
  onsetStrength: 0,
  bands: [0, 0, 0, 0, 0, 0, 0, 0],
  isBeat: false,
} as unknown as FrameData & { isBeat: boolean }

const LOUD_FRAME: FrameData & { isBeat: boolean } = {
  subBass: 1,
  bass: 1,
  lowMid: 1,
  mid: 1,
  hiMid: 1,
  presence: 1,
  brilliance: 1,
  fullSpectrum: 1,
  rms: 1,
  centroid: 20000,
  flatness: 1,
  onset: 1,
  onsetStrength: 1,
  bands: [1, 1, 1, 1, 1, 1, 1, 1],
  isBeat: true,
} as unknown as FrameData & { isBeat: boolean }

function createSampleFlame() {
  return validateFlame({
    version: '1.0',
    metadata: { name: 'audio-test', author: 'test' },
    transforms: {
      t0: {
        probability: 0.5,
        preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.5, y: 0.5 },
        variations: { v0: { type: 'linearVar', weight: 1 } },
      },
      t1: {
        probability: 0.5,
        preAffine: { a: 1, b: 0, c: 0.2, d: 0, e: 1, f: 0 },
        postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
        color: { x: 0.2, y: 0.7 },
        variations: { v1: { type: 'swirlVar', weight: 0.8 } },
      },
    },
  }) as unknown as Record<string, unknown>
}

describe('applyAudioMappingsToFlame modular target appliers', () => {
  it('modulates camera zoom correctly', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: { kind: 'renderSetting', param: 'zoom' },
        sensitivity: 1,
        range: [1, 5],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const rs = flame.renderSettings as { camera?: { zoom?: number } }
    expect(rs.camera?.zoom).toBe(5)
  })

  it('scales the output by the mapping sensitivity', () => {
    // range [1, 5] at full signal: sensitivity 0.5 lands halfway, at 3. An
    // audit mutation dropped the sensitivity factor; the existing cases all
    // used sensitivity 1, where the factor is invisible.
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: { kind: 'renderSetting', param: 'zoom' },
        sensitivity: 0.5,
        range: [1, 5],
      },
    ]
    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const rs = flame.renderSettings as { camera?: { zoom?: number } }
    expect(rs.camera?.zoom).toBe(3)
  })

  it('modulates transform affine parameters on target transform index', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'bass',
        target: {
          kind: 'transformAffine',
          transformIdx: 0,
          matrix: 'preAffine',
          param: 'c',
        },
        sensitivity: 1,
        range: [0, 2],
      },
      {
        audioFeature: 'mid',
        target: {
          kind: 'transformAffine',
          transformIdx: 1,
          matrix: 'postAffine',
          param: 'f',
        },
        sensitivity: 1,
        range: [-1, 1],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const txObj = flame.transforms as Record<
      string,
      {
        preAffine?: Record<string, number>
        postAffine?: Record<string, number>
      }
    >
    const txArr = Object.values(txObj)
    const t0 = txArr[0]!
    const t1 = txArr[1]!
    expect(t0.preAffine?.c).toBe(2)
    expect(t1.postAffine?.f).toBe(1)
  })

  it('modulates colorX and colorY scalar properties', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformProperty',
          transformIdx: 0,
          property: 'colorX',
        },
        sensitivity: 1,
        range: [0, 1],
      },
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformProperty',
          transformIdx: 0,
          property: 'colorY',
        },
        sensitivity: 1,
        range: [0.3, 0.9],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const txArr = Object.values(
      flame.transforms as Record<string, Record<string, unknown>>,
    )
    const color = txArr[0]!.color as { x: number; y: number }
    expect(color.x).toBe(1)
    expect(color.y).toBeCloseTo(0.9)
  })

  it('enforces safe probability lower bound for transform probability target', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformProperty',
          transformIdx: 0,
          property: 'probability',
        },
        sensitivity: 1,
        range: [-2, -1],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const txArr = Object.values(
      flame.transforms as Record<string, Record<string, unknown>>,
    )
    expect(txArr[0]!.probability).toBe(0.001)
  })

  it('modulates variation weights on existing variations', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: {
          kind: 'variationWeight',
          transformIdx: 0,
          variationType: 'linearVar',
        },
        sensitivity: 1,
        range: [0, 3.5],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const txArr = Object.values(
      flame.transforms as Record<string, Record<string, unknown>>,
    )
    const vars = txArr[0]!.variations as Record<
      string,
      { type: string; weight: number }
    >
    const linearVar = Object.values(vars).find((v) => v.type === 'linearVar')
    expect(linearVar?.weight).toBe(3.5)
  })

  it('modulates final transform affine parameters', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: {
          kind: 'finalAffine',
          param: 'a',
        },
        sensitivity: 1,
        range: [1, 2],
      },
    ]

    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    const fin = flame.finalTransform as Record<string, number>
    expect(fin.a).toBe(2)
  })

  it('gracefully handles out-of-bounds transform indices', () => {
    const flame = createSampleFlame()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformProperty',
          transformIdx: 999,
          property: 'colorX',
        },
        sensitivity: 1,
        range: [0, 1],
      },
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformAffine',
          transformIdx: 999,
          matrix: 'preAffine',
          param: 'a',
        },
        sensitivity: 1,
        range: [0, 1],
      },
      {
        audioFeature: 'rms',
        target: {
          kind: 'variationWeight',
          transformIdx: 999,
          variationType: 'swirlVar',
        },
        sensitivity: 1,
        range: [0, 1],
      },
    ]

    expect(() => {
      applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings)
    }).not.toThrow()
  })

  it('applies attack and release envelope smoothing across consecutive frames', () => {
    const flame = createSampleFlame()
    const smoothingState: MappingSmoothingState = new Map()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: { kind: 'renderSetting', param: 'exposure' },
        sensitivity: 1,
        range: [0, 10],
        attackMs: 100,
        releaseMs: 500,
      },
    ]

    // Step 1: Quiet initial frame
    applyAudioMappingsToFlame(
      flame,
      QUIET_FRAME,
      mappings,
      smoothingState,
      1 / 30,
    )
    let state = smoothingState.get('render.exposure')
    expect(state?.smoothed).toBe(0)

    // Step 2: Sudden loud frame -> attack phase
    applyAudioMappingsToFlame(
      flame,
      LOUD_FRAME,
      mappings,
      smoothingState,
      1 / 30,
    )
    state = smoothingState.get('render.exposure')
    expect(state).toBeDefined()
    expect(state!.smoothed).toBeGreaterThan(0)
    expect(state!.smoothed).toBeLessThan(1)

    const attackSmoothed = state!.smoothed

    // Step 3: Return to quiet -> release phase decays towards 0
    applyAudioMappingsToFlame(
      flame,
      QUIET_FRAME,
      mappings,
      smoothingState,
      1 / 30,
    )
    state = smoothingState.get('render.exposure')
    expect(state!.smoothed).toBeLessThan(attackSmoothed)
    expect(state!.smoothed).toBeGreaterThan(0)
  })

  it('skips redundant writes when changes are below the dirty threshold', () => {
    const flame = createSampleFlame()
    const smoothingState: MappingSmoothingState = new Map()
    const mappings: AudioMappingEntry[] = [
      {
        audioFeature: 'rms',
        target: { kind: 'renderSetting', param: 'vibrancy' },
        sensitivity: 1,
        range: [0, 1],
      },
    ]

    // Initial frame marks dirty and sets value
    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings, smoothingState)

    // Replace renderSettings reference to detect if it gets overwritten
    const canaryRs = { ...((flame.renderSettings as object) ?? {}) }
    flame.renderSettings = canaryRs

    // Second identical frame: should be skipped by dirty-check
    applyAudioMappingsToFlame(flame, LOUD_FRAME, mappings, smoothingState)
    expect(flame.renderSettings).toBe(canaryRs)
  })
})

// The PR #124 review's probes. A variation-weight target names a variation
// TYPE, and the applier used to look it up as a KEY of `variations` first:
// it moved whichever variation had an id spelled like the type, and a type
// named after an Object member wrote through the prototype chain.
describe('a variation-weight target finds its variation by type', () => {
  const weightOf = (variationType: string): AudioMappingEntry[] => [
    {
      audioFeature: 'rms',
      target: { kind: 'variationWeight', transformIdx: 0, variationType },
      sensitivity: 1,
      range: [0, 3.5],
    },
  ]
  const variationsOf = (flame: Record<string, unknown>) =>
    (
      flame.transforms as Record<
        string,
        { variations: Record<string, { type: string; weight: number }> }
      >
    ).t0!.variations

  it('not the variation whose id reads like the type', () => {
    const flame = createSampleFlame()
    variationsOf(flame).juliaVar = { type: 'sphericalVar', weight: 1 }
    variationsOf(flame).v2 = { type: 'juliaVar', weight: 1 }
    applyAudioMappingsToFlame(flame, LOUD_FRAME, weightOf('juliaVar'))
    expect(variationsOf(flame).juliaVar!.weight).toBe(1)
    expect(variationsOf(flame).v2!.weight).toBe(3.5)
  })

  it('and never writes through the prototype chain', () => {
    const inherited = () => [
      ({} as { weight?: unknown }).weight,
      (Object as unknown as { weight?: unknown }).weight,
    ]
    for (const type of ['__proto__', 'constructor']) {
      // Built the way a shared or loaded flame arrives: parsed JSON.
      const flame = JSON.parse(
        `{"transforms":{"t0":{"variations":{"v1":{"type":"${type}","weight":1}}}}}`,
      ) as Record<string, unknown>
      try {
        applyAudioMappingsToFlame(flame, LOUD_FRAME, weightOf(type))
        expect([type, ...inherited()]).toEqual([type, undefined, undefined])
        expect(variationsOf(flame).v1!.weight).toBe(3.5)
      } finally {
        delete (Object.prototype as { weight?: unknown }).weight
        delete (Object as unknown as { weight?: unknown }).weight
      }
    }
  })
})
