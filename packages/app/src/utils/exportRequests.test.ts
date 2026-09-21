import { describe, expect, it } from 'vitest'
import { defaultExportFrameRange, EXPORT_MAX_FRAMES, resolveExportFrameRange, } from './exportRequests'
import { defaultConfig } from './timeline'
import type { NormalizedAnimationRender } from './exportRequests'
import type { TimelineTrack } from './timeline'

function track(...frames: number[]): TimelineTrack {
  return {
    parameterPath: 'renderSettings.camera.zoom',
    keyframes: frames.map((frame) => ({ frame, value: 1 })),
  }
}

function request(
  overrides: Partial<NormalizedAnimationRender> = {},
): NormalizedAnimationRender {
  return {
    width: 2560,
    height: 1440,
    fps: 60,
    frameStart: undefined,
    frameEnd: undefined,
    codec: 'avc',
    quality: 0.9,
    ...overrides,
  }
}

describe('the default export frame range', () => {
  it('ends at the last keyframe, not at the configured end', () => {
    expect(
      defaultExportFrameRange([track(0, 120), track(45)], defaultConfig()),
    ).toEqual({ frameStart: 0, frameEnd: 120 })
  })

  it('falls back to the configured end when nothing is keyframed', () => {
    expect(defaultExportFrameRange([], defaultConfig())).toEqual({
      frameStart: 0,
      frameEnd: 90,
    })
  })
})

describe('resolving a scripted frame range', () => {
  it('takes the timeline default when the caller omits the range', () => {
    expect(
      resolveExportFrameRange(request(), [track(0, 480)], defaultConfig()),
    ).toEqual({ frameStart: 0, frameEnd: 480 })
  })

  it('keeps an explicit range', () => {
    expect(
      resolveExportFrameRange(
        request({ frameStart: 30, frameEnd: 210 }),
        [track(0, 480)],
        defaultConfig(),
      ),
    ).toEqual({ frameStart: 30, frameEnd: 210 })
  })

  it('never returns an empty range for a flame with no keyframes', () => {
    // The end frame the timeline supplies can sit at or before the start; a
    // job with frameEnd <= frameStart renders nothing at all, and the script
    // would collect an unplayable file instead of an error.
    const config = { ...defaultConfig(), startFrame: 90, endFrame: 90 }

    expect(resolveExportFrameRange(request(), [], config)).toEqual({
      frameStart: 90,
      frameEnd: 91,
    })
  })

  it('caps a range the timeline made too long', () => {
    const { frameStart, frameEnd } = resolveExportFrameRange(
      request(),
      [track(0, 100_000)],
      defaultConfig(),
    )

    expect(frameEnd - frameStart + 1).toBe(EXPORT_MAX_FRAMES)
  })
})
