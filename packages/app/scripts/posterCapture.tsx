/**
 * Dev-only poster-capture surface for the Home gallery.
 *
 * Renders ONE gallery row's flame with the real renderer at an exact fixed
 * resolution, using the app's own export driver — the same gate the PNG export
 * uses — so the image is captured only once the final colour-graded frame is on
 * the canvas. Never a half-accumulated, noisy poster.
 *
 * Not shipped: Vite's build input is `index.html` alone, so nothing under
 * scripts/ is bundled or copied into dist/. The dev server serves the page at
 * /scripts/poster-capture.html, which is all the driver needs.
 *
 * The flame is INJECTED rather than passed in the URL. A stored descriptor is
 * 2-3 KB of JSON and animated rows carry a timeline on top; page.evaluate has no
 * length limit and no encode/decode round-trip, so the driver hands the row
 * straight over. See scripts/capture-gallery-posters.mjs and scripts/README.md.
 */
import { createSignal, Show } from 'solid-js'
import { render } from 'solid-js/web'
import { vec2f, vec4f } from 'typegpu/data'
import { Flam3 } from '@/flame/Flam3'
import { validateFlame } from '@/flame/schema/flameSchema'
import { AutoCanvas } from '@/lib/AutoCanvas'
import { Camera2D } from '@/lib/Camera2D'
import { Default3DPreviewCamera } from '@/lib/Camera3D'
import { Root } from '@/lib/Root'
import { blobToBase64 } from '@/utils/blob'
import { applyTracksToFlame, getUserEndFrame } from '@/utils/timeline'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

/** One capture request, as posted by the driver script. */
interface CaptureSpec {
  slug: string
  /** Raw `gallery_items.flame` JSON, re-validated here exactly as Home would. */
  flame: unknown
  /** Raw `gallery_items.animation` JSON (`{ tracks }`), or null for a still. */
  animation: { tracks: TimelineTrack[] } | null
  width: number
  height: number
  /** Flam3 quality target — also the export driver's stop condition. */
  quality: number
  pointCountPerBatch: number
  /** Explicit timeline frame; overrides frameFraction when set. */
  frame: number | null
  /** Where in the timeline to sample, as a fraction of the last keyframe. */
  frameFraction: number
  mimeType: string
  /** Encoder quality for lossy formats, 0..1. */
  encodeQuality: number
}

/** What the driver polls for while a capture runs. */
interface CaptureStatus {
  state: 'idle' | 'rendering' | 'done' | 'error'
  /** Live Flam3 quality, 0..1 — progress towards `spec.quality`. */
  progress: number
  /** Points accumulated so far, and the target the quality limit resolves to. */
  points: number
  pointsTarget: number
  error: string | null
}

interface CaptureResult {
  /** Encoded image, base64, no data-URL prefix. */
  base64: string
  mimeType: string
  width: number
  height: number
  /** Brightest channel over a 32x32 downsample — 0 means an all-black poster. */
  peak: number
  /** Timeline frame the still was taken at (0 for stills). */
  frame: number
  /** Last keyframe in the timeline (0 for stills). */
  endFrame: number
}

interface CaptureApi {
  load: (spec: CaptureSpec) => { frame: number; endFrame: number }
  status: () => CaptureStatus
  take: () => CaptureResult | null
}

type CaptureWindow = Window & { __posterCapture?: CaptureApi }

/** A resolved job: the exact descriptor to render, plus its capture settings. */
interface CaptureJob {
  id: number
  spec: CaptureSpec
  flame: FlameDescriptor
  frame: number
  endFrame: number
}

const [job, setJob] = createSignal<CaptureJob | undefined>()
const [state, setState] = createSignal<CaptureStatus['state']>('idle')
const [error, setError] = createSignal<string | null>(null)
const [result, setResult] = createSignal<CaptureResult | null>(null)

let jobCounter = 0
let liveQuality: (() => number) | undefined
let livePointLimit: (() => number) | undefined
let livePoints = 0

function finite(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0
}

/**
 * Peak channel value over a 32x32 downsample of the ENCODED image. A poster
 * that comes back at 0 means the capture grabbed a cleared swapchain rather
 * than the flame, which is worth failing loudly on instead of uploading.
 *
 * Probing the encoded blob rather than the canvas is deliberate: drawImage()
 * from a WebGPU canvas reads back black in Chromium even when the very same
 * canvas encodes a correct image via toBlob(), so canvas-side probing would
 * reject every good poster. Decoding what we are about to write also checks
 * the encoder itself.
 */
async function peakChannel(blob: Blob): Promise<number> {
  const bitmap = await globalThis.createImageBitmap(blob, {
    resizeWidth: 32,
    resizeHeight: 32,
  })
  const probe = document.createElement('canvas')
  probe.width = 32
  probe.height = 32
  const ctx = probe.getContext('2d')
  if (!ctx) return -1
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, 32, 32)
  let peak = 0
  for (let i = 0; i < data.length; i += 4) {
    peak = Math.max(peak, data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0)
  }
  return peak
}

