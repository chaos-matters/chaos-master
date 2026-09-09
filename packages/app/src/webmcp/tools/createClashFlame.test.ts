import { describe, expect, it } from 'vitest'
import { createClashFlame } from './createClashFlame'
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
