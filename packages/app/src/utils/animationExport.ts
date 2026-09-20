import { DEBUG_MODE } from '@/defaults'
import { accumulatedPointCount, forceAnimationExportNow, qualityPointCountLimit, setAnimationExportCancel, setAnimationExportProgress, setAnimationExportRunning, setExportAccumulationFraction, setExportQuality, setForceAnimationExportNow, } from '@/flame/renderStats'
import { DEFAULT_SHUTTER_ANGLE, subFrameLimit, subFrameOffsets, } from '@/utils/motionBlur'
import { applyAudioMappingsToFlame, createAudioAnalyzer } from './audioAnalysis'
import { createAudioVideoEncoder } from './audioExport'
import { deepClone } from './clone'
import { createMetadataPayload, injectMetadataIntoMp4 } from './flameInMp4'
import { formatPointCount } from './formatPointCount'
import { logTime } from './logTime'
import { applyTimelineToFlameAtFrame } from './timeline'
import { createVideoEncoder } from './videoEncoder'
import type { AudioMappingEntry } from './audioAnalysis'
import type { FlameDescriptor, TimelineState } from './timeline'
import type { VideoEncoderConfig } from './videoEncoder'
import type { RecordedSession } from '@/recorder/schema'

const { performance } = globalThis

export type AnimationExportConfig = {
  quality: number
  /** Exact output dimensions (resolution + aspect already resolved). The main
   *  canvas is rendered at this size for the duration of the export. */
  width: number
  height: number
  fps: number
  frameStart: number
  frameEnd: number
  playCount: number
  codec: VideoEncoderConfig['codec']
  embedMetadata: boolean
  /** Recording association captured when the export was initiated. */
  session: RecordedSession | undefined
  /** When set, produce an MP4 with a synced AAC audio track (WebCodecs AudioEncoder). */
  audioBuffer?: AudioBuffer
  /** Audio-reactive mappings applied per frame (requires audioBuffer). */
  audioMapping?: AudioMappingEntry[]
  /** Number of temporal sub-frame accumulation passes per output frame (1 = disabled, 4 = smooth, 8 = high, 16 = cinematic). */
  motionBlurSamples?: number
  /** Shutter angle in degrees (e.g. 180 for standard cinematic 180-degree shutter). */
  shutterAngle?: number
}

