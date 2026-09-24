import { describe, expect, it } from 'vitest'
import { initExample3D } from '@/flame/examples/initExample3D'
import { createClashFlame } from './createClashFlame'
import { simulateClash } from './simulateClash'
import type { SimulateClashResult } from './simulateClash'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

describe('createClashFlame tool', () => {
  it('merges two flames side-by-side', () => {
    const flameA = {
      version: '1',
      metadata: { name: 'FlameA' },
      renderSettings: { zoom: 1, exposure: 0.5 },
      transforms: {
        t1: { postAffine: { c: 0, f: 0 } },
      },
    } as unknown as FlameDescriptor

    const flameB = {
      version: '1',
      metadata: { name: 'FlameB' },
      renderSettings: { zoom: 1, exposure: 0.8 },
      transforms: {
        t1: { postAffine: { c: 0, f: 0 } },
      },
    } as unknown as FlameDescriptor

    const result = createClashFlame.execute(
      {
        flameA,
        flameB,
        distance: 3.0,
      },
      { signal: new AbortController().signal },
    ) as { success: boolean; clashFlame: FlameDescriptor }
    expect(result.success).toBe(true)

    const clash = result.clashFlame
    expect(clash.metadata?.name).toBe('Clash: FlameA vs FlameB')
    expect(clash.renderSettings.exposure).toBe(0.8) // max of 0.5 and 0.8

    const transforms = clash.transforms as Record<
      string,
      { postAffine: { c: number } }
    >
    expect(Object.keys(transforms).length).toBe(2)

    // Check translations
    expect(transforms['p1_t1_0']!.postAffine.c).toBe(-3.0)
    expect(transforms['p2_t1_0']!.postAffine.c).toBe(3.0)
  })

  it('merges two flames in 3D volumetric space', () => {
    const flameA = {
      version: '1',
      metadata: { name: 'FlameA' },
      renderSettings: { exposure: 0.5 },
      transforms: {
        t1: { postAffine: { a: 1, e: 1, k: 1 } },
      },
    } as unknown as FlameDescriptor

    const flameB = {
      version: '1',
      metadata: { name: 'FlameB' },
      renderSettings: { exposure: 0.8 },
      transforms: {
        t1: { postAffine: { a: 1, e: 1, k: 1 } },
      },
    } as unknown as FlameDescriptor

    const result = createClashFlame.execute(
      {
        flameA,
        flameB,
        dimensions: 3,
        separation: 2.5,
        axis: 'x',
      },
      {},
    ) as { success: boolean; clashFlame: FlameDescriptor }

    expect(result.success).toBe(true)
    const clash = result.clashFlame
    expect(clash.renderSettings.dimensions).toBe(3)
    expect(clash.renderSettings.camera3D).toBeDefined()
    expect(clash.metadata?.name).toBe('3D Clash: FlameA vs FlameB')

    const transforms = clash.transforms as Record<
      string,
      { postAffine: { d: number } }
    >
    expect(transforms['p1_t1_0']!.postAffine.d).toBe(-2.5)
    expect(transforms['p2_t1_0']!.postAffine.d).toBe(2.5)
  })

  // A transform's colour is an OkLab (a, b) pair. The tint wrote the hue
  // coordinate into `a` and 1.0 into `b`, so both teams landed in the same
  // yellow-orange (hues 79.4 / 68.8 deg measured on the GPU).
  it('tints the two 3D teams in clearly different OkLab hues', () => {
    const fighter = (name: string) =>
      ({
        version: '1',
        metadata: { name },
        renderSettings: { exposure: 0.5 },
        transforms: Object.fromEntries(
          [0, 1, 2].map((i) => [
            `t${i}`,
            {
              probability: 1,
              postAffine: { a: 1, e: 1, k: 1 },
              color: { x: 0.1 * i, y: -0.2 },
            },
          ]),
        ),
      }) as unknown as FlameDescriptor
    const { clashFlame } = createClashFlame.execute(
      { flameA: fighter('A'), flameB: fighter('B'), dimensions: 3 },
      {},
    ) as { clashFlame: FlameDescriptor }

    const hues = (prefix: string) =>
      Object.entries(clashFlame.transforms)
        .filter(([id]) => id.startsWith(prefix))
        .map(([, t]) => {
          const { x, y } = t.color
          // A real hue, not a blow-out: chroma in the range the editor uses.
          expect(Math.hypot(x, y)).toBeGreaterThan(0.1)
          expect(Math.hypot(x, y)).toBeLessThan(0.5)
          return (Math.atan2(y, x) * 180) / Math.PI
        })
    const gap = (p: number, q: number) => {
      const d = Math.abs(p - q) % 360
      return d > 180 ? 360 - d : d
    }
    const [a, b] = [hues('p1_'), hues('p2_')]
    for (const hueA of a) {
      for (const hueB of b) expect(gap(hueA, hueB)).toBeGreaterThan(120)
    }
  })

  // The hue is a fraction of a turn, so the per-transform spread wraps round
  // the circle: clamped at 0, two of three transforms shared one hue.
  it('defaults the arena clash to the two team colours', () => {
    const fighter = initExample3D as FlameDescriptor
    const sim = simulateClash.execute(
      { flameA: fighter, flameB: fighter, dimensions: 3, rounds: 1 },
      {},
    ) as SimulateClashResult
    const flame = sim.rounds[0]!.clashFlame
    const hue = (prefix: string) => {
      const t = Object.entries(flame.transforms).find(([id]) =>
        id.startsWith(prefix),
      )![1]
      return ((Math.atan2(t.color.y, t.color.x) * 180) / Math.PI + 360) % 360
    }
    expect(hue('p1_')).toBeCloseTo(47.51 - 14.4, 0)
    expect(hue('p2_')).toBeCloseTo(236.18 - 14.4, 0)
  })

  it('spreads a team hue round the circle, not against 0 or 1', () => {
    const fighter = {
      version: '1',
      metadata: { name: 'A' },
      renderSettings: { exposure: 0.5 },
      transforms: Object.fromEntries(
        [0, 1, 2].map((i) => [
          `t${i}`,
          { probability: 1, postAffine: { a: 1, e: 1, k: 1 } },
        ]),
      ),
    } as unknown as FlameDescriptor
    const { clashFlame } = createClashFlame.execute(
      { flameA: fighter, flameB: fighter, dimensions: 3, tintA: 0 },
      {},
    ) as { clashFlame: FlameDescriptor }

    const turns = Object.entries(clashFlame.transforms)
      .filter(([id]) => id.startsWith('p1_'))
      .map(([, t]) => {
        const turn = Math.atan2(t.color.y, t.color.x) / (2 * Math.PI)
        return Math.round(((turn + 1) % 1) * 100) / 100
      })
    expect(turns).toEqual([0.96, 0, 0.04])
  })

  it('calculates power-weighted probability split', async () => {
    const { calculatePowerSplit } = await import('./createClashFlame')
    const flameA = {
      version: '1',
      transforms: { t1: { probability: 2 } },
    } as unknown as FlameDescriptor
    const flameB = {
      version: '1',
      transforms: { t1: { probability: 3 } },
    } as unknown as FlameDescriptor

    const split = calculatePowerSplit(flameA, flameB, 100, 300)
    expect(split.splitA).toBeCloseTo(0.25)
    expect(split.splitB).toBeCloseTo(0.75)
    expect(split.sumA).toBe(2)
    expect(split.sumB).toBe(3)
  })

  it('handles missing input gracefully', () => {
    const result = createClashFlame.execute({}, {}) as { error: string }
    expect(result.error).toBeDefined()
  })
})
