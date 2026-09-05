import { describe, expect, it } from 'vitest'
import { examples } from '@/flame/examples'
import { deepClone } from './clone'
import { applyTimelineToFlameAtFrame, defaultConfig } from './timeline'
import type { TimelineTrack } from './timeline'

describe('motionBlur temporal calculations', () => {
  it('calculates expected sub-frame offsets for 180 degree shutter', () => {
    const shutterAngle = 180
    const shutterDuration = shutterAngle / 360 // 0.5 frame duration
    const motionBlurSamples = 4
    const frame = 10

    const subOffsets = Array.from({ length: motionBlurSamples }, (_, idx) => {
      return (idx / motionBlurSamples) * shutterDuration
    })

    expect(subOffsets).toEqual([0, 0.125, 0.25, 0.375])

    const subFrames = subOffsets.map((offset) => frame + offset)
    expect(subFrames).toEqual([10, 10.125, 10.25, 10.375])
  })

  it('computes monotonic and complete cumulative point limits', () => {
    const totalLimit = 10000
    const motionBlurSamples = 4

    const subLimits = Array.from({ length: motionBlurSamples }, (_, idx) => {
      return Math.round(((idx + 1) / motionBlurSamples) * totalLimit)
    })

    expect(subLimits).toEqual([2500, 5000, 7500, 10000])
    expect(subLimits[subLimits.length - 1]).toBe(totalLimit)
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