function estimatePointCount(
  quality: number,
  height: number,
  zoom: number,
): number {
  const bucketInv = (height ** 2 * zoom ** 2) / 4
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

  // Snapshot the parts of the flame the per-frame writes below overwrite, so
  // they can be put back when the export ends (see restoreFlameState).
  // baseFlame is a reactive store proxy — deep-clone to a plain object.
  const baseFlameSnapshot = deepClone(baseFlame)

  const totalFrames = config.frameEnd - config.frameStart + 1
  const totalRenders = totalFrames * config.playCount
  // The canvas is already sized to the export dimensions (see
  // startAnimationExport), so encode at the canvas backing-store size.
  const resizeWidth = Math.round(canvas.width) & ~1 || 2
  const resizeHeight = Math.round(canvas.height) & ~1 || 2

  const zoom =
    baseFlame.renderSettings.camera?.zoom ??
    (baseFlame.renderSettings.camera as { zoom?: number } | undefined)?.zoom ??
    1

  const targetPointsPerFrame = estimatePointCount(
    config.quality,
    resizeHeight,
    zoom,
  )

  const promise = (async () => {
    const encoder = config.audioBuffer
      ? await createAudioVideoEncoder(
          {
            codec: config.codec,
            width: resizeWidth,
            height: resizeHeight,
            fps: config.fps,
          },
          config.audioBuffer,
          config.fps,
        )
      : await createVideoEncoder({
          codec: config.codec,
          width: resizeWidth,
          height: resizeHeight,
          fps: config.fps,
        })

    if (DEBUG_MODE) {
      console.info(
        `[AnimationExport ${logTime()}] start: ${totalRenders} frames @ ${config.fps}fps, quality ${config.quality}, ${resizeWidth}x${resizeHeight}, codec ${encoder.codec}${encoder.usedFallback ? ' (fallback)' : ''}${config.audioBuffer ? ', +audio' : ''}`,
      )
    }

    const audioAnalyzer =
      config.audioBuffer && config.audioMapping?.length
        ? await createAudioAnalyzer(config.audioBuffer, config.fps)
        : undefined

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
        const subOffsets = subFrameOffsets(
          config.motionBlurSamples ?? 1,
          config.shutterAngle ?? DEFAULT_SHUTTER_ANGLE,
        )
        const motionBlurSamples = subOffsets.length
        let subFrameIndex = 0

        function applySubFrame(subIdx: number) {
          const subFrame = frame + (subOffsets[subIdx] ?? 0)
          // Each sub-frame accumulates only up to its cumulative share of the
          // budget; otherwise the first export tick takes all of it.
          setExportAccumulationFraction(
            motionBlurSamples > 1
              ? (subIdx + 1) / motionBlurSamples
              : undefined,
          )

          // Advance the playhead so anything resolved from currentFrame tracks this subFrame.
          timeline.setCurrentFrame(subFrame)

          // Clone flame and apply timeline for this subFrame
          const flameClone = deepClone(baseFlame)
          applyTimelineToFlameAtFrame(timeline, flameClone, subFrame)

          // Apply audio-reactive mappings if configured
          if (audioAnalyzer && config.audioMapping) {
            const audioFrame = frameIndex % audioAnalyzer.totalFrames
            const frameData = audioAnalyzer.getFrameData(audioFrame)
            applyAudioMappingsToFlame(
              flameClone,
              frameData,
              config.audioMapping,
            )
          }

          // Set flame descriptor to the per-frame clone so Flam3 picks it up
          setFlameDescriptor((draft) => {
            draft.renderSettings = flameClone.renderSettings
            draft.transforms = flameClone.transforms
          })
        }

        applySubFrame(0)
        setExportQuality(config.quality)
        // A new output frame starts from an empty buffer. Report it now, which
        // resets accumulation through Flam3's export-frame effect, instead of
        // on the first export tick: that tick still reads the previous frame's
        // total, which met every sub-frame limit and skipped straight past
        // this frame's first sub-frames.
        updateProgress(0, qualityPointCountLimit()())

        frameAccumStartMs = performance.now()
        if (DEBUG_MODE) {
          console.info(
            `[AnimExport ${logTime()}] setup frame ${frameIndex + 1}/${totalRenders} (timeline frame ${frame}${motionBlurSamples > 1 ? `, ${motionBlurSamples}x motion blur` : ''})`,
          )
        }
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

            // Accumulate subsequent sub-frames into the same buffer if motion blur is active
            if (
              motionBlurSamples > 1 &&
              subFrameIndex < motionBlurSamples - 1
            ) {
              const subLimit = subFrameLimit(
                subFrameIndex,
                motionBlurSamples,
                limit,
              )
              if (current >= subLimit) {
                subFrameIndex++
                applySubFrame(subFrameIndex)
              }
              return
            }

            if (current < limit) return

            // Wait until the final color-graded image is actually on the canvas
            // (the renderer draws it in the same submission that crosses the
            // limit and reports it here) — never capture a stale preview.
            if (info?.finalImageReady !== true) return

            // Quality reached for this frame — capture canvas before clearing
            // export state so Flam3 doesn't overwrite the canvas first.
            if (DEBUG_MODE) {
              const sinceSetup = performance.now() - frameAccumStartMs
              const frameNo = config.frameStart + (frameIndex % totalFrames)
              console.info(
                `[AnimExport ${logTime()}] capture frame ${frameIndex + 1}/${totalRenders} (timeline frame ${frameNo}): ${current}/${limit} pts (${(current / Math.max(1, limit)).toFixed(2)}x), ${sinceSetup.toFixed(0)}ms after setup${sinceSetup < 8 ? ' ⚠ STALE-CAPTURE? (too fast to have re-rendered)' : ''}`,
              )
            }
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
                setExportAccumulationFraction(undefined)

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
                setExportAccumulationFraction(undefined)
                reject(err instanceof Error ? err : new Error(String(err)))
              })
          },
        )
      }

      /**
       * Put back exactly what the export overwrote, and nothing else.
       *
       * The per-frame setup above writes `renderSettings` and `transforms`
       * for every frame it renders, so both are the export's to return.
       * `metadata` is not: nothing here ever writes it, and restoring it
       * reverted a name or a description typed while the export ran. A
       * main-canvas animation export takes minutes and the editor stays
       * usable throughout, so that is a real edit being silently undone at
       * the moment the export happens to finish.
       */
      function restoreFlameState() {
        setFlameDescriptor((draft) => {
          draft.renderSettings = baseFlameSnapshot.renderSettings
          draft.transforms = baseFlameSnapshot.transforms
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
              baseFlame,
              timeline.tracks(),
              timeline.config(),
              config.session,
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
          setExportAccumulationFraction(undefined)
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
        setExportAccumulationFraction(undefined)
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
    // Clear the blur cap now, not when the loop next notices the cancel: if no
    // export callback fires again, a stale fraction would cap the live view.
    setExportAccumulationFraction(undefined)
    setAnimationExportRunning(false)
    setAnimationExportCancel(undefined)
    setAnimationExportProgress(undefined)
    setForceAnimationExportNow(false)
  }

  setAnimationExportCancel(() => cancel)

  return { cancel, promise }
}
