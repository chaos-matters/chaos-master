import { createEffect, createMemo, createSignal, onCleanup, untrack, useContext, } from 'solid-js'
import { arrayOf, vec2f, vec2u, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { useChangeHistory } from '@/contexts/ChangeHistoryContext'
import { useTimeline } from '@/contexts/TimelineContext'
import { DEBUG_MODE, PERSIST_RESEED_INTERVAL, PLOTS_PER_CHAIN, } from '@/defaults'
import { accumulatedPointCount, animationExportProgress, animationExportRunning, exportQuality, setAccumulatedPointCountGlobal, setRenderTimings, } from '@/flame/renderStats'
import { DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID } from '@/shaders/random'
import { deepClone } from '@/utils/clone'
import { createTimestampQuery } from '@/utils/createTimestampQuery'
import { formatPointCount } from '@/utils/formatPointCount'
import { logTime } from '@/utils/logTime'
import { isAppleWebKit } from '@/utils/platform'
import { recordEntries } from '@/utils/record'
import { applyTimelineToFlame } from '@/utils/timeline'
import { vramTrack } from '@/utils/vramLog'
import { Camera3DContext } from '../lib/Camera3DContext'
import { CameraContext } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useLiveRootContext } from '../lib/RootContext'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { createAdaptiveBlurPipeline } from './adaptiveBlurPipeline'
import { ColorGradingUniforms, createColorGradingPipeline, } from './colorGrading'
import { createDensityEstimationPipeline } from './densityEstimationPipeline'
import { drawModeToImplFn } from './drawMode'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import { backgroundColorDefault, backgroundColorDefaultWhite, } from './schema/flameSchema'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER, FilterParams } from './types'
import type { v4f } from 'typegpu/data'
import type { Palette } from './colorMap'
import type { FlameDescriptor } from './schema/flameSchema'
import type { ExportImageType } from '@/App'
import type { RendererRandomImplementationId } from '@/shaders/random'

const { sqrt } = Math
const { performance } = globalThis

const OUTPUT_EVERY_FRAME_BATCH_INDEX = 20
const OUTPUT_INTERVAL_BATCH_INDEX = 10

// Floor for the radius used in the 3D density/quality normalization. Below this,
// scale = 1/radius makes the projected area (scale²) explode, saturating the
// quality cap and blowing out brightness. The camera may zoom closer; only the
// normalization is held here.
const MIN_DENSITY_NORM_RADIUS = 0.01

// Export driver tuning. During exports the render loop is driven by a
// self-scheduling async loop instead of requestAnimationFrame: rAF cadence is
// owned by the browser compositor, which Chrome collapses under sustained GPU
// queue pressure (and stops entirely in background tabs) — that stalled long
// ultra-quality exports. The export loop submits one bounded chunk at a time
// and awaits queue.onSubmittedWorkDone(), so the GPU queue stays shallow and
// the chunk wall time is an accurate measure of its GPU cost.
// Chunk sizing: in visible Chrome tabs, onSubmittedWorkDone resolution is
// aligned to the compositor, giving every await a fixed latency floor of one
// vsync period (~16.7ms at 60Hz, ~33ms at 30Hz) regardless of chunk size.
// The controller therefore targets a tick time well above that floor and
// never divides it per-iteration: grow fast while clearly latency-bound,
// creep upward inside the band, shrink proportionally only when the chunk
// itself overshoots. Hidden tabs / Firefox have no floor and settle near the
// target.
const EXPORT_TARGET_TICK_MS = 32
const EXPORT_TICK_GROW_BELOW_MS = 24
const EXPORT_TICK_SHRINK_ABOVE_MS = 48
const EXPORT_INITIAL_ITERATIONS = 2
const EXPORT_MAX_ITERATIONS = 512
const EXPORT_IDLE_DELAY_MS = 8
const EXPORT_PRESENT_INTERVAL_MS = 250
// Telemetry: periodic throughput line + slow-tick events, timestamped so
// stalls can be correlated with tab switches / window occlusion.
const EXPORT_LOG_INTERVAL_MS = 2000
const EXPORT_SLOW_TICK_MS = 300
// During export, the global point counter (quality pills, speed readout)
// updates at this interval instead of every tick — per-tick signal writes fan
// out to UI subscribers and that main-thread work competes with the export
// while the tab is visible.
const EXPORT_COUNT_SIGNAL_INTERVAL_MS = 100

type RenderTickResult = {
  iterations: number
  presented: boolean
  hadWork: boolean
}

export type CompletedPointCountInfo = {
  /** Cumulative plotted-point count captured for this exact submission. */
  count: number
  /** Queue-fenced completion time from `performance.now()`. */
  completedAtMs: number
}

type Flam3Props = {
  quality: number
  pointCountPerBatch: number
  renderInterval: number
  adaptiveFilterEnabled: boolean
  stochasticFilterEnabled?: boolean
  /** Compile-time renderer RNG selection. Defaults to canonical xoroshiro64**. */
  randomImplementationId?: RendererRandomImplementationId
  animationEnabled: boolean
  flameDescriptor: FlameDescriptor
  edgeFadeColor: v4f
  onExportImage?: ExportImageType
  /** Marks the main workspace renderer: exports (animation/still) switch its
   *  render loop from rAF to the async export driver. Preview instances must
   *  not set this. */
  isExportRenderer?: boolean
  /** Forces the async export driver on directly (independent of the global
   *  export signals). Used by the offscreen export-job renderer so it runs the
   *  fast loop without flipping the main workspace renderer into export mode. */
  exportDriver?: boolean
  setCurrentQuality?: (fn: () => number) => void
  setQualityPointCountLimit?: (fn: () => number) => void
  palette?: () => Palette | undefined
  outputAlpha?: boolean
  onAccumulatedPointCount?: (count: number) => void
  /**
   * Queue-completed counterpart to `onAccumulatedPointCount`.
   *
   * The existing callback intentionally fires immediately after submit because
   * interactive UI consumers need low-latency progress. Benchmark consumers
   * need the stronger guarantee that the GPU finished the captured submission.
   */
  onCompletedPointCount?: (info: CompletedPointCountInfo) => void
  /** Reports rejection of the queue fence used by onCompletedPointCount. */
  onCompletedPointCountError?: (error: unknown) => void
  disableQualityLimit?: boolean
  blendFlame?: FlameDescriptor
  blendWeight?: number
  /** Default true. When false, chains re-seed every dispatch instead of
   *  persisting across dispatches — required for single-transform preview
   *  flames, whose chains would otherwise collapse onto the lone map's
   *  attractor (shape contraction) and decay color toward the transform's. */
  persistChains?: boolean
}

