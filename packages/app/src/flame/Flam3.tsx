import { createEffect, createMemo, createSignal, onCleanup, untrack, } from 'solid-js'
import { arrayOf, vec2u, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { useTimeline } from '@/contexts/TimelineContext'
import { DEBUG_MODE } from '@/defaults'
import { accumulatedPointCount, animationExportRunning, exportQuality, setAccumulatedPointCountGlobal, setRenderTimings, } from '@/flame/renderStats'
import { deepClone } from '@/utils/clone'
import { createTimestampQuery } from '@/utils/createTimestampQuery'
import { formatPointCount } from '@/utils/formatPointCount'
import { logTime } from '@/utils/logTime'
import { recordEntries } from '@/utils/record'
import { applyTimelineToFlame } from '@/utils/timeline'
import { useCamera } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useRootContext } from '../lib/RootContext'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { createAdaptiveBlurPipeline } from './adaptiveBlurPipeline'
import { ColorGradingUniforms, createColorGradingPipeline, } from './colorGrading'
import { createDensityEstimationPipeline } from './densityEstimationPipeline'
import { drawModeToImplFn } from './drawMode'
import { createIFSPipeline } from './ifsPipeline'
import { backgroundColorDefault, backgroundColorDefaultWhite, } from './schema/flameSchema'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER, FilterParams } from './types'
import type { v4f } from 'typegpu/data'
import type { Palette } from './colorMap'
import type { FlameDescriptor } from './schema/flameSchema'
import type { ExportImageType } from '@/App'
import type { FlameDescriptor as TimelineFlameDescriptor } from '@/utils/timeline'

const { sqrt } = Math
const { performance } = globalThis

const OUTPUT_EVERY_FRAME_BATCH_INDEX = 20
const OUTPUT_INTERVAL_BATCH_INDEX = 10

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

type Flam3Props = {
  quality: number
  pointCountPerBatch: number
  renderInterval: number
  adaptiveFilterEnabled: boolean
  animationEnabled: boolean
  flameDescriptor: FlameDescriptor
  edgeFadeColor: v4f
  onExportImage?: ExportImageType
  /** Marks the main workspace renderer: exports (animation/still) switch its
   *  render loop from rAF to the async export driver. Preview instances must
   *  not set this. */
  isExportRenderer?: boolean
  setCurrentQuality?: (fn: () => number) => void
  setQualityPointCountLimit?: (fn: () => number) => void
  palette?: () => Palette | undefined
  outputAlpha?: boolean
  onAccumulatedPointCount?: (count: number) => void
  disableQualityLimit?: boolean
  blendFlame?: FlameDescriptor
  blendWeight?: number
}

