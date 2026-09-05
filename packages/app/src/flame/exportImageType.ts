export type ExportImageInfo = {
  /** True when the canvas holds a final color-graded image at the requested
   *  quality limit, i.e. it is safe to capture the canvas for an export. */
  finalImageReady: boolean
}

export type ExportImageType = (
  canvas: HTMLCanvasElement,
  info?: ExportImageInfo,
) => void
