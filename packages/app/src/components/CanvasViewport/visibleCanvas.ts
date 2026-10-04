/**
 * The part of the workspace canvas that is on show, for everything that takes
 * an image off it or points at it.
 *
 * With the Glass panels setting on, the canvas runs on under the chrome that
 * floats over its edges - the tablet deck at the trailing edge, the desktop
 * sidebar at the leading one, the rail's glass sheet at the bottom - and the
 * camera frames the flame in the part they leave visible
 * (lib/canvasFraming.ts). An image of the whole canvas would carry that
 * framing out of the editor: the flame off centre, beside a strip nobody
 * saw. So every image that leaves the canvas is cut to the visible part
 * first. Across the width that makes it the image the setting-off canvas
 * would have made; above the rail's sheet, that image cropped to the part
 * on show, centred on the flame as it is:
 *
 * - the export-image hook (the flash export, the share link's preview, the
 *   Discord post) is handed the cut by `captureVisiblePart`;
 * - the randomizer history's thumbnail is `visibleThumbnail`;
 * - the export dialog's "match the viewport" aspect is `visibleCanvasAspect`,
 *   which folds the side covers only: an export is rendered whole, at its
 *   own size, so it matches the setting-off canvas's full height under the
 *   rail's sheet.
 *
 * And the tour and the replay spotlight, which light the canvas up, take its
 * box from `visibleClientRect`, so neither lights a strip under the chrome.
 *
 * The canvas says how much of it is covered at each edge in
 * `data-covered-left`, `data-covered-right` and `data-covered-bottom`, which
 * CanvasViewport keeps equal to the shift its camera draws with, and removes
 * whenever nothing is covered there, including while an export sizes the
 * canvas itself. No attribute means that edge of the canvas is in the
 * picture.
 */
import { NOT_COVERED, visibleAspect, visibleRegion } from '@/lib/canvasFraming'
import type { ExportImageType } from '@/flame/exportImageType'
import type { Covered } from '@/lib/canvasFraming'

/** The attributes' names as `dataset` spells them. */
export const COVERED_LEFT_KEY = 'coveredLeft'
export const COVERED_RIGHT_KEY = 'coveredRight'
export const COVERED_BOTTOM_KEY = 'coveredBottom'

/**
 * The same attributes as the DOM spells them, for a selector or a
 * MutationObserver's filter (SessionRecorder/ReplaySpotlight.tsx): chrome
 * opening or closing over the canvas moves no box, only these change.
 * visibleCanvas.test.ts holds the two spellings together.
 */
export const COVERED_ATTRIBUTES: readonly string[] = [
  'data-covered-left',
  'data-covered-right',
  'data-covered-bottom',
]

const COVERED_CANVAS = COVERED_ATTRIBUTES.map((name) => `canvas[${name}]`).join(
  ', ',
)

/** One edge's covered share of `canvas`, from its attribute; 0 without one. */
function shareOf(canvas: HTMLCanvasElement, key: string): number {
  const raw = canvas.dataset[key]
  if (raw === undefined) return 0
  const fraction = Number(raw)
  return Number.isFinite(fraction) ? fraction : 0
}

/** The covered shares of `canvas`, from its attributes. */
export function coveredOf(canvas: HTMLCanvasElement): Covered {
  const left = shareOf(canvas, COVERED_LEFT_KEY)
  const right = shareOf(canvas, COVERED_RIGHT_KEY)
  const bottom = shareOf(canvas, COVERED_BOTTOM_KEY)
  return left === 0 && right === 0 && bottom === 0
    ? NOT_COVERED
    : { left, right, bottom }
}

const isCovered = (covered: Covered) =>
  covered.left > 0 || covered.right > 0 || covered.bottom > 0

/**
 * `[sx, sy, sw, sh]` for `drawImage`: the part of `image`, an image of the
 * canvas, that `covered` leaves visible, in that image's pixels.
 */
export function visibleCanvasRect(
  covered: Covered,
  image: { readonly width: number; readonly height: number },
): [number, number, number, number] {
  const region = visibleRegion(image.width, image.height, covered)
  return [region.x, region.y, region.width, region.height]
}

/**
 * Draws the part of `image`, an image of the canvas such as a PNG decoded
 * from it, that `covered` leaves visible into `context` at the origin,
 * `width` x `height`.
 */
export function drawVisibleCanvas(
  context: CanvasRenderingContext2D,
  covered: Covered,
  image: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number,
): void {
  const [sx, sy, sw, sh] = visibleCanvasRect(covered, image)
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
}

