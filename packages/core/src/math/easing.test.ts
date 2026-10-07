import { describe, expect, it } from 'vitest'
import { applyEasing, catmullRom, clamp, lerp } from './easing'
import type { EasingCurve } from '../schema/timeline'

const CURVES: EasingCurve[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'bounce',
  'elastic',
]

describe('applyEasing', () => {
  it.each(CURVES)('%s starts at exactly 0 and ends at 1', (curve) => {
    expect(applyEasing(0, curve)).toBe(0)
    expect(applyEasing(1, curve)).toBeCloseTo(1, 12)
  })

  it.each(['linear', 'easeIn', 'easeOut', 'easeInOut'] as const)(
    '%s never goes backwards',
    (curve) => {
      // bounce and elastic overshoot and return by design, so they are excluded.
      const samples = Array.from({ length: 21 }, (_, i) =>
        applyEasing(i / 20, curve),
      )
      for (let i = 1; i < samples.length; i++)
        expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!)
    },
  )

  it('pins each curve at an interior point', () => {
    expect(applyEasing(0.5, 'linear')).toBe(0.5)
    expect(applyEasing(0.5, 'easeIn')).toBe(0.125)
    expect(applyEasing(0.5, 'easeOut')).toBe(0.875)
    expect(applyEasing(0.25, 'easeInOut')).toBe(0.0625)
    expect(applyEasing(0.75, 'easeInOut')).toBe(0.9375)
    expect(applyEasing(0.2, 'bounce')).toBeCloseTo(0.3025, 12)
    expect(applyEasing(0.5, 'elastic')).toBeCloseTo(
      1 + 2 ** -5 * Math.sin((4.25 * (2 * Math.PI)) / 3),
      12,
    )
  })

  it('treats an unknown curve as linear', () => {
    expect(applyEasing(0.3, 'nope' as EasingCurve)).toBe(0.3)
  })
})

describe('lerp, clamp and catmullRom', () => {
  it('lerp interpolates between the ends', () => {
    expect(lerp(2, 10, 0.25)).toBe(4)
  })

  it('clamp pins to the range', () => {
    expect([clamp(-1, 0, 1), clamp(0.4, 0, 1), clamp(2, 0, 1)]).toEqual([
      0, 0.4, 1,
    ])
  })

  it('catmullRom passes through p1 at t=0 and p2 at t=1', () => {
    expect(catmullRom(-3, 1, 5, 7, 0)).toBe(1)
    expect(catmullRom(-3, 1, 5, 7, 1)).toBe(5)
    expect(catmullRom(0, 0, 1, 1, 0.5)).toBe(0.5)
  })
})