export function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, canvas, canvasFormat } = useCanvas()
  const timeline = useTimeline()

  const [animatedFlame, setAnimatedFlame] =
    createSignal<TimelineFlameDescriptor>(deepClone(props.flameDescriptor))

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
  // which has no reactive owner. Solid wraps conditional JSX props in lazily-created memos,
  // so a first camera.zoom() read from rAF would create those computations owner-less.
  // Creating the memo here makes all camera reads happen under this owner.
  const bucketProbabilityInv = createMemo(() => {
    const size = canvasSize()
    const height = size.height
    const unitSquareArea = (height ** 2 * camera.zoom() ** 2) / 4
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

  props.setCurrentQuality?.(
    () => 1 - sqrt(bucketProbabilityInv() / accumulatedPointCount()),
  )
  props.setQualityPointCountLimit?.(qualityPointCountLimit)

  const pointRandomSeeds = root
    .createBuffer(arrayOf(vec2u, props.pointCountPerBatch))
    .$usage('storage')

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
      gamma: 2.2,
      highlightPower: 0.5,
      outputAlpha: 0,
      paletteMode: 0,
    })
    .$usage('uniform')

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
      props.adaptiveFilterEnabled
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
    const storedQuality =
      animatedFlame().renderSettings.densityEstimationQuality ?? 5
    const qualityK =
      storedQuality > 1 ? storedQuality : 0.5 + (1 - storedQuality) * 19.5
    const estimatorCurve = animatedFlame().renderSettings.estimatorCurve ?? 0.5
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
      (props.isExportRenderer ?? false) &&
      (animationExportRunning() || exportQuality() !== undefined),
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
      colorInitMode: flame.renderSettings.colorInitMode,
      pointInitMode: flame.renderSettings.pointInitMode,
      skipIters: Math.floor(flame.renderSettings.skipIters),
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
      gamma: rs.gamma,
      highlightPower: rs.highlightPower,
      skipIters: rs.skipIters,
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
    // Read currentFrame in the reactive scope so scrubbing triggers re-run.
    const _frame = timeline?.currentFrame() ?? 0
    const isActive = timeline?.isPlaying() || timeline?.isScrubbing()
    if (timeline && enabled && hasTracks > 0 && isActive) {
      applyTimelineToFlame(timeline, flame)
    }
    setAnimatedFlame(flame)
  })

  /**
   * Timeline animation playback loop.
   * When isPlaying is true, advances the frame at the configured FPS rate.
   */
  createEffect(() => {
    if (!timeline || !timeline.isPlaying()) {
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
      (colorGradingMs + Number(props.adaptiveFilterEnabled) * adaptiveFilterMs)

    // Use Math.round instead of floor to prevent the dead-zone where budget/ifsMs < 2
    // would permanently trap the scaler at 1 iteration.
    return clamp(Math.round((frameBudgetMs - paintTimeMs) / safeIfsMs), 1, 1000)
  }

  // Main render loop — follows the main branch pattern with plain `let` variables
  // inside an outer effect, using rafLoop.redraw() for reactive triggers.
  createEffect(() => {
    const fingerprint = parameterFingerprint()
    const o = outputTextures()
    if (!o || !fingerprint) {
      return undefined
    }

    const { textureSize, accumulationBuffer } = o
    const flame = untrack(animatedFlame)
    const typedAccumulationBuffer = accumulationBuffer

    const ifsPipeline = createIFSPipeline(
      root,
      camera,
      Math.floor(flame.renderSettings.skipIters),
      pointRandomSeeds,
      flame.transforms,
      textureSize,
      typedAccumulationBuffer,
      flame.renderSettings.colorInitMode,
      flame.renderSettings.pointInitMode,
      props.blendFlame?.transforms,
    )

    let batchIndex = 0
    let accumulatedPointCount_ = 0
    let lastExportRenderedPointCount = -1
    let forceDrawToScreen = false
    let clearRequested = true
    // Interactive estimator state: last iteration count, used to cap growth.
    let lastInteractiveIterationCount = 1
    // Export driver state: chunk size adapted from measured chunk wall time,
    // and the wall-clock time of the last canvas present.
    let exportIterationCount = EXPORT_INITIAL_ITERATIONS
    let lastPresentMs = 0
    let lastCountSignalMs = 0
    // Wakes the export driver when reactive work arrives (next frame's
    // descriptor, forced redraw). Keeps the idle wait event-driven: timers are
    // clamped to 1Hz by Chrome in hidden or occluded windows, signals are not.
    let notifyExportWork: (() => void) | undefined

    function requestRedraw() {
      rafLoop.redraw()
      notifyExportWork?.()
    }

    // Update IFS pipeline uniforms when animatedFlame changes.
    createEffect(() => {
      const flame = animatedFlame()

      ifsPipeline.update(
        flame as FlameDescriptor,
        props.blendFlame,
        props.blendWeight,
      )
    })

    const accumulationFingerprint = createMemo(() => {
      const flame = animatedFlame()
      const bf = props.blendFlame
      return JSON.stringify({
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

    // Reset accumulation on animation frame change during playback or
    // scrubbing. Without this, IFS points from different frames accumulate
    // together. Deliberately NOT during export: the export drives flame state
    // itself, and a playhead-follow UI moving currentFrame mid-frame would
    // throw away accumulation work.
    createEffect(() => {
      if (!timeline) return
      timeline.currentFrame()
      if (timeline.isPlaying() || timeline.isScrubbing()) {
        resetAccumulation()
      }
    })

    // Reset accumulation on camera pan/zoom — also during export: camera
    // keyframes change the projection of accumulated points, so every export
    // frame with camera motion must re-accumulate. Frames where the camera
    // (and transforms) are unchanged still skip the reset and reuse the
    // existing accumulation, which is correct for grading-only changes.
    createEffect(() => {
      camera.update()
      resetAccumulation()
    })

    function resetAccumulation() {
      batchIndex = 0
      accumulatedPointCount_ = 0
      lastExportRenderedPointCount = -1
      // Only update the global counter from the main renderer, not preview instances.
      // Preview Flam3 instances provide onAccumulatedPointCount and must not clobber
      // the global signal (which drives the progress bar and quality pills).
      if (!props.onAccumulatedPointCount) {
        setAccumulatedPointCountGlobal(0)
      }
      clearRequested = true
      requestRedraw()
    }

    // Update color grading uniforms.
    createEffect(() => {
      colorGradingUniforms.writePartial({
        exposure: 2 * Math.exp(animatedFlame().renderSettings.exposure),
        edgeFadeColor: props.onExportImage ? vec4f(0) : props.edgeFadeColor,
        backgroundColor: vec4f(backgroundColorFinal(), 1),
        vibrancy: animatedFlame().renderSettings.vibrancy,
        palettePhase: animatedFlame().renderSettings.palettePhase,
        paletteSpeed: animatedFlame().renderSettings.paletteSpeed,
        paletteEntryCount: props.palette?.()?.entries.length ?? 0,
        contrast: animatedFlame().renderSettings.contrast ?? 1,
        gamma: animatedFlame().renderSettings.gamma ?? 2.2,
        highlightPower: animatedFlame().renderSettings.highlightPower ?? 0.5,
        outputAlpha: props.outputAlpha ? 1 : 0,
        paletteMode: animatedFlame().renderSettings.paletteMode ?? 0,
      })
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
    function renderTick(frameId: number): RenderTickResult {
      const currentExportCb = props.onExportImage
      const exportMode = exportDriverActive()

      const pointCountPerBatch = props.pointCountPerBatch
      const colorGradingPipeline_ = colorGradingPipeline()
      if (colorGradingPipeline_ === undefined) {
        return { iterations: 0, presented: false, hadWork: false }
      }

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
          iterationCount = Math.min(
            estimated,
            Math.max(4, Math.ceil(lastInteractiveIterationCount * 1.5)),
          )
          lastInteractiveIterationCount = iterationCount
        } else {
          iterationCount = 1
        }
      }

      const accumulatedAfter =
        accumulatedPointCount_ + pointCountPerBatch * iterationCount

      // Export readiness is decided with the post-accumulation count so the
      // final color-graded render and the capture happen in the same
      // submission — the captured canvas can never lag the accumulation.
      const isExportReady =
        currentExportCb !== undefined && !continueRendering(accumulatedAfter)

      const shouldRenderFinalImage =
        forceDrawToScreen ||
        (isExportReady
          ? accumulatedAfter !== lastExportRenderedPointCount
          : periodicPresentDue)

      const hadWork =
        clearRequested || iterationCount > 0 || shouldRenderFinalImage

      if (!hadWork) {
        // Nothing to submit — still report state so export capture, progress
        // and cancellation keep flowing while the export driver idles.
        currentExportCb?.(canvas, {
          finalImageReady:
            isExportReady &&
            lastExportRenderedPointCount === accumulatedPointCount_,
        })
        return { iterations: 0, presented: false, hadWork: false }
      }

      const encoder = device.createCommandEncoder()

      if (clearRequested) {
        clearRequested = false
        encoder.clearBuffer(accumulationBuffer.buffer)
      }

      if (timings) {
        setRenderTimings({
          ...timings,
          adaptiveFilterMs: props.adaptiveFilterEnabled
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
        for (let i = 0; i < iterationCount; i++) {
          ifsPipeline.run(pass, pointCountPerBatch)
        }
        pass.end()

        accumulatedPointCount_ = accumulatedAfter
      }

      if (!props.onAccumulatedPointCount) {
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

      if (shouldRenderFinalImage) {
        if (isExportReady) {
          lastExportRenderedPointCount = accumulatedPointCount_
        }
        lastPresentMs = performance.now()
        const skipItersFactor =
          1 + animatedFlame().renderSettings.skipIters * 0.05
        colorGradingUniforms.writePartial({
          averagePointCountPerBucketInv:
            (bucketProbabilityInv() / accumulatedPointCount_) * skipItersFactor,
        })
        if (props.adaptiveFilterEnabled) {
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
                view: context.getCurrentTexture().createView(),
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

      if (currentExportCb) {
        currentExportCb(canvas, {
          finalImageReady:
            isExportReady &&
            lastExportRenderedPointCount === accumulatedPointCount_,
        })
      }

      device.queue
        .onSubmittedWorkDone()
        .then(() => timestampQuery.read(frameId))
        .catch(() => {})

      batchIndex += 1
      forceDrawToScreen = false
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
      () => device.queue.onSubmittedWorkDone(),
      exportDriverActive,
    )

    // Export driver: replaces the rAF loop while an export runs. The loop
    // awaits each submission, so at most one chunk is in flight — the browser
    // compositor never sees a deep GPU queue (no rAF collapse in Chrome), the
    // export keeps running in background tabs, and chunk wall time is a valid
    // measurement to size the next chunk with.
    createEffect(() => {
      if (!exportDriverActive()) return

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
            await device.queue.onSubmittedWorkDone()
          } catch {
            // Device lost — stop driving; the app-level handler takes over.
            break
          }

          const tickMs = performance.now() - startMs
          windowPoints += tick.iterations * props.pointCountPerBatch
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
