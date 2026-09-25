/**
 * `uniformsForPipeline`: what both IFS pipelines write when a flame and the
 * pipeline it runs on disagree about which transforms exist.
 */
import { describe, expect, it } from 'vitest'
import { uniformsForPipeline } from './transformFunction'

describe('uniformsForPipeline', () => {
  const template = {
    flameA: { probability: 0.5, colorSpeed: 0.4 },
    flameB: { probability: 0.5, colorSpeed: 0.2 },
  }

  it('takes every value the flame has', () => {
    const uniforms = {
      flameA: { probability: 0.25, colorSpeed: 1 },
      flameB: { probability: 0.75, colorSpeed: 0 },
    }
    expect(uniformsForPipeline(uniforms, template)).toEqual(uniforms)
  })

  it('writes a transform the flame lacks as its template at probability 0', () => {
    const uniforms = { flameA: { probability: 1, colorSpeed: 1 } }
    expect(uniformsForPipeline(uniforms, template)).toEqual({
      flameA: { probability: 1, colorSpeed: 1 },
      flameB: { probability: 0, colorSpeed: 0.2 },
    })
  })

  it('drops what the pipeline was not built for', () => {
    const uniforms = {
      flameA: { probability: 1 },
      flameB: { probability: 0 },
      flameC: { probability: 1 },
    }
    expect(Object.keys(uniformsForPipeline(uniforms, template))).toEqual([
      'flameA',
      'flameB',
    ])
  })
})
