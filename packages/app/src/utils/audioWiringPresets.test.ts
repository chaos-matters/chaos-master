import { describe, expect, it } from 'vitest'
import { flameTargetKey } from './audioAnalysis'
import { buildFlamePreset, buildPreset, FLAME_PRESET_IDS, randomizeMappings, RENDER_PRESET_IDS, } from './audioWiringPresets'
import type { TransformInfo } from './audioAnalysis'

function transforms(count: number, variationsEach = 2): TransformInfo[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t${i}`,
    index: i,
    label: `Transform ${i + 1}`,
    variations: Array.from({ length: variationsEach }, (_, v) => ({
      id: `v${i}_${v}`,
      type: v === 0 ? 'linearVar' : 'swirlVar',
    })),
  }))
}

/** Deterministic stand-in for Math.random, so a "random" wiring is testable. */
function seeded(seed: number): () => number {
  let s = seed
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('flame-aware presets', () => {
  it('produce nothing when the flame has no transforms', () => {
    for (const id of FLAME_PRESET_IDS) {
      expect(buildFlamePreset(id, [])).toEqual([])
    }
  })

  it('are deterministic — the same flame always wires the same way', () => {
    const tf = transforms(3)
    for (const id of FLAME_PRESET_IDS) {
      expect(buildFlamePreset(id, tf)).toEqual(buildFlamePreset(id, tf))
    }
  })

  it('actually reach into the flame rather than only render settings', () => {
    const tf = transforms(3)
    for (const id of FLAME_PRESET_IDS) {
      const built = buildFlamePreset(id, tf)
      expect(built.length).toBeGreaterThan(0)
      expect(built.some((m) => m.target.kind !== 'renderSetting')).toBe(true)
    }
  })

  it('never wire a transform that does not exist', () => {
    const tf = transforms(2)
    for (const id of FLAME_PRESET_IDS) {
      for (const m of buildFlamePreset(id, tf)) {
        if ('transformIdx' in m.target) {
          expect(m.target.transformIdx).toBeLessThan(tf.length)
          expect(m.target.transformIdx).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('only name variation types the transform actually has', () => {
    const tf = transforms(2)
    const known = new Set(tf.flatMap((t) => t.variations.map((v) => v.type)))
    for (const m of buildFlamePreset('morph', tf)) {
      if (m.target.kind === 'variationWeight') {
        expect(known.has(m.target.variationType)).toBe(true)
      }
    }
  })

  it('morph yields nothing when no transform has a variation', () => {
    expect(buildFlamePreset('morph', transforms(3, 0))).toEqual([])
  })

  /*
   * A transform whose probability reaches 0 stops contributing points and the
   * branch disappears — a preset must never be able to delete part of the
   * flame it is supposed to be animating.
   */
  it('keeps probability ranges strictly above zero', () => {
    for (const id of FLAME_PRESET_IDS) {
      for (const m of buildFlamePreset(id, transforms(4))) {
        if (
          m.target.kind === 'transformProperty' &&
          m.target.property === 'probability'
        ) {
          expect(m.range[0]).toBeGreaterThan(0)
        }
      }
    }
  })

  it('never duplicates a target within one preset', () => {
    const tf = transforms(4)
    for (const id of FLAME_PRESET_IDS) {
      const keys = buildFlamePreset(id, tf).map((m) => flameTargetKey(m.target))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })
})

describe('buildPreset', () => {
  it('falls back to a working preset when the flame cannot satisfy one', () => {
    // Silently wiring nothing would look like the preset was broken.
    const built = buildPreset('morph', [])
    expect(built.length).toBeGreaterThan(0)
  })

  it('returns copies, so editing a preset cannot mutate the table', () => {
    const a = buildPreset(RENDER_PRESET_IDS[0]!, [])
    const b = buildPreset(RENDER_PRESET_IDS[0]!, [])
    a[0]!.sensitivity = 99
    expect(b[0]!.sensitivity).not.toBe(99)
  })
})

describe('randomizeMappings', () => {
  it('always wires something, even for a flame with no transforms', () => {
    expect(randomizeMappings([], seeded(1)).length).toBeGreaterThan(0)
  })

  it('is reproducible for a given source of randomness', () => {
    const tf = transforms(3)
    expect(randomizeMappings(tf, seeded(42))).toEqual(
      randomizeMappings(tf, seeded(42)),
    )
  })

  it('varies between seeds', () => {
    const tf = transforms(4)
    const a = JSON.stringify(randomizeMappings(tf, seeded(1)))
    const b = JSON.stringify(randomizeMappings(tf, seeded(999)))
    expect(a).not.toBe(b)
  })

  it('only references transforms and variations that exist', () => {
    const tf = transforms(3)
    const known = new Set(tf.flatMap((t) => t.variations.map((v) => v.type)))
    for (let seed = 0; seed < 40; seed++) {
      for (const m of randomizeMappings(tf, seeded(seed))) {
        if ('transformIdx' in m.target) {
          expect(m.target.transformIdx).toBeLessThan(tf.length)
        }
        if (m.target.kind === 'variationWeight') {
          expect(known.has(m.target.variationType)).toBe(true)
        }
      }
    }
  })

  it('keeps probability ranges above zero across many rolls', () => {
    const tf = transforms(4)
    for (let seed = 0; seed < 40; seed++) {
      for (const m of randomizeMappings(tf, seeded(seed))) {
        if (
          m.target.kind === 'transformProperty' &&
          m.target.property === 'probability'
        ) {
          expect(m.range[0]).toBeGreaterThan(0)
        }
      }
    }
  })
})

/*
 * Audio modulation writes into the LIVE descriptor, so a preset range that
 * exceeds a schema bound does not merely look wrong — it leaves the flame
 * permanently invalid, and validateFlame then throws for breeding, export and
 * the ancestry tree alike. This happened: palettePhase is 0-1, a preset drove
 * it to 1.589 assuming radians, and that flame could not be bred again.
 */
describe('preset ranges stay inside the flame schema', () => {
  const BOUNDS: Record<string, [number, number]> = {
    vibrancy: [0, 3],
    exposure: [-8, 8],
    palettePhase: [0, 1],
    contrast: [0.01, 20],
    gamma: [0.1, 8],
    highlightPower: [0, 2],
    lightPower: [0, 5],
    depthColorPower: [0, 5],
    zoom: [0.01, 500],
    skipIters: [0, 30],
  }

  const everyPreset = () => [
    ...RENDER_PRESET_IDS.map((id) => [id, buildPreset(id, [])] as const),
    ...FLAME_PRESET_IDS.map(
      (id) => [id, buildFlamePreset(id, transforms(4))] as const,
    ),
  ]

  for (const [id, mappings] of everyPreset()) {
    it(`'${id}' never drives a render setting out of range`, () => {
      for (const m of mappings) {
        if (m.target.kind !== 'renderSetting') continue
        const bound = BOUNDS[m.target.param]
        if (!bound) continue
        expect(m.range[0]).toBeGreaterThanOrEqual(bound[0])
        expect(m.range[1]).toBeLessThanOrEqual(bound[1])
      }
    })
  }

  it('randomized wirings stay in range across many rolls', () => {
    for (let seed = 0; seed < 60; seed++) {
      for (const m of randomizeMappings(transforms(4), seeded(seed))) {
        if (m.target.kind !== 'renderSetting') continue
        const bound = BOUNDS[m.target.param]
        if (!bound) continue
        expect(m.range[0]).toBeGreaterThanOrEqual(bound[0])
        expect(m.range[1]).toBeLessThanOrEqual(bound[1])
      }
    }
  })
})
