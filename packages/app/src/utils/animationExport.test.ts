import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseFlameXml } from '@/flame/flameXml'
import { setAccumulatedPointCountGlobal, setAnimationExportProgress, setAnimationExportRunning, setQualityPointCountLimit, } from '@/flame/renderStats'
import { createAnimationExport, holdPlayheadOnExportFrame, } from './animationExport'
import { createTimelineState } from './timeline'
import type { AnimationExportConfig } from './animationExport'
import type { FlameDescriptor } from './timeline'

const encoder = {
  codec: 'avc1.640028',
  usedFallback: false,
  encodeFrame: vi.fn(() => Promise.resolve()),
  finalize: vi.fn(),
  cancel: vi.fn(),
}
vi.mock('./videoEncoder', () => ({
  createVideoEncoder: () => Promise.resolve(encoder),
}))
const snapshot = vi.hoisted(() => ({
  canvasSnapshot: vi.fn(() => Promise.resolve({ close: () => undefined })),
}))
vi.mock('./canvasSnapshot', () => ({
  snapshotCanvas: snapshot.canvasSnapshot,
}))

const flame: FlameDescriptor =
  parseFlameXml(`<?xml version="1.0" encoding="UTF-8"?>
<flame name="Exported" version="Apophysis 7X" size="800 600"
       center="0 0" scale="200" oversample="1" filter="0.5"
       quality="100" background="0 0 0" brightness="4" gamma="2.2">
  <xform weight="1" color="0" linear="1" coefs="1 0 0 1 0 0"/>
</flame>`)

const config: AnimationExportConfig = {
  quality: 4,
  width: 640,
  height: 360,
  fps: 30,
  frameStart: 10,
  frameEnd: 20,
  playCount: 1,
  codec: 'avc',
  embedMetadata: false,
  session: undefined,
  motionBlurSamples: 4,
  shutterAngle: 180,
}

type ExportInfo = { finalImageReady: boolean }
type ExportImage = (canvas: HTMLCanvasElement, info?: ExportInfo) => void

/** The canvas the renderer hands the export each tick. */
const renderedCanvas = {} as HTMLCanvasElement

/** An export over a real timeline, with the renderer's callback in hand. */
const startExport = (
  timeline: ReturnType<typeof createTimelineState>,
  overrides: Partial<AnimationExportConfig> = {},
) => {
  let exportImage: ExportImage | undefined
  const draft = structuredClone(flame)
  const running = createAnimationExport(
    { ...config, ...overrides },
    { width: 640, height: 360 } as HTMLCanvasElement,
    timeline,
    flame,
    (setter) => {
      setter(draft)
    },
    (callback) => {
      // Called the way a Solid setter is: with a function that returns the
      // callback, or with nothing to clear it.
      exportImage = callback
        ? (callback as unknown as () => ExportImage)()
        : undefined
    },
  )
  return {
    ...running,
    renderTick: (info?: ExportInfo) => exportImage?.(renderedCanvas, info),
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  setAccumulatedPointCountGlobal(0)
  setQualityPointCountLimit(() => () => 0)
  vi.clearAllMocks()
})

describe('cancelling an animation export', () => {
  it('puts the playhead back on the frame the user was on', async () => {
    // Motion blur poses sub-frames, so the export leaves the playhead at
    // frame + offset. Left there, the next auto-keyframe landed on a
    // fractional frame, and a file saved afterwards loaded with no tracks.
    const timeline = createTimelineState()
    timeline.setCurrentFrame(7)
    const running = startExport(timeline)
    await settle()
    expect(timeline.currentFrame()).toBe(10)

    // The first sub-frame has its share of points, so the next one is posed.
    setQualityPointCountLimit(() => () => 1000)
    setAccumulatedPointCountGlobal(1000)
    running.renderTick()
    expect(timeline.currentFrame()).toBe(10.125)

    running.cancel()

    // At once: the renderer may never call back again to let the loop see it.
    expect(timeline.currentFrame()).toBe(7)
    // And when it does, the cleanup it runs keeps it there.
    running.renderTick()
    await expect(running.promise).resolves.toBeInstanceOf(Blob)
    expect(timeline.currentFrame()).toBe(7)
    expect(encoder.cancel).toHaveBeenCalledOnce()
  })
})

describe('capturing a rendered frame', () => {
  it('encodes a copy of the canvas, never the canvas itself', async () => {
    // A bitmap taken straight from a WebGPU canvas can be a live view of it
    // on some drivers, and the video came out black. The main-canvas path is
    // the one a user gets by default, and it kept the unsafe call longest.
    const timeline = createTimelineState()
    const running = startExport(timeline, { motionBlurSamples: 1 })
    await settle()

    setQualityPointCountLimit(() => () => 1000)
    setAccumulatedPointCountGlobal(1000)
    running.renderTick({ finalImageReady: true })
    await settle()

    expect(snapshot.canvasSnapshot).toHaveBeenCalledExactlyOnceWith(
      renderedCanvas,
      640,
      360,
    )
    expect(encoder.encodeFrame).toHaveBeenCalledOnce()
    running.cancel()
    running.renderTick()
    await running.promise
  })
})

describe('the playhead while an export runs', () => {
  /** An export rendering timeline frame 10. */
  const rendering = () => {
    setAnimationExportRunning(true)
    setAnimationExportProgress({
      currentFrame: 0,
      totalFrames: 11,
      currentPointCount: 0,
      targetPointsPerFrame: 1000,
      totalFramesComplete: 0,
      currentTimelineFrame: 10,
      startedAt: 0,
      status: 'rendering',
    })
  }

  afterEach(() => {
    setAnimationExportRunning(false)
    setAnimationExportProgress(undefined)
  })

  it('leaves a motion blur sub-frame where the export posed it', () => {
    // Pinning it back to the whole frame re-posed the rest of the sub-frame
    // at the frame's own pose, and the blur came out unblurred.
    const timeline = createTimelineState()
    rendering()
    timeline.setCurrentFrame(10.125)
    holdPlayheadOnExportFrame(timeline)
    expect(timeline.currentFrame()).toBe(10.125)
  })

  it('brings back a playhead that left the frame being rendered', () => {
    const timeline = createTimelineState()
    rendering()
    timeline.setCurrentFrame(42)
    holdPlayheadOnExportFrame(timeline)
    expect(timeline.currentFrame()).toBe(10)
  })

  it('does nothing when no export is running', () => {
    const timeline = createTimelineState()
    timeline.setCurrentFrame(42)
    holdPlayheadOnExportFrame(timeline)
    expect(timeline.currentFrame()).toBe(42)
  })
})
