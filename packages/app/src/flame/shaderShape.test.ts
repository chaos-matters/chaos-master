/**
 * shaderShapeOf: the part of a flame's transforms a compiled IFS shader bakes
 * in, and so the part whose change must rebuild the pipeline.
 */
import { describe, expect, it } from 'vitest'
import { deepClone } from '@/utils/clone'
import { examples } from './examples'
import { shaderShapeOf } from './shaderShape'
import type { TransformRecord } from './schema/flameSchema'

const galaxy = examples.example37.transforms
const shape = (transforms: TransformRecord) =>
  JSON.stringify(shaderShapeOf(transforms))

/** The first transform of a copy, to change one thing on. */
function editFirst(edit: (t: TransformRecord[keyof TransformRecord]) => void) {
  const copy = deepClone(galaxy)
  const first = Object.values(copy)[0]
  if (!first) throw new Error('example37 has no transforms')
  edit(first)
  return copy
}

describe('shaderShapeOf', () => {
  it('lists every transform and variation by id and type, in order', () => {
    expect(shaderShapeOf(galaxy)).toEqual(
      Object.entries(galaxy).map(([tid, t]) => ({
        tid,
        variations: Object.entries(t.variations).map(([vid, v]) => ({
          vid,
          type: v.type,
        })),
      })),
    )
  })

  it('ignores what the shader reads from uniforms', () => {
    const moved = editFirst((t) => {
      t.probability *= 3
      t.preAffine.a += 0.5
      t.color = { x: 0.3, y: -0.2 }
      for (const v of Object.values(t.variations)) v.weight *= 0.5
    })
    expect(shape(moved)).toBe(shape(galaxy))
  })

  it('changes when a transform comes from a 2D fighter, and only then', () => {
    // A Flame Clash fight flame marks a 2D fighter's transforms: the 3D
    // pipeline then runs their 2D variations as their own 2D functions.
    const marked = editFirst((t) => {
      t.from2D = true
    })
    expect(shape(marked)).not.toBe(shape(galaxy))
    expect(shape(galaxy)).not.toContain('from2D')
  })

  it('changes with a variation type', () => {
    const retyped = editFirst((t) => {
      const v = Object.values(t.variations)[0]
      if (v) v.type = v.type === 'linear3D' ? 'spherical3D' : 'linear3D'
    })
    expect(shape(retyped)).not.toBe(shape(galaxy))
  })
})
