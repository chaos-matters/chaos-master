/**
 * The canvas end of the framing beside the chrome that floats over it, the
 * tablet deck at the trailing edge, the glass desktop sidebar at the leading
 * one and the rail's glass sheet at the bottom: what the cameras are given, what the canvas says about itself,
 * and what a capture is handed, with chrome over the canvas and without it,
 * and while an export sizes the canvas (useViewFraming.ts).
 */
import { createRoot, createSignal } from 'solid-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NO_SHIFT, NOT_COVERED, setLeadingCover, setTrailingCover, } from '@/lib/canvasFraming'
import { useViewFraming } from './useViewFraming'
import type { ExportImageType } from '@/flame/exportImageType'
import type { ExportDimensions } from '@/utils/exportDimensions'

/** A 1180 x 820 landscape tablet: the canvas box is 1100 x 820 CSS px. */
function mountFraming() {
  const [width, setWidth] = createSignal<number | undefined>(1100)
  const [bottom, setBottom] = createSignal(0)
  const [exportDimensions, setExportDimensions] =
    createSignal<ExportDimensions>()
  const [onExportImage, setOnExportImage] = createSignal<ExportImageType>()
  const canvas = document.createElement('canvas')
  canvas.width = 1100
  canvas.height = 820
  let dispose = () => {}
  const framing = createRoot((disposeRoot) => {
    dispose = disposeRoot
    return useViewFraming({
      width,
      height: () => 820,
      bottom,
      canvas: () => canvas,
      exportDimensions,
      onExportImage,
    })
  })
  return {
    framing,
    canvas,
    setWidth,
    setBottom,
    setExportDimensions,
    setOnExportImage,
    dispose,
  }
}

/** The 2D context the cut draws into, which the test runtime does not have. */
function stubDrawing() {
  const drawImage = vi.fn()
  // `never`, since the spy is typed by getContext's last overload, 'webgpu'.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        globalCompositeOperation: 'source-over',
        drawImage,
      }) as never,
  )
  return drawImage
}

afterEach(() => {
  setTrailingCover(0)
  setLeadingCover(0)
  vi.restoreAllMocks()
})

describe('the view framing', () => {
  it('shifts nothing and marks nothing while nothing covers the canvas', () => {
    const { framing, canvas, dispose } = mountFraming()

    expect(framing.covered()).toBe(NOT_COVERED)
    expect(framing.viewShift()).toBe(NO_SHIFT)
    expect(canvas.dataset.coveredRight).toBeUndefined()
    expect(canvas.dataset.coveredLeft).toBeUndefined()
    dispose()
  })

  it('frames the flame beside the deck and says how much it covers', () => {
    const { framing, canvas, dispose } = mountFraming()

    setTrailingCover(380)

    // The centre moves half the deck's width to the left: 190 of the
    // canvas's 550 half-width, in clip units.
    expect(framing.viewShift().x).toBeCloseTo(-380 / 1100, 6)
    expect(framing.viewShift().y).toBe(0)
    expect(Number(canvas.dataset.coveredRight)).toBeCloseTo(380 / 1100, 6)
    dispose()
  })

  it('follows the deck as it widens and closes', () => {
    const { framing, canvas, dispose } = mountFraming()

    setTrailingCover(380)
    setTrailingCover(420)
    expect(framing.viewShift().x).toBeCloseTo(-420 / 1100, 6)

    setTrailingCover(0)
    expect(framing.viewShift()).toBe(NO_SHIFT)
    expect(canvas.dataset.coveredRight).toBeUndefined()
    dispose()
  })

  it('frames the flame beside the sidebar and says how much it covers', () => {
    const { framing, canvas, dispose } = mountFraming()

    setLeadingCover(200)

    // The centre moves half the sidebar's cover to the right: 100 of the
    // canvas's 550 half-width, in clip units.
    expect(framing.viewShift().x).toBeCloseTo(200 / 1100, 6)
    expect(framing.viewShift().y).toBe(0)
    expect(Number(canvas.dataset.coveredLeft)).toBeCloseTo(200 / 1100, 6)
    expect(canvas.dataset.coveredRight).toBeUndefined()
    dispose()
  })

  it('frames the flame between both, and marks each edge', () => {
    const { framing, canvas, dispose } = mountFraming()

    setLeadingCover(200)
    setTrailingCover(380)

    expect(framing.covered().left).toBeCloseTo(200 / 1100, 6)
    expect(framing.covered().right).toBeCloseTo(380 / 1100, 6)
    expect(framing.viewShift().x).toBeCloseTo((200 - 380) / 1100, 6)
    expect(Number(canvas.dataset.coveredLeft)).toBeCloseTo(200 / 1100, 6)
    expect(Number(canvas.dataset.coveredRight)).toBeCloseTo(380 / 1100, 6)

    setLeadingCover(0)
    expect(canvas.dataset.coveredLeft).toBeUndefined()
    expect(framing.viewShift().x).toBeCloseTo(-380 / 1100, 6)
    dispose()
  })

  it('frames the flame above the rail sheet and says how much it covers', () => {
    const { framing, canvas, setBottom, dispose } = mountFraming()

    setBottom(205)

    // The centre rises half the 205 px covered: 102.5 of the canvas's 410
    // half-height, 205 / 820 in clip units.
    expect(framing.viewShift().x).toBe(0)
    expect(framing.viewShift().y).toBeCloseTo(205 / 820, 6)
    expect(Number(canvas.dataset.coveredBottom)).toBeCloseTo(205 / 820, 6)
    expect(canvas.dataset.coveredLeft).toBeUndefined()
    expect(canvas.dataset.coveredRight).toBeUndefined()

    setBottom(0)
    expect(framing.viewShift()).toBe(NO_SHIFT)
    expect(canvas.dataset.coveredBottom).toBeUndefined()
    dispose()
  })

  it('waits for the canvas box to be laid out', () => {
    const { framing, setWidth, dispose } = mountFraming()

    setWidth(undefined)
    setTrailingCover(380)
    expect(framing.viewShift()).toBe(NO_SHIFT)

    setWidth(1100)
    expect(framing.viewShift().x).toBeCloseTo(-380 / 1100, 6)
    dispose()
  })
})

