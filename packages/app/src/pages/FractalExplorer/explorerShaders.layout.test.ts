import { tgpu } from 'typegpu'
import * as d from 'typegpu/data'
import { describe, expect, it } from 'vitest'
import { colourLayout, iterateEntry, iterateLayout, IterateUniforms, OrbitInfo, presentLayout, } from './explorerShaders'

const roundUp = (n: number, k: number) => Math.ceil(n / k) * k

function undecorated(schema: d.AnyWgslData): d.AnyWgslData {
  return d.isDecorated(schema) ? (schema.inner as d.AnyWgslData) : schema
}

/**
 * WGSL's layout rules for the uniform address space, as they stand without
 * the uniform_buffer_standard_layout extension. Chrome shipped that
 * extension in version 144; Safari has not, and WebKit's WGSL validator
 * (AttributeValidator::validateAlignment) rejects a shader that breaks any
 * of these, so no pipeline that uses it is ever built:
 *
 * - a member of struct or array type starts on a multiple of 16 bytes,
 * - a member of struct type leaves its size, rounded up to 16, before the
 *   next member,
 * - an array's stride is a multiple of 16.
 *
 * Offsets come from TypeGPU, which writes the buffer and emits the matching
 * `@align` and `@size` attributes.
 */
function uniformLayoutProblems(
  schema: d.AnyWgslData,
  path = 'uniform',
): string[] {
  const type = undecorated(schema)
  if (d.isWgslArray(type)) {
    const element = type.elementType as d.AnyWgslData
    const stride = roundUp(d.sizeOf(element), d.alignmentOf(element))
    return [
      ...(stride % 16 === 0
        ? []
        : [`${path}: array stride ${stride} is not a multiple of 16`]),
      ...uniformLayoutProblems(element, `${path}[]`),
    ]
  }
  if (!d.isWgslStruct(type)) return []
  const members = Object.entries(type.propTypes) as [string, d.AnyWgslData][]
  const offsetOf = (key: string) =>
    d.memoryLayoutOf(type, (s) => (s as Record<string, unknown>)[key]).offset
  return members.flatMap(([key, member], i) => {
    const inner = undecorated(member)
    const at = offsetOf(key)
    const aggregate = d.isWgslStruct(inner) || d.isWgslArray(inner)
    const required = aggregate
      ? roundUp(d.alignmentOf(inner), 16)
      : d.alignmentOf(inner)
    const problems: string[] = []
    if (at % required !== 0) {
      problems.push(`${path}.${key} at ${at} is not a multiple of ${required}`)
    }
    const next = members[i + 1]
    if (d.isWgslStruct(inner) && next) {
      const room = offsetOf(next[0]) - at
      const needed = roundUp(d.sizeOf(inner), 16)
      if (room < needed) {
        problems.push(`${path}.${key} leaves ${room} bytes, not ${needed}`)
      }
    }
    return [...problems, ...uniformLayoutProblems(member, `${path}.${key}`)]
  })
}

describe('explorer uniform buffers', () => {
  it('the check finds what WebKit rejects in the layout that failed on iOS', () => {
    // IterateUniforms as it was when Safari showed no picture: the orbit
    // records packed straight after `flags`.
    const packed = d.struct({
      size: d.vec2u,
      centerOffset: d.vec2f,
      spacingMant: d.f32,
      spacingExp: d.i32,
      maxIterations: d.u32,
      stepBudget: d.u32,
      flags: d.u32,
      orbit0: OrbitInfo,
      orbit1: OrbitInfo,
    })
    expect(uniformLayoutProblems(packed)).toEqual([
      'uniform.orbit0 at 36 is not a multiple of 16',
      'uniform.orbit0 leaves 24 bytes, not 32',
      'uniform.orbit1 at 60 is not a multiple of 16',
    ])
  })

  it.each([
    ['iterate', iterateLayout.entries],
    ['colour', colourLayout.entries],
    ['present', presentLayout.entries],
  ])(
    'the %s pass keeps the uniform layout rules Safari enforces',
    (_pass, entries) => {
      const uniforms = Object.entries(entries).flatMap(([key, entry]) =>
        'uniform' in entry
          ? [[key, entry.uniform as d.AnyWgslData] as const]
          : [],
      )
      expect(uniforms).toHaveLength(1)
      for (const [key, schema] of uniforms) {
        expect(uniformLayoutProblems(schema, key)).toEqual([])
      }
    },
  )

  it('puts each orbit record on a 16-byte boundary in the buffer and in WGSL alike', () => {
    expect(d.memoryLayoutOf(IterateUniforms, (u) => u.flags).offset).toBe(32)
    expect(d.memoryLayoutOf(IterateUniforms, (u) => u.orbit0.base).offset).toBe(
      48,
    )
    expect(
      d.memoryLayoutOf(IterateUniforms, (u) => u.orbit1.minLevel).offset,
    ).toBe(100)
    expect(d.sizeOf(IterateUniforms)).toBe(112)
    const wgsl = tgpu.resolve([iterateEntry], { names: 'strict' })
    expect(wgsl).toContain('@align(16) orbit0: OrbitInfo')
    expect(wgsl).toContain('@align(16) orbit1: OrbitInfo')
  })
})
