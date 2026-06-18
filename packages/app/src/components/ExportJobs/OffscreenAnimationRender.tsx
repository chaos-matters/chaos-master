import { createSignal, onCleanup, Show } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { deepClone } from '@/utils/clone'
import { dismissJob, jobExists, setAnimationJobPoints, setAnimationJobProgress, setJobError, setJobResult, } from '@/utils/exportJobs'
import { createMetadataPayload, injectMetadataIntoMp4, } from '@/utils/flameInMp4'
import { applyTracksToFlame, seamlessOptsFromConfig } from '@/utils/timeline'
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
  const is3D = (job.flame.renderSettings.dimensions ?? 2) === 3

  const totalFrames = job.frameEnd - job.frameStart + 1
  const totalRenders = totalFrames * Math.max(1, job.playCount)
  const resizeWidth = Math.round(job.dimensions.width) & ~1 || 2
  const resizeHeight = Math.round(job.dimensions.height) & ~1 || 2

  const seamlessOpts = seamlessOptsFromConfig(job.config, job.tracks)

  function frameFlame(frame: number): FlameDescriptor {
    const clone = deepClone(job.flame)
    applyTracksToFlame(job.tracks, clone, frame, seamlessOpts)
    return clone
  }

  const [perFrameFlame, setPerFrameFlame] = createSignal<FlameDescriptor>(
    frameFlame(job.frameStart),
  )

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
  let encoder: Awaited<ReturnType<typeof createVideoEncoder>> | undefined

  onCleanup(() => {
    disposed = true
    encoder?.cancel()
  })

  void (async () => {
    try {
      encoder = await createVideoEncoder({
        codec: job.codec,
        width: resizeWidth,
        height: resizeHeight,
        fps: job.fps,
      })
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
      })
    } catch (err) {
      setJobError(job.id, err instanceof Error ? err.message : String(err))
    }
  }

  async function captureAndAdvance(canvas: HTMLCanvasElement) {
    if (!encoder) {
      capturing = false
      return
    }
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
    capturing = false
    if (disposed) return
    setAnimationJobProgress(job.id, frameIndex, totalRenders, 'rendering')
    if (frameIndex >= totalRenders || props.job.forceExport) {
      void finish()
      return
    }
    // Advancing the flame changes Flam3's accumulationFingerprint, which resets
    // accumulation so the next frame renders fresh.
    const frame = job.frameStart + (frameIndex % totalFrames)
    setPerFrameFlame(frameFlame(frame))
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
          when={is3D}
          fallback={
            <WheelZoomCamera2D
              zoom={zoom}
              position={position}
              interactive={() => false}
            >
              <Flam3
                quality={job.quality}
                pointCountPerBatch={DEFAULT_POINT_COUNT}
                adaptiveFilterEnabled={true}
                animationEnabled={false}
                exportDriver
                flameDescriptor={perFrameFlame()}
                blendFlame={job.blendFlame}
                blendWeight={job.blendWeight}
                renderInterval={0}
                edgeFadeColor={vec4f(0)}
                palette={() => job.palette}
                onExportImage={handleExport}
                onAccumulatedPointCount={() => {}}
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
              adaptiveFilterEnabled={true}
              animationEnabled={false}
              exportDriver
              flameDescriptor={perFrameFlame()}
              blendFlame={job.blendFlame}
              blendWeight={job.blendWeight}
              renderInterval={0}
              edgeFadeColor={vec4f(0)}
              palette={() => job.palette}
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
