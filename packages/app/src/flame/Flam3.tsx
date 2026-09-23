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
import { logTime } from '@/utils/logTime'
import { exportTickIterations } from '@/utils/motionBlur'
import { recordEntries } from '@/utils/record'
import { applyTimelineToFlame } from '@/utils/timeline'
import { vramTrack } from '@/utils/vramLog'
import { Camera3DContext } from '../lib/Camera3DContext'
import { CameraContext } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useLiveRootContext } from '../lib/RootContext'
import { createAdaptiveBlurPipeline } from './adaptiveBlurPipeline'
import { ColorGradingUniforms, createColorGradingPipeline, } from './colorGrading'
import { createDensityEstimationPipeline } from './densityEstimationPipeline'
import { drawModeToImplFn } from './drawMode'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import { createExportRenderDriver, createInteractiveRenderDriver, EXPORT_COUNT_SIGNAL_INTERVAL_MS, EXPORT_INITIAL_ITERATIONS, EXPORT_PRESENT_INTERVAL_MS, } from './renderDrivers'
import { backgroundColorDefault, backgroundColorDefaultWhite, } from './schema/flameSchema'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER, FilterParams } from './types'
import type { v4f } from 'typegpu/data'
import type { Palette } from './colorMap'
import type { ExportImageType } from './exportImageType'
import type { CompletedPointCountInfo, RenderTickResult } from './renderDrivers'
import type { FlameDescriptor } from './schema/flameSchema'
import type { RendererRandomImplementationId } from '@/shaders/random'

export type { CompletedPointCountInfo }

const { sqrt } = Math
const { performance } = globalThis

const OUTPUT_EVERY_FRAME_BATCH_INDEX = 20
const OUTPUT_INTERVAL_BATCH_INDEX = 10

