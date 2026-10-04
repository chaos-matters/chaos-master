/**
 * Images taken off the workspace canvas are cut to the part the chrome
 * floating over it leaves visible - the tablet deck at the trailing edge, the
 * glass desktop sidebar at the leading one - so the view-only framing never
 * leaves the editor: not in a flash export, a share preview, a Discord post,
 * a thumbnail, nor in the aspect the export dialog matches
 * (visibleCanvas.ts). Each cut is the picture the setting-off canvas, exactly
 * that visible part, would have given.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOT_COVERED } from '@/lib/canvasFraming'
import { computeExportDimensions } from '@/utils/exportDimensions'
import { captureVisiblePart, COVERED_ATTRIBUTES, COVERED_BOTTOM_KEY, COVERED_LEFT_KEY, COVERED_RIGHT_KEY, coveredOf, drawVisibleCanvas, visibleCanvasAspect, visibleCanvasRect, visibleClientRect, visibleThumbnail, } from './visibleCanvas'
import type { ExportImageInfo } from '@/flame/exportImageType'

/** A 1180 x 820 landscape tablet: a 1100 px canvas under a 380 px deck. */
const COVERED = 380 / 1100

/** The same canvas box with 200 px of it under a sidebar at the other edge. */
const COVERED_LEFT = 200 / 1100

/** A 390 x 844 phone: the rail's glass sheet at medium covers 275 px of the
 *  canvas's foot above the peek it always covers. */
const COVERED_BOTTOM = 275 / 844

function workspaceCanvas(
  width: number,
  height: number,
  covered?: number,
  coveredLeft?: number,
  coveredBottom?: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (covered !== undefined) canvas.dataset.coveredRight = String(covered)
  if (coveredLeft !== undefined)
    canvas.dataset.coveredLeft = String(coveredLeft)
  if (coveredBottom !== undefined)
    canvas.dataset.coveredBottom = String(coveredBottom)
  return canvas
}

/** Records what reaches a 2D context, which the test runtime does not draw. */
function recordDrawing() {
  const drawn: unknown[][] = []
  const context = {
    globalCompositeOperation: 'source-over',
    drawImage: (...args: unknown[]) => {
      drawn.push(args)
    },
  }
  // `never`, since the spy is typed by getContext's last overload, 'webgpu'.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as never,
  )
  return { drawn, context }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the covered shares a canvas reports', () => {
  it('names each attribute the same in both spellings', () => {
    const canvas = document.createElement('canvas')
    canvas.dataset[COVERED_LEFT_KEY] = '0.1'
    canvas.dataset[COVERED_RIGHT_KEY] = '0.2'
    canvas.dataset[COVERED_BOTTOM_KEY] = '0.3'
    expect(canvas.getAttributeNames().sort()).toEqual(
      [...COVERED_ATTRIBUTES].sort(),
    )
  })

  it('reads its attributes, and is 0 without one or with nonsense', () => {
    expect(coveredOf(workspaceCanvas(10, 10, 0.25))).toEqual({
      left: 0,
      right: 0.25,
      bottom: 0,
    })
    expect(coveredOf(workspaceCanvas(10, 10, undefined, 0.2))).toEqual({
      left: 0.2,
      right: 0,
      bottom: 0,
    })
    expect(coveredOf(workspaceCanvas(10, 10, 0.25, 0.2))).toEqual({
      left: 0.2,
      right: 0.25,
      bottom: 0,
    })
    expect(
      coveredOf(workspaceCanvas(10, 10, undefined, undefined, 0.3)),
    ).toEqual({ left: 0, right: 0, bottom: 0.3 })
    expect(coveredOf(workspaceCanvas(10, 10))).toBe(NOT_COVERED)
    const odd = workspaceCanvas(10, 10)
    odd.dataset.coveredRight = 'wide'
    odd.dataset.coveredLeft = 'narrow'
    odd.dataset.coveredBottom = 'tall'
    expect(coveredOf(odd)).toBe(NOT_COVERED)
  })
})