export function Flam3(props: Flam3Props) {
  const camera = useContext(CameraContext)
  const camera3D = useContext(Camera3DContext)
  const { root, device, gpuReady } = useLiveRootContext()
  const { context, canvasSize, canvas, canvasFormat } = useCanvas()
  const timeline = useTimeline()
  const changeHistory = useChangeHistory()
  const isInteractive = () =>
    changeHistory.hasOpenPreview() || (timeline?.isPlaying() ?? false)

  // Persisting chains across dispatches collapses single-map dynamics onto their
  // attractor — a 1-transform flame visibly contracts as it accumulates. So we
  // only persist when the chaos game picks among 2+ visible transforms (a real
  // fractal flame); otherwise chains re-seed every dispatch. The persistChains
  // prop overrides this default.
  const visibleTransformCount = createMemo(
    () =>
      Object.values(props.flameDescriptor.transforms).filter(
        (t) => t.visible ?? true,
      ).length,
  )

  const [animatedFlame, setAnimatedFlame] = createSignal<FlameDescriptor>(
    deepClone(props.flameDescriptor),
  )

  const backgroundColorFinal = () => {
    const bg = props.flameDescriptor.renderSettings.backgroundColor
    const isPaint = props.flameDescriptor.renderSettings.drawMode !== 'light'

    if (bg === undefined) {
      return isPaint
        ? vec3f(...backgroundColorDefaultWhite)
        : vec3f(...backgroundColorDefault)
    }

    // User explicitly chose a color -- respect it, no auto-swap.
    return vec3f(...bg)
  }

  // Memo, not a plain function: renderTick reads this from the rAF callback,
  // which has no reactive owner. Solid wraps conditional JSX props (e.g.
  // Default3DPreviewCamera's ternaries) in lazily-created memos, so a first
  // camera3D.fov()/position() read from rAF would create those computations
  // owner-less — "computations created outside createRoot" + never disposed.
  // Creating the memo here makes all camera reads happen under this owner.
  const bucketProbabilityInv = createMemo(() => {
    const size = canvasSize()
    const height = size.height
    const dimensions = animatedFlame().renderSettings.dimensions ?? 2
    if (dimensions === 3 && camera3D) {
      // 3D equivalent of the 2D zoom-based area calculation.
      // In 2D: A = height² × zoom² / 4  (unit square in pixels).
      // In 3D: a unit world-space square at the target distance maps to
      //   scale = height / (2 × radius × tan(fov/2))  pixels per world unit
      //   A = scale²
      // Zooming in (smaller radius) → bigger scale → more points needed.
      const pos = camera3D.position()
      const tgt = camera3D.target()
      const dx = pos[0]! - tgt[0]!
      const dy = pos[1]! - tgt[1]!
      const dz = pos[2]! - tgt[2]!
      // Hold the normalization radius out of the blow-out regime even when the
      // camera is closer (see MIN_DENSITY_NORM_RADIUS).
      const radius = Math.max(
        MIN_DENSITY_NORM_RADIUS,
        Math.sqrt(dx * dx + dy * dy + dz * dz) || 1,
      )
      const fovRad = (camera3D.fov() * Math.PI) / 180
      const tanHalfFov = Math.tan(fovRad / 2) || 1
      const scale = height / (2 * radius * tanHalfFov)
      return scale * scale
    }
    const unitSquareArea = (height ** 2 * camera!.zoom() ** 2) / 4
    return unitSquareArea
  })

  /** u32-safe point cap: prevents per-bucket atomic overflow at high quality */
  const safeQualityCap = () => {
    const size = canvasSize()
    const totalBuckets = size.width * size.height
    const MAX_U32 = 0xffffffff
    const maxPointsPerBucket = Math.floor(
      MAX_U32 / BUCKET_FIXED_POINT_MULTIPLIER,
    )
    // Conservative concentration factor — hottest buckets may be 25x above average
    const concentrationFactor = 25
    return Math.floor((maxPointsPerBucket * totalBuckets) / concentrationFactor)
  }

  const qualityPointCountLimit = () => {
    const q = props.quality
    const rawLimit = bucketProbabilityInv() / (q ** 2 - 2 * q + 1)
    return Math.min(rawLimit, safeQualityCap())
  }

  const [instanceAccumulatedPointCount, setInstanceAccumulatedPointCount] =
    createSignal(0)
  props.setCurrentQuality?.(
    () =>
      1 -
      sqrt(
        bucketProbabilityInv() /
          (props.isExportRenderer
            ? accumulatedPointCount()
            : instanceAccumulatedPointCount()),
      ),
  )
  props.setQualityPointCountLimit?.(qualityPointCountLimit)

  const pointRandomSeeds = root
    .createBuffer(arrayOf(vec2u, props.pointCountPerBatch))
    .$usage('storage')
  // Persisted per-chain state across dispatches (position xyz packed in a vec4f,
  // color in a vec2f). Created once and shared like the RNG seeds; the IFS
  // pipeline re-initializes them on the first tick after a settle (resetPoints).
  const pointPositions = root
    .createBuffer(arrayOf(vec4f, props.pointCountPerBatch))
    .$usage('storage')
  const pointColors = root
    .createBuffer(arrayOf(vec2f, props.pointCountPerBatch))
    .$usage('storage')

  // vec2u (8) + vec4f (16) + vec2f (8) = 32 bytes per point. At 1e6 that's ~32MB
  // per preview — the dominant gallery VRAM term. Capture the allocated size so
  // the matching free below subtracts exactly this much: pointCountPerBatch is a
  // reactive prop and may differ by free time (e.g. a quality change on the main
  // renderer), which would otherwise drift the VRAM ledger negative.
  const pointBufferBytes = props.pointCountPerBatch * 32
  vramTrack(
    `Flam3 point buffers pc=${props.pointCountPerBatch}`,
    pointBufferBytes,
  )

  const colorGradingUniforms = root
    .createBuffer(ColorGradingUniforms, {
      averagePointCountPerBucketInv: 0,
      exposure: 1,
      backgroundColor: vec4f(0, 0, 0, 0),
      edgeFadeColor: vec4f(0, 0, 0, 0.8),
      vibrancy: 0.5,
      palettePhase: 0,
      paletteSpeed: 0.5,
      paletteEntryCount: 0,
      contrast: 1,
      gamma: props.flameDescriptor.renderSettings.gamma ?? 2.2,
      depthColorPower:
        props.flameDescriptor.renderSettings.depthColorPower ?? 0.0,
      lightDirection: vec4f(
        ...(props.flameDescriptor.renderSettings.lightDirection ?? [
          -0.5, 0.5, -1.0,
        ]),
        0.0,
      ),
      lightPower: props.flameDescriptor.renderSettings.lightPower ?? 0.0,
      highlightPower: 0.5,
      outputAlpha: 0,
      paletteMode: 0,
    })
    .$usage('uniform')

  const edgeFadeColorMemo = createMemo(() => props.edgeFadeColor)
  const onExportImageMemo = createMemo(() => props.onExportImage)
  const paletteMemo = createMemo(() => props.palette?.())
  const outputAlphaMemo = createMemo(() => props.outputAlpha)

  let currentAveragePointCountPerBucketInv = 0

  function writeColorGradingUniforms() {
    const rs = animatedFlame().renderSettings
    const depthVal = rs.depthColorPower ?? 0.0
    const lightVal = rs.lightPower ?? 0.0
    colorGradingUniforms.write({
      averagePointCountPerBucketInv: currentAveragePointCountPerBucketInv,
      exposure: 2 * Math.exp(rs.exposure),
      edgeFadeColor: onExportImageMemo() ? vec4f(0) : edgeFadeColorMemo(),
      backgroundColor: vec4f(backgroundColorFinal(), 1),
      vibrancy: rs.vibrancy ?? 0.5,
      palettePhase: rs.palettePhase ?? 0,
      paletteSpeed: rs.paletteSpeed ?? 0.5,
      paletteEntryCount: paletteMemo()?.entries.length ?? 0,
      contrast: rs.contrast ?? 1,
      gamma: rs.gamma ?? 2.2,
      depthColorPower: depthVal,
      lightDirection: vec4f(
        ...(rs.lightDirection ??
          ([-0.5, 0.5, -1.0] as [number, number, number])),
        0.0,
      ),
      lightPower: lightVal,
      highlightPower: rs.highlightPower ?? 0.5,
      outputAlpha: outputAlphaMemo() ? 1 : 0,
      paletteMode: rs.paletteMode ?? 0,
    })
  }

  onCleanup(() => {
    // Flam3 remounts on 2D/3D switches while the root (and device) live on —
    // without an explicit destroy these leak per remount. Deferred until
    // pending GPU work completes, same as the accumulation buffers below.
    void device.queue
      .onSubmittedWorkDone()
      .then(() => {
        pointRandomSeeds.destroy()
        // pointPositions + pointColors were never destroyed here — a real ~24MB
        // (at 1e6) leak per unmounted preview. Free them with the RNG seeds.
        pointPositions.destroy()
        pointColors.destroy()
        colorGradingUniforms.destroy()
        vramTrack('Flam3 point buffers FREED', -pointBufferBytes)
      })
      .catch(() => {})
  })

  const outputTextures = createMemo(() => {
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const accumulationBuffer = root
      .createBuffer(arrayOf(Bucket, width * height))
      .$usage('storage')

    const postprocessBuffer = root
      .createBuffer(arrayOf(Bucket, width * height))
      .$usage('storage')

    const filterParamsBuffer = root
      .createBuffer(arrayOf(FilterParams, width * height))
      .$usage('storage')

    onCleanup(() => {
      // Defer destruction until pending GPU work completes to avoid
      // "buffer used in submit while destroyed" errors on resize/unmount.
      void device.queue
        .onSubmittedWorkDone()
        .then(() => {
          accumulationBuffer.destroy()
          postprocessBuffer.destroy()
          filterParamsBuffer.destroy()
        })
        .catch(() => {})
    })

    return {
      accumulationBuffer,
      postprocessBuffer,
      filterParamsBuffer,
      textureSize: [width, height] as const,
    }
  })

  const colorGradingPipeline = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const { textureSize, postprocessBuffer, accumulationBuffer } = o
    const typedPostprocessBuffer = postprocessBuffer
    const typedAccumulationBuffer = accumulationBuffer
    return createColorGradingPipeline(
      root,
      colorGradingUniforms,
      textureSize,
      // The adaptive-filter passes (density estimation + blur) write
      // postprocessBuffer, but they are skipped while the stochastic (MN)
      // filter is active. Reading postprocessBuffer in that state would show a
      // frozen, never-updated image, so fall back to the live accumulation
      // buffer whenever MN is on. Reading props.stochasticFilterEnabled here
      // also makes this memo rebuild when the MN toggle flips.
      props.adaptiveFilterEnabled && !props.stochasticFilterEnabled
        ? typedPostprocessBuffer
        : typedAccumulationBuffer,
      canvasFormat,
      drawModeToImplFn[props.flameDescriptor.renderSettings.drawMode],
      props.palette?.(),
    )
  })

  // Create adaptive filter pipelines only when output buffers change (e.g. resize).
  // Quality/curve uniform updates are handled separately below to avoid
  // recreating GPU pipelines on every slider change.
  const runAdaptiveFilter = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const {
      textureSize,
      accumulationBuffer,
      postprocessBuffer,
      filterParamsBuffer,
    } = o
    const flame = untrack(animatedFlame)
    const storedQuality = flame.renderSettings.densityEstimationQuality ?? 5
    const qualityK =
      storedQuality > 1 ? storedQuality : 0.5 + (1 - storedQuality) * 19.5
    const estimatorCurve = flame.renderSettings.estimatorCurve ?? 0.5
    const densityPipeline = createDensityEstimationPipeline(
      root,
      textureSize,
      accumulationBuffer,
      filterParamsBuffer,
      qualityK,
      estimatorCurve,
    )
    const blurPipeline = createAdaptiveBlurPipeline(
      root,
      textureSize,
      accumulationBuffer,
      filterParamsBuffer,
      postprocessBuffer,
    )
    onCleanup(() => {
      densityPipeline.destroy()
      blurPipeline.destroy()
    })
    return {
      run: (pass: GPUComputePassEncoder) => {
        densityPipeline.run(pass)
        blurPipeline.run(pass)
      },
      densityPipeline,
    }
  })

  // Update density estimation uniforms without recreating pipelines.
  createEffect(() => {
    const filter = runAdaptiveFilter()
    if (!filter) return
    const storedQuality =
      animatedFlame().renderSettings.densityEstimationQuality ?? 5
    // Map 0-1 quality slider (1=best) to qualityK (0.5=best, 20=worst).
    // Values > 1 are old-format direct qualityK for backward compatibility.
    const qualityK =
      storedQuality > 1 ? storedQuality : 0.5 + (1 - storedQuality) * 19.5
    const estimatorCurve = animatedFlame().renderSettings.estimatorCurve ?? 0.5
    filter.densityPipeline.setQualityK(qualityK)
    filter.densityPipeline.setEstimatorCurve(estimatorCurve)
  })

  const continueRendering = (accumulatedPointCount: number) => {
    if (props.disableQualityLimit) return true
    return accumulatedPointCount <= qualityPointCountLimit()
  }

  // True while an export (animation or still) should drive this renderer via
  // the async export loop instead of requestAnimationFrame. Only the main
  // workspace renderer opts in via isExportRenderer.
  const exportDriverActive = createMemo(
    () =>
      (props.exportDriver ?? false) ||
      ((props.isExportRenderer ?? false) &&
        (animationExportRunning() || exportQuality() !== undefined)),
  )

  const timestampQuery = createTimestampQuery(device, [
    'ifsMs',
    'adaptiveFilterMs',
    'colorGradingMs',
  ])

  // Also returns the flame snapshot so the pipeline creation uses the exact same
  // value — re-reading untrack(animatedFlame) separately can return a different
  // flame when outputTextures() memo re-evaluation causes nested effect flushes.
  const parameterFingerprint = createMemo(() => {
    const flame = animatedFlame()
    const bf = props.blendFlame
    return JSON.stringify({
      transforms: recordEntries(flame.transforms).map(([tid, t]) => ({
        tid,
        variations: recordEntries(t.variations).map(([vid, v]) => ({
          vid,
          type: v.type,
        })),
      })),
      ...(bf && {
        blendTransforms: recordEntries(bf.transforms).map(([tid, t]) => ({
          tid,
          variations: recordEntries(t.variations).map(([vid, v]) => ({
            vid,
            type: v.type,
          })),
        })),
      }),
      dimensions: flame.renderSettings.dimensions ?? 2,
      colorInitMode: flame.renderSettings.colorInitMode,
      pointInitMode: flame.renderSettings.pointInitMode,
      skipIters: Math.floor(flame.renderSettings.skipIters),
      plotsPerChain: Math.floor(
        flame.renderSettings.plotsPerChain ?? PLOTS_PER_CHAIN,
      ),
      randomImplementationId:
        props.randomImplementationId ??
        DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID,
    })
  })

  // Clone flame descriptor and apply timeline keyframes.
  // Explicitly read renderSettings and transforms sub-properties so SolidJS
  // tracks them reliably. JSON.stringify on a store proxy may miss deep paths.
  // tracks them reliably. JSON.stringify on a store proxy may miss deep paths.
  createEffect(() => {
    const rs = props.flameDescriptor.renderSettings
    const _rs = {
      exposure: rs.exposure,
      vibrancy: rs.vibrancy,
      palettePhase: rs.palettePhase,
      paletteSpeed: rs.paletteSpeed,
      contrast: rs.contrast,
      gamma: rs.gamma ?? 2.2,
      depthColorPower: rs.depthColorPower ?? 0.0,
      lightDirection: vec4f(...(rs.lightDirection ?? [-0.5, 0.5, -1.0]), 0.0),
      lightPower: rs.lightPower ?? 0.0,
      highlightPower: rs.highlightPower ?? 0.5,
      drawMode: rs.drawMode,
      colorInitMode: rs.colorInitMode,
      pointInitMode: rs.pointInitMode,
      backgroundColor: rs.backgroundColor,
      camera: rs.camera,
    }
    const _tids = Object.keys(props.flameDescriptor.transforms)
    const flame = deepClone(props.flameDescriptor)
    const enabled = props.animationEnabled
    const hasTracks = timeline ? timeline.tracks().length : 0
    // Read currentFrame in the reactive scope so scrubbing/seeking triggers a
    // re-run (isDrivingView itself doesn't depend on the frame number).
    const _frame = timeline?.currentFrame() ?? 0
    // Drive the rendered flame whenever the timeline owns the view — playing,
    // scrubbing, OR holding a seeked/stepped frame (clicking the playhead).
    // Using the narrower isPlaying||isScrubbing left a clicked/held frame's
    // transforms unapplied (only the camera, which already uses isDrivingView,
    // moved), so the canvas didn't match the frame counter.
    const isActive = timeline?.isDrivingView() ?? false
    if (timeline && enabled && hasTracks > 0 && isActive) {
      applyTimelineToFlame(timeline, flame)
    }
    setAnimatedFlame(flame)
  })

  /**
   * Timeline animation playback loop.
   * When isPlaying is true, advances the frame at the configured FPS rate.
   *
   * Gated on `animationEnabled` because the timeline is shared and this
   * advances it: every extra instance mounted while something plays used to
   * add its own interval, so two previews meant triple-speed playback, and a
   * transport marker the recorder then flagged as unreplayable. Previews all
   * pass `false`, so only the instance that owns the animation drives it.
   */
  createEffect(() => {
    if (
      !timeline ||
      !props.animationEnabled ||
      !timeline.isPlaying() ||
      timeline.config().autoFps
    ) {
      return
    }

    const cfg = timeline.config()
    const intervalMs = 1000 / cfg.fps
    const intervalId = window.setInterval(() => {
      for (let i = 0; i < cfg.timeScale; i++) {
        timeline.advanceFrame()
      }
    }, intervalMs)

    onCleanup(() => {
      clearInterval(intervalId)
    })
  })

  const estimateIterationCount = (
    timings: {
      ifsMs: number
      adaptiveFilterMs: number
      colorGradingMs: number
    },
    shouldRenderFinalImage: boolean,
  ) => {
    const { ifsMs, adaptiveFilterMs, colorGradingMs } = timings
    const safeIfsMs = Math.max(ifsMs, 0.001)

    // For benchmarks, we want 100% GPU saturation without triggering a TDR crash or completely freezing the UI.
    // 50ms gives ~20 FPS, which keeps the browser alive while maximizing throughput.
    const frameBudgetMs = props.disableQualityLimit
      ? 50
      : shouldRenderFinalImage
        ? 14
        : 33

    const paintTimeMs =
      Number(shouldRenderFinalImage) *
      (colorGradingMs +
        Number(props.adaptiveFilterEnabled && !props.stochasticFilterEnabled) *
          adaptiveFilterMs)

    // Use Math.round instead of floor to prevent the dead-zone where budget/ifsMs < 2
    // would permanently trap the scaler at 1 iteration.
    return clamp(Math.round((frameBudgetMs - paintTimeMs) / safeIfsMs), 1, 1000)
  }

  // Main render loop — follows the main branch pattern with plain `let` variables
  // inside an outer effect, using rafLoop.redraw() for reactive triggers.
  let ifsPipeline: ReturnType<typeof createIFSPipeline> | undefined
  let ifsPipeline3D: ReturnType<typeof createIFSPipeline3D> | undefined
  // Plots-per-chain the active pipeline was compiled with (renderSettings
  // override → env default). Tracked for point accounting so it matches the
  // baked loop bound even as the slider changes (the pipeline rebuilds on it).
  let plotsPerChainBaked = PLOTS_PER_CHAIN
  createEffect(() => {
    const fingerprint = parameterFingerprint()
    const o = outputTextures()
    if (!o || !fingerprint) {
      return undefined
    }

    const { textureSize, accumulationBuffer } = o
    const flame = untrack(animatedFlame)
    const dimensions: number = flame.renderSettings.dimensions ?? 2
    const typedAccumulationBuffer = accumulationBuffer
    const plotsPerChainValue = Math.max(
      1,
      Math.floor(flame.renderSettings.plotsPerChain ?? PLOTS_PER_CHAIN),
    )
    plotsPerChainBaked = plotsPerChainValue

    ifsPipeline = undefined
    ifsPipeline3D = undefined

    if (dimensions === 3 && camera3D) {
      ifsPipeline3D = createIFSPipeline3D(
        root,
        camera3D,
        Math.floor(flame.renderSettings.skipIters),
        pointRandomSeeds,
        pointPositions,
        pointColors,
        flame.transforms,
        textureSize,
        typedAccumulationBuffer,
        flame.renderSettings.colorInitMode,
        flame.renderSettings.pointInitMode,
        plotsPerChainValue,
        props.randomImplementationId ??
          DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID,
      )
    } else {
      ifsPipeline = createIFSPipeline(
        root,
        camera!,
        Math.floor(flame.renderSettings.skipIters),
        pointRandomSeeds,
        pointPositions,
        pointColors,
        flame.transforms,
        textureSize,
        typedAccumulationBuffer,
        flame.renderSettings.colorInitMode,
        flame.renderSettings.pointInitMode,
        props.blendFlame?.transforms,
        plotsPerChainValue,
        props.randomImplementationId ??
          DEFAULT_RENDERER_RANDOM_IMPLEMENTATION_ID,
      )
    }

    let batchIndex = 0
    let accumulatedPointCount_ = 0
    let lastExportRenderedPointCount = -1
    let forceDrawToScreen = false
    let clearRequested = true
    // When true, the next IFS tick re-initializes the persisted chains and pays
    // the warmup fuse (set on every accumulation reset). Otherwise chains
    // continue across dispatches, so warmup is paid once per settle.
    let resetPointStatePending = true
    // Periodically re-seed persisted chains so the sample distribution stays
    // stationary. A continuing chain on a slow-mixing flame (few transforms /
    // certain variation math) drifts off the invariant measure over time,
    // which — with our total-count brightness normalization — shows as the
    // image darkening as it accumulates. Re-seeding every N dispatches bounds
    // that drift; the warmup is amortized over N, so throughput barely moves.
    // Tunable via VITE_PERSIST_RESEED_INTERVAL — lower it to make skipIters /
    // warmup read more strongly and reduce settle flicker, at a throughput cost.
    let dispatchesSincePersistReseed = 0
    // Interactive estimator state: last iteration count, used to cap growth.
    let lastInteractiveIterationCount = 1
    // Export driver state: chunk size adapted from measured chunk wall time,
    // and the wall-clock time of the last canvas present.
    let exportIterationCount = EXPORT_INITIAL_ITERATIONS
    let lastPresentMs = 0
    let lastCountSignalMs = 0
    // Reused by the rAF pressure limiter, export driver, timestamp reader, and
    // benchmark completion callback. Keeping one fence per submission avoids
    // asking the queue for several equivalent promises.
    let latestQueueFence: Promise<void> = Promise.resolve()
    // Wakes the export driver when reactive work arrives (next frame's
    // descriptor, forced redraw). Keeps the idle wait event-driven: timers are
    // clamped to 1Hz by Chrome in hidden or occluded windows, signals are not.
    let notifyExportWork: (() => void) | undefined

    function requestRedraw() {
      rafLoop?.redraw()
      notifyExportWork?.()
    }

    // Re-blit the current color-graded accumulation to the canvas without doing
    // any IFS work. Used by the present pump to keep iOS WebKit's swapchain warm
    // between the throttled IFS presents (see the pump loop below).
    function presentToCanvas() {
      const cg = colorGradingPipeline()
      if (cg === undefined) return
      const encoder = device.createCommandEncoder()
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            loadOp: 'clear',
            storeOp: 'store',
            view: context
              .getCurrentTexture()
              .createView({ label: 'flam3PumpView' }),
          },
        ],
      })
      cg.run(pass)
      pass.end()
      device.queue.submit([encoder.finish()])
    }

    // Update IFS pipeline uniforms when animatedFlame changes.
    createEffect(() => {
      const flame = animatedFlame()

      if (ifsPipeline3D) {
        ifsPipeline3D.update(flame)
      } else if (ifsPipeline) {
        ifsPipeline.update(flame, props.blendFlame, props.blendWeight)
      }
    })

    // Update stochastic filter radius when quality or filter toggle changes.
    // Drives whichever IFS pipeline is active (2D or 3D) — both expose the same
    // setStochasticFilterRadius API.
    createEffect(() => {
      const pipeline = ifsPipeline3D ?? ifsPipeline
      if (!pipeline) return
      if (!props.stochasticFilterEnabled) {
        pipeline.setStochasticFilterRadius(0)
        return
      }
      const storedQuality =
        animatedFlame().renderSettings.densityEstimationQuality ?? 5
      const qualityK =
        storedQuality > 1 ? storedQuality : 0.5 + (1 - storedQuality) * 19.5
      const radius = Math.max(0.5, qualityK / 2)
      pipeline.setStochasticFilterRadius(radius)
    })

    const accumulationFingerprint = createMemo(() => {
      const flame = animatedFlame()
      const bf = props.blendFlame
      return JSON.stringify({
        dimensions: flame.renderSettings.dimensions ?? 2,
        transforms: flame.transforms,
        finalTransform: flame.finalTransform,
        colorInitMode: flame.renderSettings.colorInitMode,
        pointInitMode: flame.renderSettings.pointInitMode,
        skipIters: flame.renderSettings.skipIters,
        drawMode: flame.renderSettings.drawMode,
        ...(bf && { blendTransforms: bf.transforms }),
        blendWeight: props.blendWeight,
      })
    })

    // Reset accumulation when any structural or rendering parameter changes
    // (weights, affine, colors, etc.) but ignore color grading post-processing.
    createEffect(() => {
      accumulationFingerprint()
      resetAccumulation()
    })

    // Reset accumulation on animation frame change whenever the timeline drives
    // the view (playing, scrubbing, or holding a seeked/clicked frame). Without
    // this, IFS points from different frames accumulate together. Export drives
    // flame state itself via its own render path, so this only affects the live
    // view.
    createEffect(() => {
      if (!timeline) return
      timeline.currentFrame()
      if (timeline.isDrivingView()) {
        resetAccumulation()
      }
    })

    // Reset accumulation on camera pan/zoom — also during export: camera
    // keyframes change the projection of accumulated points, so every export
    // frame with camera motion must re-accumulate. Frames where the camera
    // (and transforms) are unchanged still skip the reset and reuse the
    // existing accumulation, which is correct for grading-only changes.
    createEffect(() => {
      camera?.update()
      camera3D?.update()
      if (!animationExportRunning()) resetAccumulation()
    })

    // Reset accumulation on export frame index change.
    let lastExportFrame: number | undefined
    createEffect(() => {
      const progress = animationExportProgress()
      if (progress && animationExportRunning()) {
        const frameIdx = progress.currentFrame
        if (frameIdx !== lastExportFrame) {
          lastExportFrame = frameIdx
          resetAccumulation()
        }
      } else {
        lastExportFrame = undefined
      }
    })

    function resetAccumulation() {
      if (DEBUG_MODE && untrack(animationExportRunning)) {
        console.info(
          `[Flam3 ${logTime()}] resetAccumulation (was ${accumulatedPointCount_} pts → 0, clear + re-warm pending)`,
        )
      }
      batchIndex = 0
      accumulatedPointCount_ = 0
      if (!props.isExportRenderer && props.setCurrentQuality !== undefined) {
        setInstanceAccumulatedPointCount(0)
      }
      lastExportRenderedPointCount = -1
      // Only the main workspace renderer (isExportRenderer) touches the global
      // counter; preview instances must not clobber it (it drives the debug panel,
      // progress bar and quality pills). Gating on onAccumulatedPointCount was
      // wrong — neither the main renderer nor VariationPreview passes it, so an
      // open gallery's previews were overwriting the main IFS readout.
      if (props.isExportRenderer ?? false) {
        setAccumulatedPointCountGlobal(0)
      }
      clearRequested = true
      // The accumulated chains are no longer valid for the new state — re-warm
      // them on the next tick rather than continuing stale chains.
      resetPointStatePending = true
      dispatchesSincePersistReseed = 0
      requestRedraw()
    }

    // Update color grading uniforms.
    createEffect(() => {
      // Track depth/light reactive deps to trigger redraw on slider changes
      void animatedFlame().renderSettings.depthColorPower
      void animatedFlame().renderSettings.lightPower
      writeColorGradingUniforms()
      requestRedraw()
      forceDrawToScreen = true
    })

    // Redraw when color grading pipeline or palette changes.
    createEffect(() => {
      const _ = colorGradingPipeline()
      void props.palette?.()
      requestRedraw()
      forceDrawToScreen = true
    })

    // One render tick: submit a bounded amount of IFS work and, when due, the
    // final-image passes. Shared by the interactive rAF driver and the async
    // export driver. Returns what was submitted so the export driver can pace
    // and size the next chunk.

    // Diagnostic counters: track consecutive silent bails to surface render
    // stalls in logs (e.g. iOS Safari canvas-sizing or GPU-init races).
    let consecutiveGpuNotReadyBails = 0
    let consecutivePipelineUndefinedBails = 0

    function renderTick(frameId: number): RenderTickResult {
      // Halt immediately when the device is gone. Without this, a device loss
      // with many live previews (e.g. the VariationSelector gallery) lets every
      // Flam3's rAF loop keep submitting to the dead device — a flood of
      // "Buffer is invalid" errors that jams the main thread before the reactive
      // poster swap can flush. Mirrors the colorGradingPipeline bail below.
      if (!gpuReady()) {
        consecutiveGpuNotReadyBails++
        consecutivePipelineUndefinedBails = 0
        if (
          DEBUG_MODE &&
          (consecutiveGpuNotReadyBails === 1 ||
            consecutiveGpuNotReadyBails % 60 === 0)
        ) {
          console.warn(
            `[Flam3] renderTick bailing: gpuReady=false (${consecutiveGpuNotReadyBails} consecutive frames)`,
          )
        }
        return { iterations: 0, presented: false, hadWork: false }
      }
      consecutiveGpuNotReadyBails = 0

      const currentExportCb = props.onExportImage
      const exportMode = exportDriverActive()

      const pointCountPerBatch = props.pointCountPerBatch
      const colorGradingPipeline_ = colorGradingPipeline()
      if (colorGradingPipeline_ === undefined) {
        consecutivePipelineUndefinedBails++
        if (
          DEBUG_MODE &&
          (consecutivePipelineUndefinedBails === 1 ||
            consecutivePipelineUndefinedBails % 60 === 0)
        ) {
          const size = canvasSize()
          console.warn(
            `[Flam3] renderTick bailing: colorGradingPipeline undefined ` +
              `(canvasSize: ${size.width}x${size.height}, ` +
              `${consecutivePipelineUndefinedBails} consecutive frames)`,
          )
        }
        return { iterations: 0, presented: false, hadWork: false }
      }
      consecutivePipelineUndefinedBails = 0

      const timings = timestampQuery.average()

      // Periodic preview cadence: batch-indexed when vsync paced (interactive),
      // wall-clock during exports (the export loop tick rate varies with chunk
      // size, so batch counting would present far too often).
      const periodicPresentDue = exportMode
        ? performance.now() - lastPresentMs >= EXPORT_PRESENT_INTERVAL_MS
        : batchIndex < OUTPUT_EVERY_FRAME_BATCH_INDEX ||
          batchIndex % OUTPUT_INTERVAL_BATCH_INDEX === 0

      let iterationCount = 0
      if (continueRendering(accumulatedPointCount_)) {
        if (exportMode) {
          iterationCount = exportIterationCount
        } else if (timings) {
          // Cap growth at 1.5x per tick: without GPU timestamps the ifsMs
          // fallback measures submit→completion wall latency, which on an
          // empty queue under-reports the true cost and would otherwise slam
          // the iteration count straight to the maximum, saturating the GPU
          // queue (Chrome reacts by collapsing the rAF cadence).
          const estimated = estimateIterationCount(
            timings,
            forceDrawToScreen || periodicPresentDue,
          )
          const maxIterations = isInteractive() ? 8 : 1000
          iterationCount = Math.min(
            estimated,
            maxIterations,
            Math.max(4, Math.ceil(lastInteractiveIterationCount * 1.5)),
          )
          lastInteractiveIterationCount = iterationCount
        } else {
          iterationCount = 1
        }
      }

      // Each dispatched chain (thread) plots PLOTS_PER_CHAIN points after its
      // warmup, so plotted points = threads × PLOTS_PER_CHAIN × dispatches.
      const accumulatedAfter =
        accumulatedPointCount_ +
        pointCountPerBatch * plotsPerChainBaked * iterationCount

      // Export readiness is decided with the post-accumulation count so the
      // final color-graded render and the capture happen in the same
      // submission — the captured canvas can never lag the accumulation.
      const isExportReady =
        currentExportCb !== undefined && !continueRendering(accumulatedAfter)

      const isQualityReached = !continueRendering(accumulatedAfter)
      const isAutoFpsReady =
        timeline &&
        timeline.isPlaying() &&
        timeline.config().autoFps &&
        isQualityReached

      const shouldRenderFinalImage =
        forceDrawToScreen ||
        (isExportReady || isAutoFpsReady
          ? accumulatedAfter !== lastExportRenderedPointCount
          : periodicPresentDue)

      const hadWork =
        clearRequested || iterationCount > 0 || shouldRenderFinalImage

      if (!hadWork) {
        // Nothing to submit — still report state so export capture, progress
        // and cancellation keep flowing while the export driver idles.
        const finalImageReady =
          isExportReady &&
          lastExportRenderedPointCount === accumulatedPointCount_
        if (DEBUG_MODE && finalImageReady && untrack(animationExportRunning)) {
          console.info(
            `[Flam3 ${logTime()}] !hadWork emit finalImageReady=TRUE at ${accumulatedPointCount_} pts (no new IFS work this tick) — capture gate may grab a STALE frame`,
          )
        }
        currentExportCb?.(canvas, { finalImageReady })
        return { iterations: 0, presented: false, hadWork: false }
      }

      const encoder = device.createCommandEncoder()

      if (clearRequested) {
        clearRequested = false
        encoder.clearBuffer(accumulationBuffer.buffer)
      }

      // Only the main workspace renderer reports debug timings. Offscreen
      // export jobs (and previews) share these global stats but must not write
      // them, or the DebugPanel's "ms IFS" readout would track the offscreen
      // render instead of the visible one.
      if (timings && (props.isExportRenderer ?? false)) {
        setRenderTimings({
          ...timings,
          adaptiveFilterMs:
            props.adaptiveFilterEnabled && !props.stochasticFilterEnabled
              ? timings.adaptiveFilterMs
              : 0,
        })
      }

      const timestampWrites = timestampQuery.timestampWrites(frameId)

      {
        const passDesc: GPUComputePassDescriptor = timestampWrites.ifsMs
          ? { timestampWrites: timestampWrites.ifsMs }
          : {}

        const pass = encoder.beginComputePass(passDesc)
        if (iterationCount > 0) {
          const pipeline = ifsPipeline3D ?? ifsPipeline!
          // Pay the warmup only on the first tick after a settle; subsequent
          // ticks continue the persisted chains. Ordered before the dispatch in
          // this submission (queue.writeBuffer then queue.submit).
          // Re-seed every dispatch unless persisting chains. Persistence is only
          // safe for a real chaos game (2+ transforms); a single-map flame would
          // collapse onto its attractor (shape contraction) if its chains
          // continued. The persistChains prop can force either way.
          // Plots/Chain = 1 is "classic" mode: re-warm every dispatch so each
          // plotted point sits at exactly depth skipIters and the slider fully
          // controls convergence. Persistence would re-converge it otherwise.
          const persistChains =
            props.persistChains ??
            (visibleTransformCount() >= 2 && plotsPerChainBaked > 1)
          // Force a periodic re-seed so a slow-mixing flame's chains can't
          // drift far enough off the invariant measure to darken the image.
          if (
            persistChains &&
            !resetPointStatePending &&
            dispatchesSincePersistReseed >= PERSIST_RESEED_INTERVAL
          ) {
            resetPointStatePending = true
          }
          const reseeding = !persistChains || resetPointStatePending
          pipeline.setResetPoints(reseeding ? 1 : 0)
          if (reseeding) {
            dispatchesSincePersistReseed = 0
          } else {
            dispatchesSincePersistReseed += iterationCount
          }
          if (persistChains) resetPointStatePending = false
          for (let i = 0; i < iterationCount; i++) {
            pipeline.run(pass, pointCountPerBatch)
          }
        }
        pass.end()

        accumulatedPointCount_ = accumulatedAfter
      }

      if (shouldRenderFinalImage) {
        if (isExportReady || isAutoFpsReady) {
          lastExportRenderedPointCount = accumulatedPointCount_
          if (DEBUG_MODE && isExportReady && untrack(animationExportRunning)) {
            console.info(
              `[Flam3 ${logTime()}] rendered FRESH export image at ${accumulatedPointCount_} pts`,
            )
          }
        }
        lastPresentMs = performance.now()
        const skipItersFactor =
          1 + animatedFlame().renderSettings.skipIters * 0.05
        currentAveragePointCountPerBucketInv =
          (bucketProbabilityInv() / accumulatedPointCount_) * skipItersFactor
        writeColorGradingUniforms()
        if (props.adaptiveFilterEnabled && !props.stochasticFilterEnabled) {
          const passDesc: GPUComputePassDescriptor =
            timestampWrites.adaptiveFilterMs
              ? { timestampWrites: timestampWrites.adaptiveFilterMs }
              : {}
          const pass = encoder.beginComputePass(passDesc)
          runAdaptiveFilter()?.run(pass)
          pass.end()
        }

        {
          const passDesc: GPURenderPassDescriptor = {
            ...(timestampWrites.colorGradingMs
              ? { timestampWrites: timestampWrites.colorGradingMs }
              : {}),
            colorAttachments: [
              {
                loadOp: 'clear',
                storeOp: 'store',
                view: context
                  .getCurrentTexture()
                  .createView({ label: 'flam3CanvasView' }),
              },
            ],
          }
          const pass = encoder.beginRenderPass(passDesc)
          colorGradingPipeline_.run(pass)
          pass.end()
        }
      }

      timestampQuery.write(encoder, Math.max(iterationCount, 1))
      device.queue.submit([encoder.finish()])
      const completedCount = accumulatedPointCount_
      if (!props.isExportRenderer && props.setCurrentQuality !== undefined) {
        setInstanceAccumulatedPointCount(completedCount)
      }
      latestQueueFence = device.queue.onSubmittedWorkDone()

      // Signal the accumulated count only AFTER the submit. Consumers
      // (e.g. the benchmark / hardware-tier detector) may synchronously tear
      // this renderer down from the callback — doing it before submit would
      // destroy the pipeline's buffers while the just-encoded command buffer
      // still references them ("used in submit while destroyed").
      if (props.isExportRenderer ?? false) {
        // Ready ticks always write so the capture gate sees a fresh count.
        const nowMs = performance.now()
        if (
          !exportMode ||
          isExportReady ||
          nowMs - lastCountSignalMs >= EXPORT_COUNT_SIGNAL_INTERVAL_MS
        ) {
          lastCountSignalMs = nowMs
          setAccumulatedPointCountGlobal(accumulatedPointCount_)
        }
      }
      props.onAccumulatedPointCount?.(accumulatedPointCount_)

      if (currentExportCb) {
        currentExportCb(canvas, {
          finalImageReady:
            isExportReady &&
            lastExportRenderedPointCount === accumulatedPointCount_,
        })
      }

      void latestQueueFence
        .then(
          () => {
            props.onCompletedPointCount?.({
              count: completedCount,
              completedAtMs: performance.now(),
            })
            return timestampQuery.read(frameId)
          },
          (error: unknown) => {
            props.onCompletedPointCountError?.(error)
          },
        )
        .catch(() => {})

      batchIndex += 1
      forceDrawToScreen = false

      if (timeline && timeline.isPlaying() && timeline.config().autoFps) {
        if (isQualityReached) {
          timeline.advanceFrame()
        }
      }

      return {
        iterations: iterationCount,
        presented: shouldRenderFinalImage,
        hadWork: true,
      }
    }

    const rafLoop = createAnimationFrame(
      (frameId) => {
        renderTick(frameId)
      },
      () =>
        continueRendering(accumulatedPointCount_)
          ? props.renderInterval
          : Infinity,
      () => latestQueueFence,
      // Tear the rAF loop down entirely when an export takes over OR when the
      // device is lost. The `!gpuReady()` read is reactive, so a device loss
      // disposes every preview's loop on the spot (no more requestAnimationFrame,
      // no more onSubmittedWorkDone holds against a dead queue).
      () => exportDriverActive() || !gpuReady(),
    )

    // Present pump (Apple WebKit only): a WebGPU canvas that isn't drawn every
    // frame shows stale swapchain buffers. The interactive loop above only
    // presents when an IFS batch completes — on a slow GPU that can be
    // 100-200ms apart during a load, long enough for WebKit to flash the
    // previous flame between presents. Re-present the current image every frame
    // while the flame is still accumulating so no gap is ever visible.
    //
    // Scoped tightly, because a re-blit is not free — it submits a full-screen
    // color-grading pass into the same queue the IFS uses:
    //  - WebKit only. On Blink/Gecko the pump buys nothing, and its cost lands
    //    in `ifsMs` (the no-timestamp fallback measures the whole queue
    //    draining), which shrinks the estimated iteration count and slows
    //    accumulation for everyone.
    //  - Main visible canvas only (previews/gallery tiles excluded).
    //  - Never during an export — that driver owns the canvas.
    //  - Only while the main renderer is actually running: at
    //    `renderInterval === Infinity` a modal gallery has deliberately taken
    //    the GPU, and the accumulation buffer is frozen, so pumping would
    //    re-blit an identical image at 60Hz against the very previews the
    //    pause exists to feed.
    createAnimationFrame(
      () => {
        if (!gpuReady() || exportDriverActive()) return
        // Skip the pre-first-present window (no accumulation yet — avoid a black
        // flash) and stop once quality is reached (swapchain already warm).
        if (
          accumulatedPointCount_ <= 0 ||
          !continueRendering(accumulatedPointCount_)
        ) {
          return
        }
        presentToCanvas()
      },
      0,
      undefined,
      () =>
        !isAppleWebKit() ||
        exportDriverActive() ||
        !gpuReady() ||
        !Number.isFinite(props.renderInterval) ||
        !(props.isExportRenderer ?? false),
    )

    // When the render interval drops from Infinity (modal closed) back to a
    // finite rate, force an immediate redraw so the first frame appears without
    // waiting for the next rAF delta-time check. On iOS Safari this also helps
    // recover from any transient GPU-queue stall during the modal transition.
    // Gate on the Infinity -> finite transition only: every flame load already
    // redraws via resetAccumulation(), so redrawing on every finite interval
    // change (e.g. entering/leaving export at interval 0) would be redundant.
    // Seed with untrack() so this outer (pipeline-building) scope does not
    // subscribe to renderInterval — only the inner effect below should.
    let renderIntervalWasFinite = untrack(() =>
      Number.isFinite(props.renderInterval),
    )
    createEffect(() => {
      const finite = Number.isFinite(props.renderInterval)
      const resumedFromStall = finite && !renderIntervalWasFinite
      renderIntervalWasFinite = finite
      if (resumedFromStall) {
        requestRedraw()
      }
    })

    // Export driver: replaces the rAF loop while an export runs. The loop
    // awaits each submission, so at most one chunk is in flight — the browser
    // compositor never sees a deep GPU queue (no rAF collapse in Chrome), the
    // export keeps running in background tabs, and chunk wall time is a valid
    // measurement to size the next chunk with.
    createEffect(() => {
      // Stop driving on device loss too: a reactive !gpuReady() re-runs this
      // effect, fires onCleanup (disposed = true) and breaks the export loop.
      if (!exportDriverActive() || !gpuReady()) return

      let disposed = false
      onCleanup(() => {
        disposed = true
        notifyExportWork = undefined
      })

      exportIterationCount = EXPORT_INITIAL_ITERATIONS
      let exportFrameId = 0

      // Telemetry — timestamped so stalls can be correlated with tab
      // switches, window moves and occlusion. Chrome fires visibilitychange
      // (-> hidden) also when the window is fully covered by another window.
      let windowStartMs = performance.now()
      let windowPoints = 0
      let windowTickMs = 0
      let windowTicks = 0
      let idleSinceMs: number | undefined

      if (DEBUG_MODE) {
        const onVisibilityChange = () => {
          console.info(
            `[ExportDriver ${logTime()}] document became ${document.visibilityState}`,
          )
        }
        document.addEventListener('visibilitychange', onVisibilityChange)
        onCleanup(() => {
          document.removeEventListener('visibilitychange', onVisibilityChange)
        })
      }

      const loop = async () => {
        // Leave the effect's tracking scope before the first tick so signal
        // reads inside renderTick don't become dependencies of this effect.
        await Promise.resolve()

        while (!disposed) {
          const startMs = performance.now()
          const tick = renderTick(exportFrameId++)

          if (!tick.hadWork) {
            // Waiting for a capture or the next frame's descriptor.
            // Event-driven wake (requestRedraw) with a timer backstop; the
            // timer alone could be clamped to 1Hz in hidden/occluded windows.
            idleSinceMs ??= startMs
            await new Promise<void>((resolve) => {
              notifyExportWork = resolve
              setTimeout(() => {
                resolve()
              }, EXPORT_IDLE_DELAY_MS)
            })
            notifyExportWork = undefined
            continue
          }

          if (idleSinceMs !== undefined) {
            const idleMs = startMs - idleSinceMs
            if (DEBUG_MODE && idleMs > 1000) {
              console.info(
                `[ExportDriver ${logTime()}] resumed work after ${(idleMs / 1000).toFixed(1)}s idle`,
              )
            }
            idleSinceMs = undefined
          }

          try {
            await latestQueueFence
          } catch {
            // Device lost — stop driving; the app-level handler takes over.
            break
          }

          const tickMs = performance.now() - startMs
          windowPoints +=
            tick.iterations * props.pointCountPerBatch * plotsPerChainBaked
          windowTickMs += tickMs
          windowTicks += 1

          if (DEBUG_MODE && tickMs > EXPORT_SLOW_TICK_MS) {
            console.info(
              `[ExportDriver ${logTime()}] slow tick: ${tickMs.toFixed(0)}ms for a ${tick.iterations}-iteration chunk${tick.presented ? ' (presented)' : ''}`,
            )
          }

          const nowMs = performance.now()
          if (nowMs - windowStartMs >= EXPORT_LOG_INTERVAL_MS) {
            if (DEBUG_MODE) {
              const seconds = (nowMs - windowStartMs) / 1000
              const avgTickMs = windowTickMs / Math.max(windowTicks, 1)
              console.info(
                `[ExportDriver ${logTime()}] ${formatPointCount(windowPoints / seconds)} pts/s | ${windowTicks} ticks, avg ${avgTickMs.toFixed(1)}ms | chunk=${exportIterationCount} iters`,
              )
            }
            windowStartMs = nowMs
            windowPoints = 0
            windowTickMs = 0
            windowTicks = 0
          }

          if (tick.iterations > 0 && !tick.presented) {
            // Dual-rate controller (presentation ticks are skipped: their
            // wall time includes the filter/grading passes and would skew it).
            if (tickMs < EXPORT_TICK_GROW_BELOW_MS) {
              // Clearly latency-bound — the fixed await floor dominates, so
              // more iterations are effectively free. Double.
              exportIterationCount = Math.min(
                exportIterationCount * 2,
                EXPORT_MAX_ITERATIONS,
              )
            } else if (tickMs <= EXPORT_TICK_SHRINK_ABOVE_MS) {
              // Inside the band (e.g. sitting exactly on a vsync floor that
              // is >= the grow threshold) — creep upward to find the point
              // where GPU time, not latency, sets the pace.
              exportIterationCount = Math.min(
                Math.ceil(exportIterationCount * 1.25),
                EXPORT_MAX_ITERATIONS,
              )
            } else {
              // The chunk itself overshot the budget — shrink proportionally.
              exportIterationCount = Math.max(
                Math.ceil(
                  exportIterationCount * (EXPORT_TARGET_TICK_MS / tickMs),
                ),
                1,
              )
            }
          }
        }
      }
      void loop()
    })

    // When quality changes (up or down), force a redraw so the interval function
    // re-evaluates continueRendering() with the updated point limit. Without this,
    // quality downgrades may not immediately stop rendering because the RAF interval
    // callback reads props.quality outside SolidJS tracking context.
    createEffect(() => {
      const q = props.quality
      void q
      requestRedraw()
    })
  })
  return null
}
