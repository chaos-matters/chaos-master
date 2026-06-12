import { DEBUG_MODE } from '@/defaults'
import { accumulatedPointCount, forceAnimationExportNow, qualityPointCountLimit, setAnimationExportCancel, setAnimationExportProgress, setAnimationExportRunning, setExportQuality, setForceAnimationExportNow, } from '@/flame/renderStats'
import { createMetadataPayload, injectMetadataIntoMp4 } from './flameInMp4'
import { formatPointCount } from './formatPointCount'
import { logTime } from './logTime'
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
    cb:
      | ((
          canvas: HTMLCanvasElement,
          info?: { finalImageReady: boolean },
        ) => void)
      | undefined,
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

    if (DEBUG_MODE) {
      console.info(
        `[AnimationExport ${logTime()}] start: ${totalRenders} frames @ ${config.fps}fps, quality ${config.quality}, ${resizeWidth}x${resizeHeight}, codec ${encoder.codec}${encoder.usedFallback ? ' (MediaRecorder fallback)' : ''}`,
      )
    }

    return new Promise<Blob>((resolve, reject) => {
      let frameIndex = 0
      const startedAt = performance.now()
      let lastProgressUpdateMs = 0
      let frameAccumStartMs = performance.now()

      function updateProgress(currentPointCount: number, targetPoints: number) {
        // The export driver ticks every few milliseconds — throttle the store
        // updates so UI re-renders don't compete with the export itself.
        // Frame transitions (currentPointCount === 0) always pass through.
        const now = performance.now()
        if (currentPointCount !== 0 && now - lastProgressUpdateMs < 100) {
          return
        }
        lastProgressUpdateMs = now
        const frame = config.frameStart + (frameIndex % totalFrames)
        setAnimationExportProgress({
          currentFrame: frameIndex,
          totalFrames: totalRenders,
          currentPointCount,
          targetPointsPerFrame: targetPoints,
          totalFramesComplete: frameIndex,
          currentTimelineFrame: frame,
          startedAt,
          status: 'rendering',
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

          draft.transforms = flameClone.transforms
          draft.edgeFadeColor = flameClone.edgeFadeColor
        })

        setExportQuality(config.quality)

        frameAccumStartMs = performance.now()
        let capturing = false

        type ExportInfo = { finalImageReady: boolean }
        setOnExportImage(
          () => (exportCanvas: HTMLCanvasElement, info?: ExportInfo) => {
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

            // Wait until the final color-graded image is actually on the canvas
            // (the renderer draws it in the same submission that crosses the
            // limit and reports it here) — never capture a stale preview.
            if (info?.finalImageReady !== true) return

            // Quality reached for this frame — capture canvas before clearing
            // export state so Flam3 doesn't overwrite the canvas first.
            capturing = true

            const captureStartTime = performance.now()

            // eslint-disable-next-line no-restricted-globals
            createImageBitmap(exportCanvas, {
              resizeWidth,
              resizeHeight,
              resizeQuality: 'high',
            })
              .then(async (bitmap) => {
                const captureTime = performance.now() - captureStartTime
                // Only clear export state after the bitmap is captured
                setOnExportImage(undefined)
                setExportQuality(undefined)

                if (cancelled) {
                  bitmap.close()
                  cleanup()
                  resolve(new Blob())
                  return
                }

                const encodeStartTime = performance.now()
                // encodeFrame applies encoder backpressure (bounded queue) and
                // closes the bitmap when done.
                await encoder.encodeFrame(bitmap, frameIndex)
                const encodeTime = performance.now() - encodeStartTime
                if (DEBUG_MODE) {
                  const accumSec = Math.max(
                    (captureStartTime - frameAccumStartMs) / 1000,
                    0.001,
                  )
                  console.info(
                    `[AnimationExport ${logTime()}] Frame ${frameIndex + 1}/${totalRenders}: ${formatPointCount(current)} pts in ${accumSec.toFixed(2)}s (${formatPointCount(current / accumSec)} pts/s), captured ${captureTime.toFixed(1)}ms, encoded ${encodeTime.toFixed(1)}ms`,
                  )
                }

                frameIndex++
                capturing = false
                processNextFrame()
              })
              .catch((err: unknown) => {
                capturing = false
                reject(err instanceof Error ? err : new Error(String(err)))
              })
          },
        )
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
        if (DEBUG_MODE) {
          console.info(
            `[AnimationExport ${logTime()}] finalizing: ${frameIndex} frames in ${((performance.now() - startedAt) / 1000).toFixed(1)}s total`,
          )
        }

        // Notify UI that we are now encoding
        setAnimationExportProgress((prev) =>
          prev ? { ...prev, status: 'encoding' } : prev,
        )

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
        } finally {
          setAnimationExportCancel(undefined)
          setAnimationExportRunning(false)
          setAnimationExportProgress(undefined)
          setForceAnimationExportNow(false)
          setOnExportImage(undefined)
          setExportQuality(undefined)
          restoreFlameState()
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