describe('visibleCanvasRect', () => {
  /** The cut of an image of `canvas`, by the shares the canvas reports. */
  const rectOf = (
    canvas: HTMLCanvasElement,
    image: { readonly width: number; readonly height: number } = canvas,
  ) => visibleCanvasRect(coveredOf(canvas), image)

  it('is the uncovered part of the canvas, in backing-store pixels', () => {
    expect(rectOf(workspaceCanvas(1100, 820, COVERED))).toEqual([
      0, 0, 720, 820,
    ])
  })

  it('keeps the rows above the rail sheet, from the top', () => {
    // 844 - 275 = 569 CSS px on show, 1707 rows at a pixel ratio of 3.
    const canvas = workspaceCanvas(
      1170,
      2532,
      undefined,
      undefined,
      COVERED_BOTTOM,
    )
    expect(rectOf(canvas)).toEqual([0, 0, 1170, 1707])
  })

  it('measures an image of the canvas by its own size', () => {
    // The thumbnail decodes a PNG of the canvas, and cuts that.
    const canvas = workspaceCanvas(1100, 820, COVERED)
    expect(rectOf(canvas, { width: 2200, height: 1640 })).toEqual([
      0, 0, 1440, 1640,
    ])
  })

  it('starts where the sidebar covering the leading edge ends', () => {
    expect(rectOf(workspaceCanvas(1100, 820, undefined, COVERED_LEFT))).toEqual(
      [200, 0, 900, 820],
    )
    expect(
      rectOf(workspaceCanvas(1100, 820, undefined, COVERED_LEFT), {
        width: 2200,
        height: 1640,
      }),
    ).toEqual([400, 0, 1800, 1640])
  })

  it('is what both leave when both edges are covered', () => {
    expect(rectOf(workspaceCanvas(1100, 820, COVERED, COVERED_LEFT))).toEqual([
      200, 0, 520, 820,
    ])
  })

  it('is the whole canvas when nothing covers it', () => {
    expect(rectOf(workspaceCanvas(720, 820))).toEqual([0, 0, 720, 820])
  })
})

describe('drawVisibleCanvas', () => {
  it('draws only the visible part of an image of the canvas', () => {
    // The randomizer history's 128 px thumbnail, from a PNG of an iPad's
    // canvas at twice its CSS size.
    const drawn: unknown[][] = []
    const context = {
      drawImage: (...args: unknown[]) => drawn.push(args),
    } as unknown as CanvasRenderingContext2D
    const canvas = workspaceCanvas(2200, 1640, COVERED)
    const png = workspaceCanvas(2200, 1640)

    drawVisibleCanvas(context, coveredOf(canvas), png, 128, 128)

    expect(drawn).toEqual([[png, 0, 0, 1440, 1640, 0, 0, 128, 128]])
  })

  it('leaves out the part under the sidebar', () => {
    const drawn: unknown[][] = []
    const context = {
      drawImage: (...args: unknown[]) => drawn.push(args),
    } as unknown as CanvasRenderingContext2D
    const canvas = workspaceCanvas(2200, 1640, undefined, COVERED_LEFT)
    const png = workspaceCanvas(2200, 1640)

    drawVisibleCanvas(context, coveredOf(canvas), png, 128, 128)

    expect(drawn).toEqual([[png, 400, 0, 1800, 1640, 0, 0, 128, 128]])
  })
})

describe('visibleCanvasAspect', () => {
  function laidOut(width: number, height: number, covered?: number) {
    const canvas = workspaceCanvas(width, height, covered)
    Object.defineProperty(canvas, 'clientWidth', { value: width })
    Object.defineProperty(canvas, 'clientHeight', { value: height })
    return canvas
  }

  it('is the aspect of what the deck leaves visible', () => {
    // What the setting-off canvas, 720 x 820, reports.
    expect(visibleCanvasAspect(laidOut(1100, 820, COVERED))).toBeCloseTo(
      720 / 820,
      6,
    )
  })

  it('is the aspect of what the sidebar leaves visible', () => {
    const canvas = laidOut(1100, 820)
    canvas.dataset.coveredLeft = String(COVERED_LEFT)
    expect(visibleCanvasAspect(canvas)).toBeCloseTo(900 / 820, 6)
  })

  it('is the canvas aspect when nothing covers it', () => {
    expect(visibleCanvasAspect(laidOut(720, 820))).toBeCloseTo(720 / 820, 6)
  })

  it("leaves the rail sheet's share out, as the setting-off canvas does", () => {
    // A 390 x 844 phone with the glass sheet at large: 88% of the viewport
    // less the 96 px peek covers 646.72 px of the canvas's foot. With the
    // setting off the canvas keeps its 844 px and slides up under the
    // opaque sheet, so Auto exports 946 x 2048 there; an aspect folding the
    // sheet's share gave 2048 x 1036 and a flame about 4.3 times smaller.
    const canvas = laidOut(390, 844)
    canvas.dataset.coveredBottom = String((0.88 * 844 - 96) / 844)
    expect(visibleCanvasAspect(canvas)).toBeCloseTo(390 / 844, 6)
    expect(
      computeExportDimensions(2048, 'auto', visibleCanvasAspect(canvas)),
    ).toEqual({ width: 946, height: 2048 })
  })

  it('folds the side covers and leaves the sheet out, together', () => {
    const canvas = laidOut(1100, 820, COVERED)
    canvas.dataset.coveredBottom = String(COVERED_BOTTOM)
    expect(visibleCanvasAspect(canvas)).toBeCloseTo(720 / 820, 6)
  })
})

