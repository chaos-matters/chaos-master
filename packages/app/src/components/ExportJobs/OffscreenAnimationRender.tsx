import { createResource, createSignal, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { assertReplayVideoStatePortable, createReplayVideoDriver, createReplayVideoSchedule, drawReplayVideoOverlay, replayActionIndexAtFrame, replayFramesInStateRun, replayVideoVisualFingerprint, } from '@/recorder/replayVideo'
import { applyAudioMappingsToFlame, createAudioAnalyzer, } from '@/utils/audioAnalysis'
import { createAudioVideoEncoder } from '@/utils/audioExport'
import { deepClone } from '@/utils/clone'
import { dismissJob, jobExists, setAnimationJobPoints, setAnimationJobProgress, setJobError, setJobResult, } from '@/utils/exportJobs'
import { createMetadataPayload, injectMetadataIntoMp4, } from '@/utils/flameInMp4'
import { applyTracksToFlame, loopOptsFromConfig, resolveLoopValue, } from '@/utils/timeline'
import { createVideoEncoder } from '@/utils/videoEncoder'
import type { Setter, Signal } from 'solid-js'
import type { v2f } from 'typegpu/data'
import type { Vec3 } from 'wgpu-matrix'
import type { ExportImageType } from '@/App'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
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
        )
      : undefined
  const replayDriver =
    replaySchedule && job.session
      ? createReplayVideoDriver(job.session)
      : undefined
  const initialReplayActionIndex = replaySchedule
    ? replayActionIndexAtFrame(replaySchedule, 0)
    : -1
  let replayState = replayDriver?.advanceTo(initialReplayActionIndex)
  let replayVisualKey = replayState
    ? replayVideoVisualFingerprint(replayState)
    : undefined

  const totalFrames = job.frameEnd - job.frameStart + 1
  const totalRenders = totalFrames * Math.max(1, job.playCount)
  const resizeWidth = Math.round(job.dimensions.width) & ~1 || 2
  const resizeHeight = Math.round(job.dimensions.height) & ~1 || 2

  const loopOpts = loopOptsFromConfig(job.config, job.tracks)

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

  function frameFlame(frame: number): FlameDescriptor {
    const clone = deepClone(job.flame)
    applyTracksToFlame(job.tracks, clone, frame, loopOpts)
    const analyzer = audioAnalyzer()
    if (analyzer && job.audioMapping) {
      const audioFrame = frame % analyzer.totalFrames
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

  function queuePoster(canvas: HTMLCanvasElement) {
    if (frameIndex !== 0) return
    // A poster-less <video> often shows a blank/green undecoded frame.
    canvas.toBlob((blob) => {
      if (blob && !disposed) posterUrl = URL.createObjectURL(blob)
    }, 'image/png')
  }

  function updateReplayState(actionIndex: number): boolean {
    if (!replayDriver) return false
    const next = replayDriver.advanceTo(actionIndex)
    assertReplayVideoStatePortable(next, actionIndex)
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
    const rendered = await globalThis.createImageBitmap(canvas, {
      resizeWidth,
      resizeHeight,
      resizeQuality: 'high',
    })
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
          const actionIndex = replayActionIndexAtFrame(
            replaySchedule,
            frameIndex,
          )
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
          updateReplayState(
            replayActionIndexAtFrame(replaySchedule, frameIndex),
          )
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
      const bitmap = await globalThis.createImageBitmap(canvas, {
        resizeWidth,
        resizeHeight,
        resizeQuality: 'high',
      })
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
      const frame = job.frameStart + (frameIndex % totalFrames)
      setPerFrameFlame(frameFlame(frame))
      setPerFrameBlendWeight(blendWeightAtFrame(frame))
    }
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
              interactive={() => false}
            >
              <Flam3
                quality={job.quality}
                pointCountPerBatch={DEFAULT_POINT_COUNT}
                adaptiveFilterEnabled={perFrameAdaptiveFilter()}
                stochasticFilterEnabled={perFrameStochasticFilter()}
                animationEnabled={false}
                exportDriver
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
              quality={job.quality}
              pointCountPerBatch={DEFAULT_POINT_COUNT}
              adaptiveFilterEnabled={perFrameAdaptiveFilter()}
              stochasticFilterEnabled={perFrameStochasticFilter()}
              animationEnabled={false}
              exportDriver
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
