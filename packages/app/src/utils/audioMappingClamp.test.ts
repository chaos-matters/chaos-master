import { describe, expect, it } from 'vitest'
import { validateFlame } from '@/flame/schema/flameSchema'
import { applyAudioMappingsToFlame } from './audioAnalysis'
import type { AudioMappingEntry, FrameData } from './audioAnalysis'

/** A frame where every feature reads full scale, so mappings hit their max. */
const LOUD: FrameData & { isBeat: boolean } = {
  subBass: 1,
  bass: 1,
  lowMid: 1,
  mid: 1,
  hiMid: 1,
  presence: 1,
  brilliance: 1,
  fullSpectrum: 1,
  rms: 1,
  centroid: 1,
  flatness: 1,
  onset: 1,
  isBeat: true,
} as unknown as FrameData & { isBeat: boolean }

function flame() {
  return validateFlame({
    version: '1.0',
    metadata: { name: 'clamp', author: 'test' },
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
        variations: { v1: { type: 'swirlVar', weight: 1 } },
      },
    },
  }) as unknown as Record<string, unknown>
}

const map = (param: string, range: [number, number]): AudioMappingEntry[] => [
  {
    audioFeature: 'rms',
    target: { kind: 'renderSetting', param } as AudioMappingEntry['target'],
    sensitivity: 1,
    range,
  },
]

describe('audio modulation cannot corrupt the flame', () => {
  /*
   * The bug this exists for: a preset drove palettePhase to 1.589 assuming
   * radians, but the schema caps it at 1. The value went into the live
   * descriptor, and from then on validateFlame threw — the flame could not be
   * bred, exported, or shown in the ancestry tree.
   */
  it('keeps a wildly out-of-range palettePhase valid', () => {
    const f = flame()
    applyAudioMappingsToFlame(f, LOUD, map('palettePhase', [0, 6.28]))
    expect(() => validateFlame(f)).not.toThrow()
    const rs = f.renderSettings as Record<string, number>
    expect(rs.palettePhase).toBeLessThanOrEqual(1)
  })

  it.each([
    ['vibrancy', [0, 99] as [number, number], 3],
    ['exposure', [0, 500] as [number, number], 8],
    ['contrast', [0, 900] as [number, number], 20],
    ['gamma', [0, 40] as [number, number], 8],
    ['highlightPower', [0, 50] as [number, number], 2],
  ])('clamps %s to its schema maximum', (param, range, max) => {
    const f = flame()
    applyAudioMappingsToFlame(f, LOUD, map(param, range))
    expect(() => validateFlame(f)).not.toThrow()
    expect(
      (f.renderSettings as Record<string, number>)[param],
    ).toBeLessThanOrEqual(max)
  })

  it('keeps skipIters an integer, as the schema demands', () => {
    const f = flame()
    applyAudioMappingsToFlame(f, LOUD, map('skipIters', [0, 7.5]))
    expect(() => validateFlame(f)).not.toThrow()
    expect(
      Number.isInteger((f.renderSettings as Record<string, number>).skipIters),
    ).toBe(true)
  })

  /*
   * A transform at zero probability stops receiving points and its branch
   * vanishes; drive every weight low together and the picture thins to noise,
   * which is the "flame collapsed" people hit mid-track. Negative is worse —
   * it makes the selection distribution non-monotonic.
   */
  it('never drives a transform probability to zero or below', () => {
    const f = flame()
    applyAudioMappingsToFlame(f, { ...LOUD, rms: 0 }, [
      {
        audioFeature: 'rms',
        target: {
          kind: 'transformProperty',
          transformIdx: 0,
          property: 'probability',
        },
        sensitivity: 1,
        range: [-5, 1],
      },
    ])
    const t = Object.values(
      f.transforms as Record<string, { probability: number }>,
    )[0]!
    expect(t.probability).toBeGreaterThan(0)
    expect(() => validateFlame(f)).not.toThrow()
  })

  it('survives a degenerate range without writing NaN', () => {
    const f = flame()
    applyAudioMappingsToFlame(f, LOUD, map('vibrancy', [NaN, NaN]))
    expect(() => validateFlame(f)).not.toThrow()
    expect(
      Number.isFinite((f.renderSettings as Record<string, number>).vibrancy),
    ).toBe(true)
  })
})