describe('visibleThumbnail', () => {
  it('cuts by the shares the canvas had when its pixels were taken', async () => {
    // The randomizer history's thumbnail encodes a PNG of the canvas and
    // decodes it again before drawing. The sidebar docking in between must
    // not move the cut onto the strip the deck now covers.
    const canvas = workspaceCanvas(2200, 1640, undefined, COVERED_LEFT)
    let encoded: BlobCallback | undefined
    canvas.toBlob = (callback) => {
      encoded = callback
    }
    class DecodedPng {
      width = 2200
      height = 1640
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', DecodedPng)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { drawn } = recordDrawing()

    const thumbnail = visibleThumbnail(canvas, 128)
    delete canvas.dataset.coveredLeft
    canvas.dataset.coveredRight = String(COVERED)
    encoded?.(new Blob())
    await thumbnail

    expect(drawn).toHaveLength(1)
    expect(drawn[0]!.slice(1)).toEqual([400, 0, 1800, 1640, 0, 0, 128, 128])
  })

  it('is null when the canvas cannot be encoded', async () => {
    const canvas = workspaceCanvas(10, 10)
    canvas.toBlob = (callback) => {
      callback(null)
    }
    expect(await visibleThumbnail(canvas, 128)).toBeNull()
  })
})

describe('captureVisiblePart', () => {
  const info: ExportImageInfo = { finalImageReady: true }

  it('hands over the live canvas itself when nothing covers it', () => {
    const { drawn } = recordDrawing()
    const capture = vi.fn()
    const live = workspaceCanvas(720, 820)

    captureVisiblePart(capture)(live, info)

    expect(capture).toHaveBeenCalledWith(live, info)
    expect(drawn).toEqual([])
  })

  it('hands over a copy of the visible part when the deck covers some', () => {
    const { drawn, context } = recordDrawing()
    const capture = vi.fn()
    const live = workspaceCanvas(1100, 820, COVERED)

    captureVisiblePart(capture)(live, info)

    expect(capture).toHaveBeenCalledTimes(1)
    const [handed, handedInfo] = capture.mock.calls[0] as [
      HTMLCanvasElement,
      ExportImageInfo,
    ]
    expect(handed).not.toBe(live)
    expect([handed.width, handed.height]).toEqual([720, 820])
    expect(handedInfo).toBe(info)
    // The left 720 columns, the part on show, copied pixel for pixel.
    expect(drawn).toEqual([[live, 0, 0, 720, 820, 0, 0, 720, 820]])
    expect(context.globalCompositeOperation).toBe('copy')
  })

  it('hands over the rows above the rail sheet when it covers the foot', () => {
    const { drawn } = recordDrawing()
    const capture = vi.fn()
    const live = workspaceCanvas(390, 844, undefined, undefined, COVERED_BOTTOM)

    captureVisiblePart(capture)(live, info)

    const [handed] = capture.mock.calls[0] as [HTMLCanvasElement]
    expect([handed.width, handed.height]).toEqual([390, 569])
    // The top 569 rows, which the camera centres the flame in.
    expect(drawn).toEqual([[live, 0, 0, 390, 569, 0, 0, 390, 569]])
  })

  it('hands over the part beside the sidebar when it covers the leading edge', () => {
    const { drawn } = recordDrawing()
    const capture = vi.fn()
    const live = workspaceCanvas(1100, 820, undefined, COVERED_LEFT)

    captureVisiblePart(capture)(live, info)

    const [handed] = capture.mock.calls[0] as [HTMLCanvasElement]
    expect([handed.width, handed.height]).toEqual([900, 820])
    // The right 900 columns, from where the sidebar's cover ends.
    expect(drawn).toEqual([[live, 200, 0, 900, 820, 0, 0, 900, 820]])
  })

  it('reuses one copy from frame to frame', () => {
    recordDrawing()
    const handed: HTMLCanvasElement[] = []
    const cut = captureVisiblePart((canvas) => handed.push(canvas))
    const live = workspaceCanvas(1100, 820, COVERED)

    cut(live)
    cut(live)

    expect(handed).toHaveLength(2)
    expect(handed[1]).toBe(handed[0])
  })

  it('follows the canvas when the deck opens, resizes and closes', () => {
    const { drawn } = recordDrawing()
    const handed: HTMLCanvasElement[] = []
    const cut = captureVisiblePart((canvas) => handed.push(canvas))
    const live = workspaceCanvas(1100, 820)

    cut(live)
    live.dataset.coveredRight = String(480 / 1100)
    cut(live)
    delete live.dataset.coveredRight
    cut(live)

    expect(handed[0]).toBe(live)
    expect([handed[1]!.width, handed[1]!.height]).toEqual([620, 820])
    expect(handed[2]).toBe(live)
    expect(drawn).toHaveLength(1)
  })

  it('skips a frame it cannot cut rather than hand over the whole canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const capture = vi.fn()

    captureVisiblePart(capture)(workspaceCanvas(1100, 820, COVERED), info)

    expect(capture).not.toHaveBeenCalled()
  })
})

