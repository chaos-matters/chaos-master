import { batch, createResource, createSignal, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { glideFrameQuality, resolveGlideQuality } from '@/flame/glide/quality'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { assertReplayVideoStatePortable, createReplayVideoDriver, createReplayVideoSchedule, drawReplayVideoOverlay, replayFramesInStateRun, replayStateAtFrame, replayVideoVisualFingerprint, } from '@/recorder/replayVideo'
import { applyAudioMappingsToFlame, createAudioAnalyzer, } from '@/utils/audioAnalysis'
import { createAudioVideoEncoder } from '@/utils/audioExport'
import { deepClone } from '@/utils/clone'
import { dismissJob, jobExists, setAnimationJobPoints, setAnimationJobProgress, setJobError, setJobResult, } from '@/utils/exportJobs'
import { createMetadataPayload, injectMetadataIntoMp4, } from '@/utils/flameInMp4'
import { DEFAULT_SHUTTER_ANGLE, subFrameLimit, subFrameOffsets, } from '@/utils/motionBlur'
import { applyTracksToFlame, loopOptsFromConfig, resolveLoopValue, } from '@/utils/timeline'
import { createVideoEncoder } from '@/utils/videoEncoder'
import type { Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { ExportImageType } from '@/flame/exportImageType'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { ReplayVideoStateAt } from '@/recorder/replayVideo'
import type { AnimationJob } from '@/utils/exportJobs'

const PROGRESS_THROTTLE_MS = 100

/** A read-only Signal whose getter is reactive — interactive cameras are off, so
 *  the setter is never called. Lets the offscreen camera follow the per-frame
 *  flame (e.g. animated camera moves). */
function readonlySignal<T>(get: () => T): Signal<T> {
  return [get, (() => undefined) as unknown as Setter<T>]
}

/**
 * Renders an animation export OFFSCREEN, frame by frame, into its own WebGPU
 * Root + video encoder, so the workspace stays usable. Mirrors the frame loop of
 * createAnimationExport (utils/animationExport.ts) but drives a local offscreen
 * Flam3 and reports to the jobs store instead of the global export signals.
 */
export function OffscreenAnimationRender(props: { job: AnimationJob }) {
  const { job } = props
  const replaySchedule =
    job.replayVideo && job.session
      ? createReplayVideoSchedule(
          job.session,
          job.replayVideo.playbackSpeed,
          job.fps,
          job.replayVideo.leadInMs,
          job.replayVideo.tailMs,
          job.replayVideo.glide,
        )
      : undefined
  const replayDriver =
    replaySchedule && job.session
      ? createReplayVideoDriver(job.session)
      : undefined
  const initialReplayState: ReplayVideoStateAt = replaySchedule
    ? replayStateAtFrame(replaySchedule, 0)
    : { actionIndex: -1, glideT: 1 }
  let replayState = replayDriver?.advanceTo(
    initialReplayState.actionIndex,
    initialReplayState.glideT,
    initialReplayState.takeMs,
  )
  let replayVisualKey = replayState
    ? replayVideoVisualFingerprint(replayState)
    : undefined
  /**
   * Quality while a glide moves.
   *
   * Every glide frame is a different flame, so the accumulation restarts and
   * each one costs a full convergence: an 800 ms transition at 24 fps is
   * nineteen extra converged renders per step. The eye does not resolve detail
   * in motion and the settled frame is the one people screenshot, so the
   * intermediates render at a fraction of the job's quality and the settled
   * frame at all of it.
   */
  const glideQuality = resolveGlideQuality(job.replayVideo?.glide?.tier)
  const [perFrameQuality, setPerFrameQuality] = createSignal(
    glideFrameQuality(job.quality, glideQuality, initialReplayState.glideT),
  )

  const totalFrames = job.frameEnd - job.frameStart + 1
  const totalRenders = totalFrames * Math.max(1, job.playCount)
  const resizeWidth = Math.round(job.dimensions.width) & ~1 || 2
  const resizeHeight = Math.round(job.dimensions.height) & ~1 || 2

  const loopOpts = loopOptsFromConfig(job.config, job.tracks)

  // Motion blur: N sub-frames per output frame, accumulated into one buffer.
  // Replay videos composite discrete recorded states and take no blur.
  const subOffsets = replaySchedule
    ? [0]
    : subFrameOffsets(
        job.motionBlurSamples ?? 1,
        job.shutterAngle ?? DEFAULT_SHUTTER_ANGLE,
      )
  const blurSamples = subOffsets.length
  let subFrameIndex = 0
  // Only a blurred render needs Flam3 to hold accumulation across flame
  // changes; without blur the fingerprint-driven reset stays exactly as it was.
  const [exportFrameKey, setExportFrameKey] = createSignal(0)
  const frameKeyProp = () => (blurSamples > 1 ? exportFrameKey() : undefined)
  // Each sub-frame may accumulate only up to its cumulative share of the
  // budget; see Flam3's accumulationFraction.
  const [subFraction, setSubFraction] = createSignal(1 / blurSamples)
  const fractionProp = () => (blurSamples > 1 ? subFraction() : undefined)

  const [audioAnalyzer] = createResource(
    () =>
      !replaySchedule && job.audioBuffer && job.audioMapping?.length
        ? ({ buf: job.audioBuffer, fps: job.fps } as const)
        : null,
    async (src) => {
      if (!src) return undefined
      return await createAudioAnalyzer(src.buf, src.fps)
    },
  )

  /** The flame at timeline `frame`, fractional for a motion blur sub-frame.
   *  Audio stays on the whole frame, as on the main-canvas path. */
  function frameFlame(frame: number): FlameDescriptor {
    const clone = deepClone(job.flame)
    applyTracksToFlame(job.tracks, clone, frame, loopOpts)
    const analyzer = audioAnalyzer()
    if (analyzer && job.audioMapping) {
      const audioFrame = Math.floor(frame) % analyzer.totalFrames
      const frameData = analyzer.getFrameData(audioFrame)
      applyAudioMappingsToFlame(clone, frameData, job.audioMapping)
    }
    return clone
  }

  // The morph animates `blendWeight` via its own track (not part of the flame
  // descriptor), so resolve it per frame here — otherwise the export would blend
  // at one fixed weight and the morph wouldn't animate. Respects the loop mode.
  const blendWeightTrack = job.tracks.find(
    (t) => t.parameterPath === 'blendWeight',
  )

  function blendWeightAtFrame(frame: number): number {
    if (!blendWeightTrack) return job.blendWeight
    const v = resolveLoopValue(blendWeightTrack.keyframes, frame, loopOpts)
    return typeof v === 'number' ? v : job.blendWeight
  }

  const [perFrameFlame, setPerFrameFlame] = createSignal<FlameDescriptor>(
    replayState?.flame ?? frameFlame(job.frameStart),
  )
  const [perFrameBlendWeight, setPerFrameBlendWeight] = createSignal(
    replayState?.blendWeight ?? blendWeightAtFrame(job.frameStart),
  )
  const [perFrameBlendFlame, setPerFrameBlendFlame] = createSignal(
    replayState?.blendFlame ?? job.blendFlame,
  )
  const [perFramePalette, setPerFramePalette] = createSignal(
    replayState?.palette ?? job.palette,
  )
  const [perFrameAdaptiveFilter, setPerFrameAdaptiveFilter] = createSignal(
    replayState?.adaptiveFilter ?? true,
  )
  const [perFrameStochasticFilter, setPerFrameStochasticFilter] = createSignal(
    replayState?.stochasticFilter ?? false,
  )
  const is3D = () => (perFrameFlame().renderSettings.dimensions ?? 2) === 3

  // Camera accessors follow the per-frame flame so animated camera moves bake in.
  const cam = () => perFrameFlame().renderSettings.camera
  const c3d = () =>
    perFrameFlame().renderSettings.camera3D ?? {
      theta: 0,
      phi: Math.PI / 2,
      radius: 5,
      target: [0, 0, 0] as [number, number, number],
      fov: 60,
      roll: 0,
    }
  const zoom = readonlySignal(() => cam().zoom)
  const rotation = () => cam().rotation ?? 0
  const position = readonlySignal<v2f>(() =>
    vec2f(cam().position[0], cam().position[1]),
  )
  const theta = readonlySignal(() => c3d().theta)
  const phi = readonlySignal(() => c3d().phi)
  const radius = readonlySignal(() => c3d().radius)
  const target = readonlySignal<Vec3>(() => new Float32Array(c3d().target))
  const fov = readonlySignal(() => c3d().fov)
  const roll = readonlySignal(() => c3d().roll ?? 0)

  let frameIndex = 0
  let capturing = false
  let finishing = false
  let disposed = false
  let lastProgressMs = 0
  let accumulated = 0
  let limitAccessor: () => number = () => 0
  let posterUrl: string | undefined
  let encoder: Awaited<ReturnType<typeof createVideoEncoder>> | undefined
  let compositeCanvas: HTMLCanvasElement | undefined
  let compositeContext: CanvasRenderingContext2D | undefined

  onCleanup(() => {
    disposed = true
    encoder?.cancel()
  })

  void (async () => {
    try {
      const nextEncoder =
        job.audioBuffer && !replaySchedule
          ? await createAudioVideoEncoder(
              {
                codec: job.codec,
                width: resizeWidth,
                height: resizeHeight,
                fps: job.fps,
              },
              job.audioBuffer,
              job.fps,
            )
          : await createVideoEncoder({
              codec: job.codec,
              width: resizeWidth,
              height: resizeHeight,
              fps: job.fps,
            })
      // MediaRecorder's captureStream fallback advances in wall-clock time,
      // while a semantic replay deliberately renders frames off-line and may
      // reuse one accumulated artwork frame many times. Accepting that fallback
      // would produce the wrong pacing and no embedded session metadata.
      if (replaySchedule && nextEncoder.usedFallback) {
        nextEncoder.cancel()
        throw new Error(
          'Replay video export needs browser support for offline video encoding',
        )
      }
      encoder = nextEncoder
      if (disposed) encoder.cancel()
    } catch (err) {
      setJobError(job.id, err instanceof Error ? err.message : String(err))
    }
  })()

  async function finish() {
    if (!encoder || finishing) return
    finishing = true
    setAnimationJobProgress(job.id, frameIndex, totalRenders, 'encoding')
    try {
      const result = await encoder.finalize()
      if (!jobExists(job.id)) return
      let blob = result.blob
      if (job.embedMetadata && !result.usedFallback) {
        const mp4Buffer = await result.blob.arrayBuffer()
        const payload = await createMetadataPayload(
          job.flame,
          job.tracks,
          job.config,
          job.session,
        )
        blob = new Blob([injectMetadataIntoMp4(mp4Buffer, payload)], {
          type: result.mimeType,
        })
      }
      if (!jobExists(job.id)) return
      setJobResult(job.id, {
        blobUrl: URL.createObjectURL(blob),
        width: resizeWidth,
        height: resizeHeight,
        frames: frameIndex,
        posterUrl,
      })
    } catch (err) {
      setJobError(job.id, err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * Snapshot the rendered canvas for the encoder.
   *
   * `createImageBitmap(canvas)` is the obvious call and it is not safe here.
   * On some drivers the bitmap it returns from a WebGPU canvas behaves as a
   * live view of that canvas rather than a copy: read it immediately and it
   * holds the frame, but the encoder reads it a moment later, by which time
   * the canvas has been cleared for the next frame. Every frame of the file
   * then comes out black while an image export of the very same flame — which
   * goes through `toBlob` — is perfect. Reproduced on AMD + Vulkan in the
   * Chromium Playwright ships, with a 2D-canvas blit in between failing the
   * same way; neither the encoder nor the job can tell, the video is simply
   * black.
   *
   * Encoding the PNG bytes is a copy nothing can alias. It costs an encode per
   * frame, which is small beside accumulating the frame in the first place,
   * and it is the same read the image exporter has always used.
   */
  async function snapshotFrame(
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

  function queuePoster(canvas: HTMLCanvasElement) {
    if (frameIndex !== 0) return
    // A poster-less <video> often shows a blank/green undecoded frame.
    canvas.toBlob((blob) => {
      if (blob && !disposed) posterUrl = URL.createObjectURL(blob)
    }, 'image/png')
  }

  function updateReplayState(at: ReplayVideoStateAt): boolean {
    if (!replayDriver) return false
    // Inside a play window every frame has its own take time, so the
    // playhead advances as the in-app replay moves it.
    const next = replayDriver.advanceTo(at.actionIndex, at.glideT, at.takeMs)
    assertReplayVideoStatePortable(next, at.actionIndex)
    setPerFrameQuality(glideFrameQuality(job.quality, glideQuality, at.glideT))
    const nextVisualKey = replayVideoVisualFingerprint(next)
    const visualChanged = nextVisualKey !== replayVisualKey
    replayState = next
    replayVisualKey = nextVisualKey
    if (!visualChanged) return false

    setPerFrameFlame(next.flame)
    setPerFrameBlendFlame(() => next.blendFlame)
    setPerFrameBlendWeight(next.blendWeight)
    setPerFramePalette(() => next.palette)
    setPerFrameAdaptiveFilter(next.adaptiveFilter)
    setPerFrameStochasticFilter(next.stochasticFilter)
    return true
  }

  function getCompositeSurface(): {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
  } {
    compositeCanvas ??= document.createElement('canvas')
    compositeCanvas.width = resizeWidth
    compositeCanvas.height = resizeHeight
    compositeContext ??=
      compositeCanvas.getContext('2d', { alpha: false }) ?? undefined
    if (!compositeContext) {
      throw new Error('Could not create the replay-video composition canvas')
    }
    return { canvas: compositeCanvas, context: compositeContext }
  }

  async function captureReplayStateRuns(canvas: HTMLCanvasElement) {
    if (!encoder || !replaySchedule || !job.session) return
    const rendered = await snapshotFrame(canvas, resizeWidth, resizeHeight)
    if (disposed) {
      rendered.close()
      return
    }
    const composite = getCompositeSurface()
    try {
      while (frameIndex < totalRenders) {
        const runFrames = replayFramesInStateRun(replaySchedule, frameIndex)
        for (let offset = 0; offset < runFrames; offset++) {
          if (disposed || (props.job.forceExport && frameIndex > 0)) return
          const { actionIndex } = replayStateAtFrame(replaySchedule, frameIndex)
          composite.context.clearRect(0, 0, resizeWidth, resizeHeight)
          composite.context.drawImage(rendered, 0, 0, resizeWidth, resizeHeight)
          drawReplayVideoOverlay(composite.context, resizeWidth, resizeHeight, {
            action:
              actionIndex < 0 ? undefined : job.session.actions[actionIndex],
            actionIndex,
            totalActions: job.session.actions.length,
            progress: totalRenders <= 1 ? 1 : frameIndex / (totalRenders - 1),
            flameName: job.session.initial.metadata?.name,
          })
          queuePoster(composite.canvas)
          const bitmap = await globalThis.createImageBitmap(composite.canvas)
          if (disposed) {
            bitmap.close()
            return
          }
          await encoder.encodeFrame(bitmap, frameIndex)
          frameIndex++
          setAnimationJobProgress(job.id, frameIndex, totalRenders, 'rendering')
        }

        if (
          frameIndex >= totalRenders ||
          props.job.forceExport ||
          updateReplayState(replayStateAtFrame(replaySchedule, frameIndex))
        ) {
          return
        }
        // The next step changed only non-rendered state. Keep using this exact
        // artwork frame while advancing its caption/progress run rather than
        // waiting for a GPU reset that will (correctly) never happen.
      }
    } finally {
      rendered.close()
    }
  }

  async function captureAndAdvance(canvas: HTMLCanvasElement) {
    if (!encoder) {
      capturing = false
      return
    }
    if (replaySchedule) {
      await captureReplayStateRuns(canvas)
    } else {
      queuePoster(canvas)
      const bitmap = await snapshotFrame(canvas, resizeWidth, resizeHeight)
      if (disposed) {
        bitmap.close()
        return
      }
      // encodeFrame applies backpressure and closes the bitmap.
      await encoder.encodeFrame(bitmap, frameIndex)
      frameIndex++
    }
    capturing = false
    if (disposed) return
    setAnimationJobProgress(job.id, frameIndex, totalRenders, 'rendering')
    if (frameIndex >= totalRenders || props.job.forceExport) {
      void finish()
      return
    }
    // Advancing the flame changes Flam3's accumulationFingerprint, which resets
    // accumulation so the next frame renders fresh.
    if (!replaySchedule) {
      subFrameIndex = 0
      // The count Flam3 reports next is for the fresh buffer; do not let the
      // previous frame's total skip this frame's first sub-frame.
      accumulated = 0
      batch(() => {
        setExportFrameKey((key) => key + 1)
        showSubFrame(0)
      })
    }
  }

  /** Point the renderer at sub-frame `subIndex` of the current output frame. */
  function showSubFrame(subIndex: number) {
    const frame = job.frameStart + (frameIndex % totalFrames)
    const t = frame + (subOffsets[subIndex] ?? 0)
    setSubFraction((subIndex + 1) / blurSamples)
    setPerFrameFlame(frameFlame(t))
    setPerFrameBlendWeight(blendWeightAtFrame(t))
  }

  const handleExport: ExportImageType = (canvas, info) => {
    if (disposed || capturing || finishing || !encoder) return

    // Per-frame point progress, so a long single frame still shows movement.
    const now = globalThis.performance.now()
    if (now - lastProgressMs >= PROGRESS_THROTTLE_MS) {
      lastProgressMs = now
      setAnimationJobPoints(job.id, accumulated, limitAccessor())
    }

    // "Stop & Save": finalize with the frames rendered so far (or cancel if none).
    if (props.job.forceExport) {
      if (frameIndex === 0) {
        dismissJob(job.id)
        return
      }
      void finish()
      return
    }

    // Motion blur: step to the next sub-frame each time the running point count
    // crosses its share of the budget, without clearing the buffer -- Flam3
    // holds accumulation while exportFrameKey is set. Only the last sub-frame
    // is captured. The same rule as utils/animationExport.ts.
    if (blurSamples > 1 && subFrameIndex < blurSamples - 1) {
      const subLimit = subFrameLimit(
        subFrameIndex,
        blurSamples,
        limitAccessor(),
      )
      if (accumulated >= subLimit) {
        subFrameIndex++
        showSubFrame(subFrameIndex)
      }
      return
    }

    if (info?.finalImageReady !== true) return
    capturing = true
    void captureAndAdvance(canvas).catch((err: unknown) => {
      capturing = false
      setJobError(job.id, err instanceof Error ? err.message : String(err))
    })
  }

  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <AutoCanvas fixedResolution={job.dimensions} alphaMode="opaque">
        <Show
          when={is3D()}
          fallback={
            <WheelZoomCamera2D
              zoom={zoom}
              position={position}
              rotation={rotation}
              interactive={() => false}
            >
              <Flam3
                quality={perFrameQuality()}
                pointCountPerBatch={DEFAULT_POINT_COUNT}
                adaptiveFilterEnabled={perFrameAdaptiveFilter()}
                stochasticFilterEnabled={perFrameStochasticFilter()}
                animationEnabled={false}
                exportDriver
                exportFrameKey={frameKeyProp()}
                accumulationFraction={fractionProp()}
                flameDescriptor={perFrameFlame()}
                blendFlame={perFrameBlendFlame()}
                blendWeight={perFrameBlendWeight()}
                renderInterval={0}
                edgeFadeColor={vec4f(0)}
                palette={perFramePalette}
                onExportImage={handleExport}
                onAccumulatedPointCount={(c) => {
                  accumulated = c
                }}
                setQualityPointCountLimit={(fn) => {
                  limitAccessor = fn
                }}
              />
            </WheelZoomCamera2D>
          }
        >
          <WheelZoomCamera3D
            theta={theta}
            phi={phi}
            radius={radius}
            target={target}
            fov={fov}
            roll={roll}
            interactive={() => false}
          >
            <Flam3
              quality={perFrameQuality()}
              pointCountPerBatch={DEFAULT_POINT_COUNT}
              adaptiveFilterEnabled={perFrameAdaptiveFilter()}
              stochasticFilterEnabled={perFrameStochasticFilter()}
              animationEnabled={false}
              exportDriver
              exportFrameKey={frameKeyProp()}
              accumulationFraction={fractionProp()}
              flameDescriptor={perFrameFlame()}
              blendFlame={perFrameBlendFlame()}
              blendWeight={perFrameBlendWeight()}
              renderInterval={0}
              edgeFadeColor={vec4f(0)}
              palette={perFramePalette}
              onExportImage={handleExport}
              onAccumulatedPointCount={(c) => {
                accumulated = c
              }}
              setQualityPointCountLimit={(fn) => {
                limitAccessor = fn
              }}
            />
          </WheelZoomCamera3D>
        </Show>
      </AutoCanvas>
    </Root>
  )
}
