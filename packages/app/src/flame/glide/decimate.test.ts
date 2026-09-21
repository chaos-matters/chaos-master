import { describe, expect, it } from 'vitest'
import { reduceTrack, reductionError } from './decimate'
import type { Keyframe } from '@/flame/schema/timeline'

function bake(fn: (t: number) => number, frames: number): Keyframe[] {
  const keyframes: Keyframe[] = []
  for (let frame = 0; frame <= frames; frame++) {
    keyframes.push({
      frame,
      value: fn(frame / frames),
      easing: 'linear',
      interp: 'linear',
    })
  }
  return keyframes
}

describe('reduceTrack', () => {
  it('collapses a straight line to its two ends', () => {
    const reduced = reduceTrack(
      bake((t) => 2 + 3 * t, 48),
      1e-6,
    )
    expect(reduced).toHaveLength(2)
    expect(reduced[0]!.frame).toBe(0)
    expect(reduced[1]!.frame).toBe(48)
  })

  it('keeps a smooth curve within tolerance while removing most keyframes', () => {
    const original = bake((t) => Math.sin(t * Math.PI), 48)
    const reduced = reduceTrack(original, 1e-2)
    expect(reduced.length).toBeLessThan(original.length / 2)
    expect(reductionError(original, reduced)).toBeLessThanOrEqual(1e-2)
  })

  it('never drops the endpoints', () => {
    const original = bake((t) => Math.exp(t * 4), 32)
    const reduced = reduceTrack(original, 5)
    expect(reduced[0]).toEqual(original[0])
    expect(reduced.at(-1)).toEqual(original.at(-1))
  })

  it('leaves a short or non-numeric track alone', () => {
    const two = bake((t) => t, 1)
    expect(reduceTrack(two, 1)).toEqual(two)
    const strings: Keyframe[] = [
      { frame: 0, value: 'light', easing: 'linear', interp: 'linear' },
      { frame: 5, value: 'paint', easing: 'linear', interp: 'linear' },
      { frame: 9, value: 'light', easing: 'linear', interp: 'linear' },
    ]
    expect(reduceTrack(strings, 1)).toEqual(strings)
  })

  it('does nothing at a zero tolerance', () => {
    const original = bake((t) => Math.sin(t * Math.PI), 12)
    expect(reduceTrack(original, 0)).toEqual(original)
  })
})