/** Lays `element` out at a box the test DOM cannot compute. */
function place(element: Element, left: number, width: number, height = 820) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left,
    top: 0,
    right: left + width,
    bottom: height,
    width,
    height,
    x: left,
    y: 0,
    toJSON: () => ({}),
  })
}

describe('visibleClientRect', () => {
  // The tour and the replay spotlight light up the canvas by this box.
  it('cuts the canvas at the part the deck covers', () => {
    const canvas = workspaceCanvas(1100, 820, COVERED)
    place(canvas, 80, 1100)

    expect(visibleClientRect(canvas)).toMatchObject({
      left: 80,
      right: 800,
      width: 720,
      top: 0,
      height: 820,
    })
  })

  it('cuts a box that holds the canvas at the same place', () => {
    const container = document.createElement('div')
    const canvas = workspaceCanvas(1100, 820, COVERED)
    container.append(canvas)
    place(container, 80, 1100)
    place(canvas, 80, 1100)

    expect(visibleClientRect(container)).toMatchObject({
      left: 80,
      right: 800,
      width: 720,
    })
  })

  it('starts the box where the sidebar covering the leading edge ends', () => {
    // A 1920 px canvas box from x 0, the wide sidebar's 409.6 px over it.
    const canvas = workspaceCanvas(1920, 1080, undefined, 409.6 / 1920)
    place(canvas, 0, 1920, 1080)

    const box = visibleClientRect(canvas)
    expect(box.left).toBeCloseTo(409.6, 6)
    expect(box.right).toBeCloseTo(1920, 6)
    expect(box.width).toBeCloseTo(1510.4, 6)
    expect(box.height).toBe(1080)
  })

  it('cuts both edges when both are covered', () => {
    const container = document.createElement('div')
    const canvas = workspaceCanvas(1100, 820, COVERED, COVERED_LEFT)
    container.append(canvas)
    place(container, 80, 1100)
    place(canvas, 80, 1100)

    const box = visibleClientRect(container)
    expect(box.left).toBeCloseTo(280, 6)
    expect(box.right).toBeCloseTo(800, 6)
    expect(box.width).toBeCloseTo(520, 6)
  })

  it('ends the box where the rail sheet covering the foot begins', () => {
    const canvas = workspaceCanvas(
      390,
      844,
      undefined,
      undefined,
      COVERED_BOTTOM,
    )
    place(canvas, 0, 390, 844)

    expect(visibleClientRect(canvas)).toMatchObject({
      left: 0,
      width: 390,
      top: 0,
      height: 569,
      bottom: 569,
    })
  })

  it('is the whole box when nothing covers the canvas', () => {
    const canvas = workspaceCanvas(1100, 820)
    place(canvas, 80, 1100)

    expect(visibleClientRect(canvas)).toMatchObject({ left: 80, right: 1180 })
  })

  it('is the whole box of anything that is not the canvas', () => {
    const button = document.createElement('button')
    place(button, 900, 44, 44)

    expect(visibleClientRect(button)).toMatchObject({
      left: 900,
      right: 944,
      width: 44,
      height: 44,
    })
  })
})
