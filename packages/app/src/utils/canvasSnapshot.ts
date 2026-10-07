/**
 * Snapshot a rendered canvas for the video encoder, at the size it encodes.
 *
 * `createImageBitmap(canvas)` is the obvious call and it is not safe here.
 * On some drivers the bitmap it returns from a WebGPU canvas behaves as a
 * live view of that canvas rather than a copy: read it immediately and it
 * holds the frame, but the encoder reads it a moment later, by which time
 * the canvas has been cleared for the next frame. Every frame of the file
 * then comes out black while an image export of the very same flame - which
 * goes through `toBlob` - is perfect. Reproduced on AMD + Vulkan in the
 * Chromium Playwright ships, with a 2D-canvas blit in between failing the
 * same way; neither the encoder nor the export can tell, the video is simply
 * black.
 *
 * Encoding the PNG bytes is a copy nothing can alias. It costs an encode per
 * frame, which is small beside accumulating the frame in the first place,
 * and it is the same read the image exporter has always used.
 *
 * Both animation exports capture through here: the job that renders off
 * screen (components/ExportJobs/OffscreenAnimationRender.tsx), and the main
 * canvas (utils/animationExport.ts), the path a user gets by default, which
 * kept the unsafe call after the job was fixed. `toBlob` reads the canvas when
 * it is called, so call this in the task that drew the frame.
 */
export async function snapshotCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): Promise<ImageBitmap> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })
  if (!blob) throw new Error('Could not read the rendered frame')
  return globalThis.createImageBitmap(blob, {
    resizeWidth: width,
    resizeHeight: height,
    resizeQuality: 'high',
  })
}