describe('what a capture is handed', () => {
  it('is nothing to install while nothing waits for a frame', () => {
    const { framing, dispose } = mountFraming()

    expect(framing.exportImage()).toBeUndefined()
    dispose()
  })

  it('is the visible part while the deck covers some of the canvas', () => {
    stubDrawing()
    const { framing, canvas, setOnExportImage, dispose } = mountFraming()
    const capture = vi.fn()
    setTrailingCover(380)
    setOnExportImage(() => capture)

    framing.exportImage()?.(canvas, { finalImageReady: true })

    const handed = capture.mock.calls[0]?.[0] as HTMLCanvasElement
    expect(handed).not.toBe(canvas)
    expect([handed.width, handed.height]).toEqual([720, 820])
    dispose()
  })

  it('is the visible part while the sidebar covers some of the canvas', () => {
    const drawImage = stubDrawing()
    const { framing, canvas, setOnExportImage, dispose } = mountFraming()
    const capture = vi.fn()
    setLeadingCover(200)
    setOnExportImage(() => capture)

    framing.exportImage()?.(canvas, { finalImageReady: true })

    const handed = capture.mock.calls[0]?.[0] as HTMLCanvasElement
    expect(handed).not.toBe(canvas)
    expect([handed.width, handed.height]).toEqual([900, 820])
    // Cut from where the sidebar's cover ends, not from the canvas's edge.
    expect(drawImage).toHaveBeenCalledWith(
      canvas,
      200,
      0,
      900,
      820,
      0,
      0,
      900,
      820,
    )
    dispose()
  })

  it('is the rows above the rail sheet while it covers the foot', () => {
    stubDrawing()
    const { framing, canvas, setBottom, setOnExportImage, dispose } =
      mountFraming()
    const capture = vi.fn()
    setBottom(205)
    setOnExportImage(() => capture)

    framing.exportImage()?.(canvas, { finalImageReady: true })

    const handed = capture.mock.calls[0]?.[0] as HTMLCanvasElement
    expect([handed.width, handed.height]).toEqual([1100, 615])
    dispose()
  })

  it('is the whole canvas, unshifted, while an export sizes the canvas', () => {
    // An export renders its own frame at its own size: neither the deck nor
    // the sidebar has a part in it, so the camera is not shifted and nothing
    // is cut.
    stubDrawing()
    const {
      framing,
      canvas,
      setBottom,
      setExportDimensions,
      setOnExportImage,
      dispose,
    } = mountFraming()
    const capture = vi.fn()
    setTrailingCover(380)
    setLeadingCover(200)
    setBottom(205)
    setExportDimensions({ width: 1920, height: 1080 })
    setOnExportImage(() => capture)

    expect(framing.viewShift()).toBe(NO_SHIFT)
    expect(canvas.dataset.coveredRight).toBeUndefined()
    expect(canvas.dataset.coveredLeft).toBeUndefined()
    expect(canvas.dataset.coveredBottom).toBeUndefined()
    framing.exportImage()?.(canvas, { finalImageReady: true })
    expect(capture).toHaveBeenCalledWith(canvas, { finalImageReady: true })

    setExportDimensions(undefined)
    expect(framing.viewShift().x).toBeCloseTo((200 - 380) / 1100, 6)
    dispose()
  })
})
