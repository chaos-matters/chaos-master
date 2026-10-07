/**
 * The editor canvas's framing beside chrome that floats over it, wired to the
 * canvas: the shares of the canvas the floating tablet deck, the glass
 * desktop sidebar and the rail's glass sheet cover, the camera shift that
 * centres the flame in the rest (lib/canvasFraming.ts), the attributes that
 * tell captures which part is on show, and the export-image hook cut to that
 * part (./visibleCanvas.ts).
 *
 * Nothing is covered, and so nothing shifts or is cut, while an export sizes
 * the canvas itself: the canvas then renders the export's own frame, which
 * the chrome has no part in. The shift reaches the cameras as a prop and goes
 * no further; this hook writes neither the flame nor its camera.
 */
import { createEffect, createMemo } from 'solid-js'
import { coveredFraction, framingShift, leadingCover, NOT_COVERED, trailingCover, } from '@/lib/canvasFraming'
import { captureVisiblePart, COVERED_BOTTOM_KEY, COVERED_LEFT_KEY, COVERED_RIGHT_KEY, } from './visibleCanvas'
import type { Accessor } from 'solid-js'
import type { ExportImageType } from '@/flame/exportImageType'
import type { Covered, ViewShift } from '@/lib/canvasFraming'
import type { ExportDimensions } from '@/utils/exportDimensions'

export interface ViewFramingOptions {
  /** The canvas box's width in CSS px; undefined until it is laid out. */
  width: Accessor<number | undefined>
  /** The canvas box's height in CSS px; undefined until it is laid out. */
  height?: Accessor<number | undefined>
  /**
   * CSS px of the canvas's foot the rail's glass sheet covers, above the
   * peek it covers at every detent; 0, or left out, with no glass sheet.
   */
  bottom?: Accessor<number>
  /** The workspace canvas, once it is mounted. */
  canvas: Accessor<HTMLCanvasElement | undefined>
  /** Set while an export renders at a size of its own. */
  exportDimensions: Accessor<ExportDimensions | undefined>
  /** The capture waiting for the next frame, if any. */
  onExportImage: Accessor<ExportImageType | undefined>
}

export interface ViewFraming {
  /**
   * The shares of the canvas the floating chrome covers at each edge, 0 to
   * 1: NOT_COVERED with nothing over it, and while an export sizes the
   * canvas.
   */
  covered: Accessor<Covered>
  /** For the cameras' `viewShift`. */
  viewShift: Accessor<ViewShift>
  /** For the renderer's `onExportImage`: the capture, cut to what is on show. */
  exportImage: Accessor<ExportImageType | undefined>
}

const sameCovered = (a: Covered, b: Covered) =>
  a.left === b.left && a.right === b.right && a.bottom === b.bottom

/** A share for its attribute: written when above 0, removed otherwise. */
function writeShare(canvas: HTMLCanvasElement, key: string, share: number) {
  if (share > 0) canvas.dataset[key] = String(share)
  else delete canvas.dataset[key]
}

export function useViewFraming(options: ViewFramingOptions): ViewFraming {
  const covered = createMemo<Covered>(
    () => {
      if (options.exportDimensions()) return NOT_COVERED
      const width = options.width() ?? 0
      const left = coveredFraction(leadingCover(), width)
      const right = coveredFraction(trailingCover(), width)
      const bottom = coveredFraction(
        options.bottom?.() ?? 0,
        options.height?.() ?? 0,
      )
      return left === 0 && right === 0 && bottom === 0
        ? NOT_COVERED
        : { left, right, bottom }
    },
    NOT_COVERED,
    { equals: sameCovered },
  )
  const viewShift = createMemo(() => framingShift(covered()))

  // Written only when they change, and removed rather than set to 0, so a
  // canvas with nothing over it looks exactly as it did before there was
  // any framing.
  createEffect(() => {
    const canvas = options.canvas()
    if (!canvas) return
    const { left, right, bottom } = covered()
    writeShare(canvas, COVERED_LEFT_KEY, left)
    writeShare(canvas, COVERED_RIGHT_KEY, right)
    writeShare(canvas, COVERED_BOTTOM_KEY, bottom)
  })

  const exportImage = createMemo(() => {
    const capture = options.onExportImage()
    return capture && captureVisiblePart(capture)
  })

  return { covered, viewShift, exportImage }
}
