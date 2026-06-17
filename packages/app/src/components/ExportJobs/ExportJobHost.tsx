import { createEffect, createMemo, createSignal, onCleanup, Show, } from 'solid-js'
import { vec2f, vec4f } from 'typegpu/data'
import { DEFAULT_POINT_COUNT } from '@/defaults'
import { Flam3 } from '@/flame/Flam3'
import { condenseFlameDescriptor } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Root } from '@/lib/Root'
import { WheelZoomCamera2D } from '@/lib/WheelZoomCamera2D'
import { WheelZoomCamera3D } from '@/lib/WheelZoomCamera3D'
import { exportJobs, hasPendingExportJobs, jobExists, setImageJobProgress, setJobError, setJobFinalizing, setJobResult, setJobStatus, } from '@/utils/exportJobs'
import { addFlameDataToPng } from '@/utils/flameInPng'
import { compressJsonQueryParam } from '@/utils/jsonQueryParam'
import { saveRecentFlame } from '@/utils/recentFlames'
import ui from './ExportJobHost.module.css'
import { OffscreenAnimationRender } from './OffscreenAnimationRender'
import type { ExportImageType } from '@/App'
import type { ImageJob } from '@/utils/exportJobs'

/**
 * Renders the current image export job OFFSCREEN, at its exact dimensions, in a
 * dedicated WebGPU Root so the main workspace renderer keeps running and the app
 * stays usable. Jobs render one at a time (the first queued/rendering job);
 * capturing one lets the next mount. See utils/exportJobs.ts + ExportJobTracker.
 */
export function ExportJobHost() {
  // The first job that still needs rendering. Stays referentially stable across
  // progress updates (it only reads `.status`), so the keyed <Show> below does
  // NOT remount the renderer mid-render — only when the job actually changes.
  const current = createMemo(() =>
    exportJobs().find((j) => j.status === 'queued' || j.status === 'rendering'),
  )

  createEffect(() => {
    const job = current()
    if (job && job.status === 'queued') {
      setJobStatus(job.id, 'rendering')
    }
  })

  // Warn before leaving if exports are still rendering or finished-but-not-yet
  // downloaded — the results live only in memory and would be lost on reload.
  const beforeUnload = (e: BeforeUnloadEvent) => {
    // preventDefault() is the modern way to trigger the browser's "leave site?"
    // prompt (the legacy event.returnValue is deprecated).
    if (hasPendingExportJobs()) {
      e.preventDefault()
    }
  }
  window.addEventListener('beforeunload', beforeUnload)
  onCleanup(() => {
    window.removeEventListener('beforeunload', beforeUnload)
  })

  return (
    <div class={ui.host} aria-hidden="true">
      <Show when={current()} keyed>
        {(job) =>
          job.type === 'animation' ? (
            <OffscreenAnimationRender job={job} />
          ) : (
            <OffscreenRender job={job} />
          )
        }
      </Show>
    </div>
  )
}

function OffscreenRender(props: { job: ImageJob }) {
  const { job } = props
  const is3D = (job.flame.renderSettings.dimensions ?? 2) === 3

  const cam = job.flame.renderSettings.camera
  const zoom = createSignal(cam.zoom)
  const position = createSignal(vec2f(cam.position[0], cam.position[1]))

  const c3d = job.flame.renderSettings.camera3D ?? {
    theta: 0,
    phi: Math.PI / 2,
    radius: 5,
    target: [0, 0, 0] as [number, number, number],
    fov: 60,
    roll: 0,
  }
  const theta = createSignal(c3d.theta)
  const phi = createSignal(c3d.phi)
  const radius = createSignal(c3d.radius)
  const target = createSignal(new Float32Array(c3d.target))
  const fov = createSignal(c3d.fov)
  const roll = createSignal(c3d.roll ?? 0)

  let limitAccessor: () => number = () => 0
  let accumulated = 0
  let captured = false
  let lastProgressMs = 0

  async function finalize(canvas: HTMLCanvasElement) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 1)
    })
    if (!blob) {
      setJobError(job.id, 'Failed to capture the rendered image')
      return
    }
    let bytes = new Uint8Array(await blob.arrayBuffer())
    if (job.embedFlame) {
      const flame = job.condenseHidden
        ? condenseFlameDescriptor(job.flame)
        : job.flame
      const payload =
        job.embedAnimation && job.tracks.length > 0
          ? { flame, animation: { tracks: job.tracks, config: job.config } }
          : flame
      const encoded = await compressJsonQueryParam(payload)
      bytes = new Uint8Array(
        await addFlameDataToPng(encoded, bytes).arrayBuffer(),
      )
    }
    saveRecentFlame(job.flame, undefined, job.tracks)
    // The user may have cancelled (job removed) while we were encoding.
    if (!jobExists(job.id)) return
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
    setJobResult(job.id, {
      blobUrl: url,
      width: job.dimensions.width,
      height: job.dimensions.height,
    })
  }

  const handleExport: ExportImageType = (canvas, info) => {
    if (captured) return
    // Throttle store writes — the export loop ticks every few ms; re-rendering
    // the tracker that often would compete with the render itself.
    const now = globalThis.performance.now()
    if (now - lastProgressMs >= 100) {
      lastProgressMs = now
      setImageJobProgress(job.id, accumulated, limitAccessor())
    }
    // Capture once the final color-graded image is on the canvas (quality
    // reached), or immediately on a "Stop & Export" request.
    if (!props.job.forceExport && info?.finalImageReady !== true) return
    captured = true
    setJobFinalizing(job.id)
    void finalize(canvas).catch((err: unknown) => {
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
                flameDescriptor={job.flame}
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
              flameDescriptor={job.flame}
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
