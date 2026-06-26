import { describe, expect, it } from 'vitest'
import { collectFlameCustomVariations, createCustomVariation, importSharedVariations, persistSharedVariations, remapFlameCustomVariations, } from './CustomVariationRegistry'
import { MAX_CUSTOM_WGSL_LENGTH } from './runtimeCompiler'
import type { CustomVariationDef } from './types'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'

// Minimal flame shape: collect/remap only walk transforms[*].variations[*].type
// and never validate, so a structural stub is enough.
function flameWith(types: string[]): FlameDescriptor {
  const variations = Object.fromEntries(
    types.map((type, i) => [`v${i}`, { type, weight: 1 }]),
  )
  return {
    transforms: { t0: { variations } },
  } as unknown as FlameDescriptor
}

// Unique, compilable body per call so content-matching across the registry's
// shared module state doesn't make tests interfere.
let wgslCounter = 0

function uniqueWgsl(): string {
  return `return pos + vec2f(${wgslCounter++}.0, 0.0);`
}

function sharedDef(id: string, wgsl = uniqueWgsl()): CustomVariationDef {
  return { id, name: `Shared ${id}`, wgsl, createdAt: 0, updatedAt: 0 }
}

function variationTypesOf(flame: FlameDescriptor): string[] {
  const transforms = flame.transforms as Record<
    string,
    { variations: Record<string, { type: string }> }
  >
  return Object.values(transforms.t0?.variations ?? {}).map((v) => v.type)
}

describe('shared custom variations', () => {
  it('imports a valid shared variation and exposes it for collection', () => {
    const def = sharedDef('custom_share_valid')
    const result = importSharedVariations([def])

    expect(result.rejected).toHaveLength(0)
    expect(result.imported).toHaveLength(1)
    expect(result.imported[0]?.id).toBe('custom_share_valid')

    const collected = collectFlameCustomVariations(
      flameWith(['custom_share_valid']),
    )
    expect(collected.map((d) => d.id)).toContain('custom_share_valid')
  })

  it('re-validates untrusted code: rejects banned/unknown identifiers', () => {
    const result = importSharedVariations([
      sharedDef('custom_share_banned', 'return textureSample(pos);'),
    ])
    expect(result.imported).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects over-length code', () => {
    const result = importSharedVariations([
      sharedDef('custom_share_long', 'a'.repeat(MAX_CUSTOM_WGSL_LENGTH + 1)),
    ])
    expect(result.imported).toHaveLength(0)
    expect(result.rejected).toHaveLength(1)
  })

  it('rejects malformed and non-custom ids', () => {
    const result = importSharedVariations([
      {},
      { id: 'not_custom', name: 'x', wgsl: 'return pos;' },
    ])
    expect(result.imported).toHaveLength(0)
    expect(result.rejected).toHaveLength(2)
  })

  it('re-keys on id collision with different code and reports a remap', () => {
    const id = 'custom_share_collide'
    importSharedVariations([sharedDef(id)])

    const result = importSharedVariations([sharedDef(id)])
    expect(result.imported).toHaveLength(1)
    const newId = result.remap[id]
    expect(newId).toBeDefined()
    expect(newId).not.toBe(id)
    expect(result.imported[0]?.id).toBe(newId)
  })

  it('is a no-op when the same id and code are re-imported', () => {
    const id = 'custom_share_same'
    const code = uniqueWgsl()
    importSharedVariations([sharedDef(id, code)])
    const result = importSharedVariations([sharedDef(id, code)])
    expect(result.imported).toHaveLength(0)
    expect(result.alreadyOwned).toHaveLength(0)
    expect(result.rejected).toHaveLength(0)
    expect(result.remap).toEqual({})
  })

  it('detects a saved variation with identical code as already-owned and remaps to it', () => {
    const code = uniqueWgsl()
    const created = createCustomVariation('My Saved Variation', code)
    expect(created.success).toBe(true)
    if (!created.success) throw new Error('setup: createCustomVariation failed')
    const savedId = created.def.id

    const result = importSharedVariations([
      sharedDef('custom_incoming_dup', code),
    ])
    expect(result.imported).toHaveLength(0)
    expect(result.alreadyOwned.map((d) => d.id)).toContain(savedId)
    // Flame's reference is pointed at the existing copy; nothing overwritten.
    expect(result.remap['custom_incoming_dup']).toBe(savedId)
  })

  it('remapFlameCustomVariations rewrites references and is pure', () => {
    const flame = flameWith(['custom_old', 'general'])
    const remapped = remapFlameCustomVariations(flame, {
      custom_old: 'custom_new',
    })
    expect(variationTypesOf(remapped)).toEqual(['custom_new', 'general'])
    // input untouched
    expect(variationTypesOf(flame)).toEqual(['custom_old', 'general'])
  })

  it('remapFlameCustomVariations returns the same object for an empty remap', () => {
    const flame = flameWith(['custom_x'])
    expect(remapFlameCustomVariations(flame, {})).toBe(flame)
  })

  it('persistSharedVariations ignores unknown ids', () => {
    expect(() => {
      persistSharedVariations(['custom_nonexistent'])
    }).not.toThrow()
  })
})
