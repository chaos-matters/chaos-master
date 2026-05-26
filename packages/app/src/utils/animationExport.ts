import { accumulatedPointCount, forceAnimationExportNow, qualityPointCountLimit, setAnimationExportCancel, setAnimationExportProgress, setAnimationExportRunning, setExportQuality, setForceAnimationExportNow, } from '@/flame/renderStats'
import { createMetadataPayload, injectMetadataIntoMp4 } from './flameInMp4'
import { applyTimelineToFlameAtFrame } from './timeline'
import { createVideoEncoder } from './videoEncoder'
import type { FlameDescriptor, TimelineState } from './timeline'
import type { VideoEncoderConfig } from './videoEncoder'
import type { FlameDescriptor as SchemaFlameDescriptor } from '@/flame/schema/flameSchema'

const { performance } = globalThis

export type AnimationExportConfig = {
  quality: number
  resolution: number
  fps: number
  frameStart: number
  frameEnd: number
  playCount: number
  codec: VideoEncoderConfig['codec']
  embedMetadata: boolean
}

function estimatePointCount(
  quality: number,
  resolution: number,
  zoom: number,
): number {
  const baseHeight = 800 * resolution
  const bucketInv = (baseHeight ** 2 * zoom ** 2) / 4
  const denom = (quality - 1) ** 2
  if (denom === 0) return Infinity
  return Math.round(bucketInv / denom)
}

