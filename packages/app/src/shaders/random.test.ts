import { tgpu } from 'typegpu'
import { u32 } from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID, legacyRandomOutputSlot, next, RENDERER_RANDOM_IMPLEMENTATION_IDS, } from './random'

const sampleNext = tgpu
  .fn(
    [],
    u32,
  )(() => next())
  .$name('sampleNext')

function resolveNext(legacy?: boolean): string {
  return tgpu.resolve(
    [
      legacy === undefined
        ? sampleNext
        : sampleNext.with(legacyRandomOutputSlot, legacy),
    ],
    { names: 'strict' },
  )
}

describe('renderer random implementation', () => {
  it('defaults to the canonical xoroshiro64** output', () => {
    expect(DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID).toBe(
      RENDERER_RANDOM_IMPLEMENTATION_IDS.canonical,
    )
    expect(resolveNext()).toBe(resolveNext(false))
  })

  it('constant-folds the legacy post-transition output into distinct WGSL', () => {
    const canonical = resolveNext(false)
    const legacy = resolveNext(true)

    expect(canonical).not.toBe(legacy)
    expect(canonical).toContain('2654435771u')
    expect(legacy).not.toContain('2654435771u')
  })
})