async function encode(
  canvas: HTMLCanvasElement,
  spec: CaptureSpec,
  meta: { frame: number; endFrame: number },
): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, spec.mimeType, spec.encodeQuality)
  })
  if (!blob) {
    setError(`toBlob returned null for ${spec.mimeType}`)
    setState('error')
    return
  }
  setResult({
    base64: await blobToBase64(blob),
    // Chromium silently falls back to PNG for a format it cannot encode, so
    // report what actually came back rather than what was asked for.
    mimeType: blob.type,
    width: canvas.width,
    height: canvas.height,
    peak: await peakChannel(blob),
    frame: meta.frame,
    endFrame: meta.endFrame,
  })
  setState('done')
}

/**
 * The render surface for one job. Keyed on the job id so every capture gets a
 * fresh canvas and a fresh accumulation buffer — no state bleeds between rows.
 */
function CaptureStage(props: { job: CaptureJob }) {
  let captured = false

  const onExportImage = (
    canvas: HTMLCanvasElement,
    info?: { finalImageReady: boolean },
  ) => {
    if (captured || info?.finalImageReady !== true) return
    captured = true
    void encode(canvas, props.job.spec, {
      frame: props.job.frame,
      endFrame: props.job.endFrame,
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err))
      setState('error')
    })
  }

  const flam3 = () => (
    <Flam3
      quality={props.job.spec.quality}
      pointCountPerBatch={props.job.spec.pointCountPerBatch}
      adaptiveFilterEnabled={true}
      animationEnabled={false}
      exportDriver
      flameDescriptor={props.job.flame}
      renderInterval={0}
      edgeFadeColor={vec4f(0)}
      onExportImage={onExportImage}
      onAccumulatedPointCount={(count) => {
        livePoints = count
      }}
      setCurrentQuality={(get) => {
        liveQuality = get
      }}
      setQualityPointCountLimit={(get) => {
        livePointLimit = get
      }}
    />
  )

  const is3D = () => (props.job.flame.renderSettings.dimensions ?? 2) === 3
  const camera = () => props.job.flame.renderSettings.camera
  const camera3D = () => props.job.flame.renderSettings.camera3D

  return (
    <div
      style={{
        width: `${props.job.spec.width}px`,
        height: `${props.job.spec.height}px`,
        background: '#000',
      }}
    >
      <AutoCanvas
        fixedResolution={{
          width: props.job.spec.width,
          height: props.job.spec.height,
        }}
        alphaMode="opaque"
      >
        <Show
          when={is3D()}
          fallback={
            <Camera2D
              position={vec2f(...camera().position)}
              zoom={camera().zoom}
            >
              {flam3()}
            </Camera2D>
          }
        >
          <Default3DPreviewCamera camera3D={camera3D()}>
            {flam3()}
          </Default3DPreviewCamera>
        </Show>
      </AutoCanvas>
    </div>
  )
}

function CaptureApp() {
  return (
    <Root adapterOptions={{ powerPreference: 'high-performance' }}>
      <Show when={job()} keyed>
        {(current) => <CaptureStage job={current} />}
      </Show>
    </Root>
  )
}

/**
 * Pick the frame to freeze an animated row at. Frame 0 is the rest pose and is
 * usually the least interesting thing the timeline does, so sample a fraction
 * of the way in by default (see capture-gallery-posters.mjs for the value).
 */
function resolveFrame(
  spec: CaptureSpec,
  tracks: TimelineTrack[],
): { frame: number; endFrame: number } {
  const endFrame = getUserEndFrame(tracks, 0)
  const frame = spec.frame ?? Math.round(endFrame * spec.frameFraction)
  return { frame: Math.max(0, Math.round(frame)), endFrame }
}

const api: CaptureApi = {
  load: (spec) => {
    setResult(null)
    setError(null)
    liveQuality = undefined
    livePointLimit = undefined
    livePoints = 0
    // Validate exactly as Home does, so the poster can never be rendered from a
    // descriptor the app itself would reject.
    const flame = validateFlame(JSON.parse(JSON.stringify(spec.flame)))
    const tracks = spec.animation?.tracks ?? []
    const { frame, endFrame } = resolveFrame(spec, tracks)
    if (tracks.length > 0) {
      // No loop options: the stored envelope is `{ tracks }` only, so keyframes
      // resolve on their own timeline exactly as the editor plays them back.
      applyTracksToFlame(tracks, flame, frame, null)
    }
    jobCounter += 1
    setState('rendering')
    setJob({ id: jobCounter, spec, flame, frame, endFrame })
    return { frame, endFrame }
  },
  status: () => ({
    state: state(),
    // Both getters are NaN/Infinity before the first batch lands; JSON turns
    // those into null, so normalise to 0 for a driver that only wants progress.
    progress: finite(liveQuality?.()),
    points: livePoints,
    pointsTarget: finite(livePointLimit?.()),
    error: error(),
  }),
  take: () => result(),
}

const mount = document.getElementById('capture-root')

if (!mount) {
  throw new Error("Could not find element with id 'capture-root'")
}

render(() => <CaptureApp />, mount)
;(window as CaptureWindow).__posterCapture = api
