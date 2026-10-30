// One PNG of the renderer's final frame, through the export-image hook: the
// share card's capture (MainWorkspace `captureOgImageBlob`).
import type { ExportImageType } from '@/flame/exportImageType'

export interface CaptureFinalFrameOptions {
  /** Installs the hook, or removes it with `undefined`. */
  setHook: (hook: ExportImageType | undefined) => void
  /** Starts the render that answers the hook (the export driver). */
  start: () => void
  /** Stops it again; called once, however the capture ends. */
  stop: () => void
  /** Called in the same call the pixels are taken in, to freeze what drew them. */
  onTaken?: () => void
  /** No frame by then resolves `null`. */
  timeoutMs: number
}

/**
 * Resolves with a PNG of the first frame the renderer marks
 * `finalImageReady`, or `null` when none comes within `timeoutMs`.
 *
 * Only that first frame is encoded. The renderer keeps calling the hook with
 * `finalImageReady` on every idle tick until it is removed, and those later
 * calls do not render: they hand over the canvas as it was presented, which
 * Chrome can read back as fully transparent, and the visible-part copy
 * (`captureVisiblePart`) makes them a new copy each time. Encoding each one
 * and keeping whichever blob came back first let a blank PNG, which encodes
 * several times faster than the flame, win the race and become the card.
 */
export function captureFinalFrame(
  options: CaptureFinalFrameOptions,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let taken = false
    let settled = false
    const finish = (blob: Blob | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.setHook(undefined)
      options.stop()
      resolve(blob)
    }
    // Best-effort with a generous safety net: never hang the share flow.
    const timer = setTimeout(() => {
      finish(null)
    }, options.timeoutMs)
    options.setHook((canvas, info) => {
      if (taken || info?.finalImageReady !== true) return
      taken = true
      clearTimeout(timer)
      options.onTaken?.()
      canvas.toBlob(
        (blob) => {
          finish(blob)
        },
        'image/png',
        1,
      )
    })
    options.start()
  })
}