/**
 * A `size` x `size` PNG of the visible part of `canvas`, as a data URL, or
 * null when the canvas cannot be encoded or its PNG decoded. The shares are
 * read when the pixels are taken, in the same call as `toBlob`: the PNG is
 * encoded and decoded before it is drawn, and chrome opening or closing
 * over the canvas meanwhile must not move the cut off the frame it took.
 */
export function visibleThumbnail(
  canvas: HTMLCanvasElement,
  size: number,
): Promise<string | null> {
  const covered = coveredOf(canvas)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        resolve(null)
        return
      }
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        const offscreen = document.createElement('canvas')
        offscreen.width = size
        offscreen.height = size
        const ctx = offscreen.getContext('2d')!
        drawVisibleCanvas(ctx, covered, img, size, size)
        URL.revokeObjectURL(url)
        resolve(offscreen.toDataURL('image/png'))
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    }, 'image/png')
  })
}

/**
 * Width over height of the canvas the setting-off layout would have, in CSS
 * px: the export dialog's Auto aspect. The side covers are folded, since the
 * setting-off canvas is exactly the part they leave. The rail sheet's bottom
 * share is not: with the setting off the canvas keeps its full height and
 * slides up under the opaque sheet, and an export renders at its own size
 * with no shift (useViewFraming.ts), so the image Auto gives matches the
 * setting-off one instead of a strip above the sheet.
 */
export function visibleCanvasAspect(canvas: HTMLCanvasElement): number {
  const { left, right } = coveredOf(canvas)
  return visibleAspect(canvas.clientWidth, canvas.clientHeight, {
    left,
    right,
    bottom: 0,
  })
}

/**
 * `capture`, handed the visible part of the canvas rather than all of it.
 *
 * Nothing covered, it gets the live canvas itself, untouched. Otherwise it
 * gets a 2D canvas holding a copy of the visible part, made in the call, so
 * the copy is the frame the renderer hands over and not a later one. The
 * copy is reused from frame to frame, which is safe for every capture there
 * is, since each takes its `toBlob` inside the call and `toBlob` snapshots at
 * once. Where no 2D context can be had, the frame is skipped rather than
 * handed over whole: a capture that times out says so, and a wrongly framed
 * image would not.
 */
export function captureVisiblePart(capture: ExportImageType): ExportImageType {
  let copy: HTMLCanvasElement | undefined
  return (canvas, info) => {
    const covered = coveredOf(canvas)
    if (!isCovered(covered)) {
      capture(canvas, info)
      return
    }
    const region = visibleRegion(canvas.width, canvas.height, covered)
    copy ??= document.createElement('canvas')
    if (copy.width !== region.width) copy.width = region.width
    if (copy.height !== region.height) copy.height = region.height
    const context = copy.getContext('2d')
    if (!context) return
    context.globalCompositeOperation = 'copy'
    context.drawImage(
      canvas,
      region.x,
      region.y,
      region.width,
      region.height,
      0,
      0,
      region.width,
      region.height,
    )
    capture(copy, info)
  }
}

/**
 * The on-show part of `element`'s box, in client px. That is the whole box,
 * unless `element` is the workspace canvas, or holds it, while chrome covers
 * part of the canvas: then the box starts where the leading cover ends,
 * stops where the trailing one begins, and ends where the bottom one does.
 */
export function visibleClientRect(element: Element): DOMRect {
  const box = element.getBoundingClientRect()
  const canvas =
    element instanceof HTMLCanvasElement
      ? element
      : element.querySelector<HTMLCanvasElement>(COVERED_CANVAS)
  const covered = canvas ? coveredOf(canvas) : NOT_COVERED
  if (!canvas || !isCovered(covered)) return box
  const canvasBox = canvas === element ? box : canvas.getBoundingClientRect()
  const visibleLeft = canvasBox.left + canvasBox.width * covered.left
  const visibleRight = canvasBox.left + canvasBox.width * (1 - covered.right)
  const visibleBottom = canvasBox.top + canvasBox.height * (1 - covered.bottom)
  const clamp = (x: number) => Math.max(box.left, Math.min(box.right, x))
  const left = clamp(visibleLeft)
  const right = Math.max(left, clamp(visibleRight))
  const bottom = Math.max(box.top, Math.min(box.bottom, visibleBottom))
  return new DOMRect(left, box.top, right - left, bottom - box.top)
}
