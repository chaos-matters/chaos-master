import { describe, expect, it } from 'vitest'
import { extractFlameUniforms } from './transformFunction'
import { extractFlameUniforms3D, resolveVariationType3D, } from './transformFunction3D'
import type { FlameDescriptor, TransformFunction } from './schema/flameSchema'

describe('2D transform registry boundary', () => {
  it('does not materialize inherited registry keys into GPU uniforms', () => {
    const transform = {
      probability: 1,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: 0 },
      colorSpeed: 0.4,
      visible: true,
      variations: {
        safe_variation: { type: 'linearVar', weight: 1, visible: true },
        hostile_variation: { type: 'constructor', weight: 1, visible: true },
      },
    } as unknown as TransformFunction

    const uniforms = extractFlameUniforms({
      transforms: {
        safe_transform: transform,
      } as unknown as FlameDescriptor['transforms'],
    }) as Record<string, Record<string, unknown>>

    expect(uniforms.flamesafe_transform).toHaveProperty(
      'variationsafe_variation',
    )
    expect(uniforms.flamesafe_transform).not.toHaveProperty(
      'variationhostile_variation',
    )
  })
})

// validateFlame refuses a type named after anything an object inherits now
// ('constructor', 'toString', ...), but a flame reaches the renderer by other
// paths too, so the lookups stay own-key. `in` finds such a name on every
// plain object: the 2D to 3D map resolved 'constructor' to the Object
// function, and it reached the uniforms.
describe('3D transform registry boundary', () => {
  it('resolves no inherited registry key to a variation', () => {
    const inherited = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
    expect(
      inherited.filter((type) => resolveVariationType3D(type) !== undefined),
    ).toEqual([])
  })

  it('does not materialize inherited registry keys into GPU uniforms', () => {
    const identity3D = {
      ...{ a: 1, b: 0, c: 0, d: 0, e: 0, f: 1 },
      ...{ g: 0, h: 0, i: 0, j: 0, k: 1, l: 0 },
    }
    const transform = {
      probability: 1,
      preAffine: identity3D,
      postAffine: identity3D,
      color: { x: 0, y: 0 },
      colorSpeed: 0.4,
      visible: true,
      variations: {
        safe_variation: { type: 'linear3D', weight: 1, visible: true },
        hostile_variation: { type: 'constructor', weight: 1, visible: true },
      },
    } as unknown as TransformFunction

    const uniforms = extractFlameUniforms3D({
      transforms: {
        safe_transform: transform,
      } as unknown as FlameDescriptor['transforms'],
    }) as Record<string, Record<string, unknown>>

    expect(uniforms.flamesafe_transform).toHaveProperty(
      'variationsafe_variation',
    )
    expect(uniforms.flamesafe_transform).not.toHaveProperty(
      'variationhostile_variation',
    )
  })
})
