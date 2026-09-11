import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from './clone'
import { DEFAULT_SHUTTER_ANGLE, exportTickIterations, motionBlurSettings, subFrameLimit, subFrameOffsets, } from './motionBlur'
import { applyTimelineToFlameAtFrame, defaultConfig } from './timeline'
import type { TimelineTrack } from './timeline'

describe('motion blur sub-frame rule', () => {
  // These used to re-derive the arithmetic inline and import nothing, so they
  // could not catch either export path drifting from the other. Both paths
  // now call the helpers tested here.
  it('spreads samples across a 180 degree shutter, starting at the frame', () => {
    expect(subFrameOffsets(4, 180)).toEqual([0, 0.125, 0.25, 0.375])
  })

  it('scales the spread with the shutter angle', () => {
    expect(subFrameOffsets(2, 360)).toEqual([0, 0.5])
  })

  it('returns a single zero offset when blur is off or the count is invalid', () => {
    expect(subFrameOffsets(1, 180)).toEqual([0])
    expect(subFrameOffsets(0, 180)).toEqual([0])
    expect(subFrameOffsets(Number.NaN, 180)).toEqual([0])
  })

  it('splits the point budget into monotonic, complete cumulative limits', () => {
    const limits = [0, 1, 2, 3].map((i) => subFrameLimit(i, 4, 10000))
    expect(limits).toEqual([2500, 5000, 7500, 10000])
  })

  it('gives the whole budget to the only sample when blur is off', () => {
    expect(subFrameLimit(0, 1, 1000)).toBe(1000)
  })

  it('hands both export paths the same settings, shutter angle included', () => {
    expect(motionBlurSettings(16)).toEqual({
      motionBlurSamples: 16,
      shutterAngle: DEFAULT_SHUTTER_ANGLE,
    })
    expect(motionBlurSettings(0).motionBlurSamples).toBe(1)
    expect(DEFAULT_SHUTTER_ANGLE).toBe(180)
  })

  it('interpolates flame descriptor at fractional sub-frame numbers', () => {
    const flame = deepClone(examples.initExample)
    const tracks: TimelineTrack[] = [
      {
        parameterPath: 'exposure',
        keyframes: [
          { frame: 0, value: 0.2, interp: 'linear' },
          { frame: 10, value: 1.2, interp: 'linear' },
        ],
      },
    ]

    const timelineStub = {
      tracks: () => tracks,
      config: () => defaultConfig(),
    }

    // Evaluate at fractional frame 5.5
    applyTimelineToFlameAtFrame(timelineStub, flame, 5.5)
    // Linear interpolation between 0.2 and 1.2 at t=0.55 -> 0.2 + 0.55 * 1.0 = 0.75
    expect(flame.renderSettings.exposure).toBeCloseTo(0.75, 4)

    // Evaluate at fractional frame 2.25
    applyTimelineToFlameAtFrame(timelineStub, flame, 2.25)
    // 0.2 + 0.225 * 1.0 = 0.425
    expect(flame.renderSettings.exposure).toBeCloseTo(0.425, 4)
  })
})

describe('exportTickIterations', () => {
  it('stops a tick at the sub-frame share instead of the whole budget', () => {
    // 1M points per iteration, 2.5M left in this sub-frame, driver planned 30.
    expect(exportTickIterations(30, 2_500_000, 1_000_000)).toBe(3)
  })

  it('never plans more than the driver asked for', () => {
    expect(exportTickIterations(4, 50_000_000, 1_000_000)).toBe(4)
  })

  it('always runs at least one iteration, even at or past the share', () => {
    expect(exportTickIterations(30, 0, 1_000_000)).toBe(1)
    expect(exportTickIterations(30, -5, 1_000_000)).toBe(1)
  })
})
