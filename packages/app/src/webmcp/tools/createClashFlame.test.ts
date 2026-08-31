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
        t1: { postAffine: { e: 0, f: 0 } },
      },
    } as unknown as FlameDescriptor

    const flameB = {
      version: '1',
      metadata: { name: 'FlameB' },
      renderSettings: { zoom: 1, exposure: 0.8 },
      transforms: {
        t1: { postAffine: { e: 0, f: 0 } },
      },
    } as unknown as FlameDescriptor

    const result = createClashFlame.execute({
      flameA,
      flameB,
      distance: 3.0,
    }) as any
    expect(result.success).toBe(true)

    const clash = result.clashFlame as FlameDescriptor
    expect(clash.metadata?.name).toBe('Clash: FlameA vs FlameB')
    expect(clash.renderSettings.exposure).toBe(0.8) // max of 0.5 and 0.8

    const transforms = clash.transforms as Record<string, any>
    expect(Object.keys(transforms).length).toBe(2)

    // Check translations
    expect(transforms['p1_t1_0'].postAffine.e).toBe(-3.0)
    expect(transforms['p2_t1_0'].postAffine.e).toBe(3.0)
  })
})