export function createAnimationExport(
  config: AnimationExportConfig,
  canvas: HTMLCanvasElement,
  timeline: TimelineState,
  baseFlame: FlameDescriptor,
  setFlameDescriptor: (setter: (draft: FlameDescriptor) => void) => void,
  setOnExportImage: (
    cb: ((canvas: HTMLCanvasElement) => void) | undefined,
  ) => void,
): { cancel: () => void; promise: Promise<Blob> } {
  let cancelled = false

  // Snapshot original flame state so we can restore it after export.
  // baseFlame is a reactive store proxy — deep-clone to a plain object.
  const baseFlameSnapshot = JSON.parse(
    JSON.stringify(baseFlame),
  ) as FlameDescriptor

  const totalFrames = config.frameEnd - config.frameStart + 1
  const totalRenders = totalFrames * config.playCount
  const resizeWidth = Math.round(canvas.width * config.resolution) & ~1 || 2
  const resizeHeight = Math.round(canvas.height * config.resolution) & ~1 || 2

  const zoom =
    baseFlame.renderSettings.camera?.zoom ??
    (baseFlame.renderSettings.camera as { zoom?: number } | undefined)?.zoom ??
    1

  const targetPointsPerFrame = estimatePointCount(
    config.quality,
    config.resolution,
    zoom,
  )

  const promise = (async () => {
    const encoder = await createVideoEncoder({
      codec: config.codec,
      width: resizeWidth,
      height: resizeHeight,
      fps: config.fps,
    })

    return new Promise<Blob>((resolve, reject) => {
      let frameIndex = 0
      const startedAt = performance.now()

      function updateProgress(currentPointCount: number, targetPoints: number) {
        const frame = config.frameStart + (frameIndex % totalFrames)
        setAnimationExportProgress({
          currentFrame: frameIndex,
          totalFrames: totalRenders,
          currentPointCount,
          targetPointsPerFrame: targetPoints,
          totalFramesComplete: frameIndex,
          currentTimelineFrame: frame,
          startedAt,
        })
      }

      function processNextFrame() {
        if (cancelled) {
          cleanup()
          resolve(new Blob())
          return
        }

        // "Stop & Save": finalize the video with all frames rendered so far
        if (forceAnimationExportNow()) {
          setForceAnimationExportNow(false)
          if (frameIndex > 0) {
            void finishExport()
          } else {
            // No frames rendered yet — treat as a cancel
            cleanup()
            resolve(new Blob())
          }
          return
        }

        if (frameIndex >= totalRenders) {
          void finishExport()
          return
        }

        const frame = config.frameStart + (frameIndex % totalFrames)

        // Clone flame and apply timeline for this frame
        const flameClone = JSON.parse(
          JSON.stringify(baseFlame),
        ) as FlameDescriptor
        applyTimelineToFlameAtFrame(timeline, flameClone, frame)

        // Set flame descriptor to the per-frame clone so Flam3 picks it up
        setFlameDescriptor((draft) => {
          // Apply render settings
          draft.renderSettings = flameClone.renderSettings
          // Apply transforms
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          draft.transforms = flameClone.transforms as any
          draft.edgeFadeColor = flameClone.edgeFadeColor
        })

        setExportQuality(config.quality)

        let capturing = false

        setOnExportImage(() => (exportCanvas: HTMLCanvasElement) => {
          if (capturing) return

          if (cancelled) {
            cleanup()
            resolve(new Blob())
            return
          }

          const limitFn = qualityPointCountLimit()
          const limit = limitFn()
          const current = accumulatedPointCount()

          updateProgress(current, limit)

          if (current < limit) return

          // Quality reached for this frame — capture canvas before clearing
          // export state so Flam3 doesn't overwrite the canvas first.
          capturing = true

          // eslint-disable-next-line no-restricted-globals
          createImageBitmap(exportCanvas, {
            resizeWidth,
            resizeHeight,
            resizeQuality: 'high',
          })
            .then((bitmap) => {
              // Only clear export state after the bitmap is captured
              setOnExportImage(undefined)
              setExportQuality(undefined)

              if (cancelled) {
                bitmap.close()
                cleanup()
                resolve(new Blob())
                return
              }
              encoder.encodeFrame(bitmap, frameIndex)
              frameIndex++
              capturing = false
              processNextFrame()
            })
            .catch((err: unknown) => {
              capturing = false
              reject(err instanceof Error ? err : new Error(String(err)))
            })
        })
      }

      function restoreFlameState() {
        setFlameDescriptor((draft) => {
          draft.renderSettings = baseFlameSnapshot.renderSettings
          draft.transforms = baseFlameSnapshot.transforms
          draft.edgeFadeColor = baseFlameSnapshot.edgeFadeColor
          draft.metadata = baseFlameSnapshot.metadata
        })
      }

      async function finishExport() {
        setAnimationExportCancel(undefined)
        setAnimationExportRunning(false)
        setAnimationExportProgress(undefined)
        setForceAnimationExportNow(false)
        setOnExportImage(undefined)
        setExportQuality(undefined)
        restoreFlameState()

        try {
          const result = await encoder.finalize()

          if (config.embedMetadata && !result.usedFallback) {
            const mp4Buffer = await result.blob.arrayBuffer()
            const payload = await createMetadataPayload(
              baseFlame as SchemaFlameDescriptor,
              timeline.tracks(),
              timeline.config(),
            )
            const patchedBuffer = injectMetadataIntoMp4(mp4Buffer, payload)
            resolve(new Blob([patchedBuffer], { type: result.mimeType }))
          } else {
            resolve(result.blob)
          }
        } catch (e: unknown) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      }

      function cleanup() {
        setAnimationExportCancel(undefined)
        setAnimationExportRunning(false)
        setAnimationExportProgress(undefined)
        setForceAnimationExportNow(false)
        setOnExportImage(undefined)
        setExportQuality(undefined)
        restoreFlameState()
        encoder.cancel()
      }

      setAnimationExportRunning(true)
      updateProgress(0, targetPointsPerFrame)
      processNextFrame()
    })
  })()

  const cancel = () => {
    cancelled = true
    setAnimationExportRunning(false)
    setAnimationExportCancel(undefined)
    setAnimationExportProgress(undefined)
    setForceAnimationExportNow(false)
  }

  setAnimationExportCancel(() => cancel)

  return { cancel, promise }
}
