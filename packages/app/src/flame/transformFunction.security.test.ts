import { describe, expect, it } from 'vitest'
import { extractFlameUniforms } from './transformFunction'
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