// Floor for the radius used in the 3D density/quality normalization. Below this,
// scale = 1/radius makes the projected area (scale²) explode, saturating the
// quality cap and blowing out brightness. The camera may zoom closer; only the
// normalization is held here.
const MIN_DENSITY_NORM_RADIUS = 0.01

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
  /** Offscreen export driver only. While set, accumulation resets when this key
   *  changes and on nothing else, so the sub-frames of one output frame (motion
   *  blur) accumulate into one buffer instead of each flame change starting it
   *  over. The main workspace renderer gets the same behaviour from the global
   *  animationExportRunning signal; an offscreen job cannot use that, because it
   *  would also freeze the live view's resets while the job runs. */
  exportFrameKey?: number
  /** Export motion blur: stop accumulating at this fraction of the quality
   *  point limit, and never let one export tick run past it. The export loop
   *  raises it sub-frame by sub-frame. Without it the export driver sizes a
   *  tick to reach the whole limit at once, so the first sub-frame took the
   *  entire budget and the rest accumulated nothing. Undefined = whole limit. */
  accumulationFraction?: number
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
    const height =
      Number.isFinite(size.height) && size.height > 0 ? size.height : 512
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
      return Math.max(1, scale * scale)
    }
    const rawZoom = camera?.zoom()
    const safeZoom =
      Number.isFinite(rawZoom) && (rawZoom ?? 0) > 0 ? rawZoom! : 1
    const unitSquareArea = (height ** 2 * safeZoom ** 2) / 4
    return Math.max(1, unitSquareArea)
  })

  /** u32-safe point cap: prevents per-bucket atomic overflow at high quality */
  const safeQualityCap = () => {
    const size = canvasSize()
    const width =
      Number.isFinite(size.width) && size.width > 0 ? size.width : 512
    const height =
      Number.isFinite(size.height) && size.height > 0 ? size.height : 512
    const totalBuckets = width * height
    const MAX_U32 = 0xffffffff
    const maxPointsPerBucket = Math.floor(
      MAX_U32 / BUCKET_FIXED_POINT_MULTIPLIER,
    )
    // Conservative concentration factor — hottest buckets may be 25x above average
    const concentrationFactor = 25
    return Math.floor((maxPointsPerBucket * totalBuckets) / concentrationFactor)
  }

  const qualityPointCountLimit = () => {
    const q = Number.isFinite(props.quality) ? props.quality : 0.85
    const inv = bucketProbabilityInv()
    const safeInv = Number.isFinite(inv) && inv > 0 ? inv : 10000
    const denom = Math.max(1e-9, q ** 2 - 2 * q + 1)
    const rawLimit = safeInv / denom
    const cap = safeQualityCap()
    const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 10000000
    return Math.max(100, Math.min(rawLimit, safeCap))
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

  /*
   * The draw mode alone, not the flame it came from.
   *
   * `colorGradingPipeline` below builds a real GPU pipeline, and it used to
   * read `props.flameDescriptor.renderSettings.drawMode` inline. That reads
   * one store path while the workspace hands over the store proxy, but a
   * whole new object whenever the flame is derived — a hovered variation, or
   * audio modulation at 30fps — and the pipeline was then rebuilt for every
   * one of those frames. Memoizing the mode gives the pipeline a dependency
   * that changes when the draw mode does and not before.
   */
  const drawModeImpl = createMemo(
    () => drawModeToImplFn[props.flameDescriptor.renderSettings.drawMode],
  )

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
      drawModeImpl(),
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

  /** Where accumulation stops: the quality limit, or this step's share of it. */
  const accumulationStop = () =>
    qualityPointCountLimit() * (props.accumulationFraction ?? 1)

  const continueRendering = (accumulatedPointCount: number) => {
    if (props.disableQualityLimit) return true
    return accumulatedPointCount <= accumulationStop()
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
    // A replay pacing a play window moves the playhead itself.
    if (
      !timeline ||
      !props.animationEnabled ||
      !timeline.isPlaying() ||
      timeline.pacedPlayback() ||
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
    // Estimator state: last iteration count, used to cap growth.
    let lastInteractiveIterationCount = 1
    let lastPresentMs = 0
    let lastCountSignalMs = 0
    // Reused by the rAF pressure limiter, export driver, timestamp reader, and
    // benchmark completion callback. Keeping one fence per submission avoids
    // asking the queue for several equivalent promises.
    let latestQueueFence: Promise<void> = Promise.resolve()
    const drivers: {
      interactive?: ReturnType<typeof createInteractiveRenderDriver>
      export?: ReturnType<typeof createExportRenderDriver>
    } = {}

    function requestRedraw() {
      drivers.interactive?.redraw()
      drivers.export?.wake()
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

    // An export loop owns accumulation resets -- the global main-canvas export,
    // or this instance's exportFrameKey -- rather than ordinary edits.
    const exportOwnsResets = () =>
      animationExportRunning() || props.exportFrameKey !== undefined

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
    // During animation export, accumulation resets are driven explicitly by export frame change.
    createEffect(() => {
      accumulationFingerprint()
      if (!exportOwnsResets()) {
        resetAccumulation()
      }
    })

    // Reset accumulation on animation frame change whenever the timeline drives
    // the view (playing, scrubbing, or holding a seeked/clicked frame). Without
    // this, IFS points from different frames accumulate together. Export drives
    // flame state itself via its own render path, so this only affects the live
    // view.
    createEffect(() => {
      if (!timeline) return
      timeline.currentFrame()
      // An export steps the playhead once per motion-blur sub-frame, so a reset
      // here would keep only the last sub-frame. Exports reset once per output
      // frame themselves: the export-frame effect below, or exportFrameKey.
      if (timeline.isDrivingView() && !exportOwnsResets()) {
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
      if (!exportOwnsResets()) resetAccumulation()
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

    // Offscreen export: a new output frame, signalled by this instance's key.
    createEffect(() => {
      if (props.exportFrameKey !== undefined) resetAccumulation()
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

    function validatePreconditions(): boolean {
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
        return false
      }
      consecutiveGpuNotReadyBails = 0

      if (colorGradingPipeline() === undefined) {
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
        return false
      }
      consecutivePipelineUndefinedBails = 0
      return true
    }

    function estimateIterations(
      exportMode: boolean,
      timings: ReturnType<typeof timestampQuery.average>,
      periodicPresentDue: boolean,
    ): number {
      if (!continueRendering(accumulatedPointCount_)) return 0
      if (exportMode) {
        const planned =
          drivers.export?.getExportIterationCount() ?? EXPORT_INITIAL_ITERATIONS
        if (props.accumulationFraction === undefined) return planned
        // Motion blur: a tick may not run past this sub-frame's share.
        return exportTickIterations(
          planned,
          accumulationStop() - accumulatedPointCount_,
          props.pointCountPerBatch * plotsPerChainBaked,
        )
      }
      if (timings) {
        const estimated = estimateIterationCount(
          timings,
          forceDrawToScreen || periodicPresentDue,
        )
        const maxIterations = isInteractive() ? 8 : 1000
        const result = Math.min(
          estimated,
          maxIterations,
          Math.max(4, Math.ceil(lastInteractiveIterationCount * 1.5)),
        )
        lastInteractiveIterationCount = result
        return result
      }
      return 1
    }

    function recordAccumulationPass(
      encoder: GPUCommandEncoder,
      iterationCount: number,
      timestampWrites: { ifsMs?: GPUComputePassTimestampWrites },
    ): void {
      const passDesc: GPUComputePassDescriptor = timestampWrites.ifsMs
        ? { timestampWrites: timestampWrites.ifsMs }
        : {}

      const pass = encoder.beginComputePass(passDesc)
      if (iterationCount > 0) {
        const pipeline = ifsPipeline3D ?? ifsPipeline!
        const persistChains =
          props.persistChains ??
          (visibleTransformCount() >= 2 && plotsPerChainBaked > 1)
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
          pipeline.run(pass, props.pointCountPerBatch)
        }
      }
      pass.end()
    }

    function recordColorGradingPass(
      encoder: GPUCommandEncoder,
      pipeline: NonNullable<ReturnType<typeof colorGradingPipeline>>,
      timestampWrites: {
        adaptiveFilterMs?: GPUComputePassTimestampWrites
        colorGradingMs?: GPURenderPassTimestampWrites
      },
    ): void {
      lastPresentMs = performance.now()
      const skipItersFactor =
        1 + animatedFlame().renderSettings.skipIters * 0.05
      const pts = Math.max(1, accumulatedPointCount_)
      const rawInv = (bucketProbabilityInv() / pts) * skipItersFactor
      currentAveragePointCountPerBucketInv =
        Number.isFinite(rawInv) && rawInv > 0 ? rawInv : 0
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
      pipeline.run(pass)
      pass.end()
    }

    interface TickStatus {
      iterationCount: number
      accumulatedAfter: number
      isExportReady: boolean
      isQualityReached: boolean
      isAutoFpsReady: boolean
      shouldRenderFinalImage: boolean
      hadWork: boolean
    }

    function evaluateTickStatus(
      exportMode: boolean,
      timings: ReturnType<typeof timestampQuery.average>,
      currentExportCb: typeof props.onExportImage,
    ): TickStatus {
      const periodicPresentDue = exportMode
        ? performance.now() - lastPresentMs >= EXPORT_PRESENT_INTERVAL_MS
        : batchIndex < OUTPUT_EVERY_FRAME_BATCH_INDEX ||
          batchIndex % OUTPUT_INTERVAL_BATCH_INDEX === 0

      const iterationCount = estimateIterations(
        exportMode,
        timings,
        periodicPresentDue,
      )

      const accumulatedAfter =
        accumulatedPointCount_ +
        props.pointCountPerBatch * plotsPerChainBaked * iterationCount

      const isQualityReached = !continueRendering(accumulatedAfter)
      const isExportReady = currentExportCb !== undefined && isQualityReached
      const isAutoFpsActive = Boolean(
        timeline?.isPlaying() && timeline.config().autoFps,
      )
      const isAutoFpsReady = isAutoFpsActive && isQualityReached

      const shouldRenderFinalImage =
        forceDrawToScreen ||
        (isExportReady || isAutoFpsReady
          ? accumulatedAfter !== lastExportRenderedPointCount
          : periodicPresentDue)

      const hadWork =
        clearRequested || iterationCount > 0 || shouldRenderFinalImage

      return {
        iterationCount,
        accumulatedAfter,
        isExportReady,
        isQualityReached,
        isAutoFpsReady,
        shouldRenderFinalImage,
        hadWork,
      }
    }

    function handleNoWorkTick(
      isExportReady: boolean,
      currentExportCb: typeof props.onExportImage,
    ): RenderTickResult {
      const finalImageReady =
        isExportReady && lastExportRenderedPointCount === accumulatedPointCount_
      if (DEBUG_MODE && finalImageReady && untrack(animationExportRunning)) {
        console.info(
          `[Flam3 ${logTime()}] !hadWork emit finalImageReady=TRUE at ${accumulatedPointCount_} pts (no new IFS work this tick) — capture gate may grab a STALE frame`,
        )
      }
      currentExportCb?.(canvas, {
        finalImageReady,
        fence: latestQueueFence,
      })
      return { iterations: 0, presented: false, hadWork: false }
    }

    function recordTickPasses(
      encoder: GPUCommandEncoder,
      status: TickStatus,
      colorGradingPipeline_: NonNullable<
        ReturnType<typeof colorGradingPipeline>
      >,
      timestampWrites: ReturnType<typeof timestampQuery.timestampWrites>,
    ): void {
      if (clearRequested) {
        clearRequested = false
        encoder.clearBuffer(accumulationBuffer.buffer)
      }

      recordAccumulationPass(encoder, status.iterationCount, timestampWrites)
      accumulatedPointCount_ = status.accumulatedAfter

      if (status.shouldRenderFinalImage) {
        if (status.isExportReady || status.isAutoFpsReady) {
          lastExportRenderedPointCount = accumulatedPointCount_
          if (
            DEBUG_MODE &&
            status.isExportReady &&
            untrack(animationExportRunning)
          ) {
            console.info(
              `[Flam3 ${logTime()}] rendered FRESH export image at ${accumulatedPointCount_} pts`,
            )
          }
        }
        recordColorGradingPass(encoder, colorGradingPipeline_, timestampWrites)
      }
    }

    function handlePostSubmit(
      exportMode: boolean,
      status: TickStatus,
      currentExportCb: typeof props.onExportImage,
      frameId: number,
    ): void {
      const completedCount = accumulatedPointCount_
      if (!props.isExportRenderer && props.setCurrentQuality !== undefined) {
        setInstanceAccumulatedPointCount(completedCount)
      }
      latestQueueFence = device.queue.onSubmittedWorkDone()

      if (props.isExportRenderer ?? false) {
        const nowMs = performance.now()
        if (
          !exportMode ||
          status.isExportReady ||
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
            status.isExportReady &&
            lastExportRenderedPointCount === accumulatedPointCount_,
          fence: latestQueueFence,
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

      if (
        status.isAutoFpsReady &&
        timeline?.isPlaying() &&
        !timeline.pacedPlayback() &&
        timeline.config().autoFps
      ) {
        timeline.advanceFrame()
      }
    }

    function renderTick(frameId: number): RenderTickResult {
      if (!validatePreconditions()) {
        return { iterations: 0, presented: false, hadWork: false }
      }

      const colorGradingPipeline_ = colorGradingPipeline()!
      const currentExportCb = props.onExportImage
      const exportMode = exportDriverActive()
      const timings = timestampQuery.average()

      const status = evaluateTickStatus(exportMode, timings, currentExportCb)
      if (!status.hadWork) {
        return handleNoWorkTick(status.isExportReady, currentExportCb)
      }

      const encoder = device.createCommandEncoder()
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
      recordTickPasses(encoder, status, colorGradingPipeline_, timestampWrites)

      timestampQuery.write(encoder, Math.max(status.iterationCount, 1))
      device.queue.submit([encoder.finish()])

      handlePostSubmit(exportMode, status, currentExportCb, frameId)

      return {
        iterations: status.iterationCount,
        presented: status.shouldRenderFinalImage,
        hadWork: true,
      }
    }

    drivers.interactive = createInteractiveRenderDriver({
      renderTick,
      renderInterval: () => props.renderInterval,
      continueRendering: () => continueRendering(accumulatedPointCount_),
      hasAccumulatedPoints: () => accumulatedPointCount_ > 0,
      latestQueueFence: () => latestQueueFence,
      exportDriverActive,
      gpuReady,
      presentToCanvas,
      isExportRenderer: () => props.isExportRenderer ?? false,
      onStallResumed: () => {
        requestRedraw()
      },
    })

    drivers.export = createExportRenderDriver({
      exportDriverActive,
      gpuReady,
      renderTick,
      latestQueueFence: () => latestQueueFence,
      pointCountPerBatch: () => props.pointCountPerBatch,
      plotsPerChainBaked: () => plotsPerChainBaked,
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
