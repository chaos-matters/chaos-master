import { createEffect, createMemo, createSignal, onCleanup, untrack } from 'solid-js'
import { arrayOf, vec2u, vec3f, vec4f } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { useTimeline } from '@/contexts/TimelineContext'
import { DEBUG_MODE } from '@/defaults'
import { accumulatedPointCount, animationExportRunning, setAccumulatedPointCountGlobal, setRenderTimings, } from '@/flame/renderStats'
import { createTimestampQuery } from '@/utils/createTimestampQuery'
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

const { sqrt, floor } = Math

const OUTPUT_EVERY_FRAME_BATCH_INDEX = 20
const OUTPUT_INTERVAL_BATCH_INDEX = 10

type Flam3Props = {
  quality: number
  pointCountPerBatch: number
  renderInterval: number
  adaptiveFilterEnabled: boolean
  animationEnabled: boolean
  flameDescriptor: FlameDescriptor
  edgeFadeColor: v4f
  onExportImage?: ExportImageType
  setCurrentQuality?: (fn: () => number) => void
  setQualityPointCountLimit?: (fn: () => number) => void
  palette?: () => Palette | undefined
  outputAlpha?: boolean
  onAccumulatedPointCount?: (count: number) => void
}

export function Flam3(props: Flam3Props) {
  const exportedImages = new WeakSet<ExportImageType>()
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, canvas, canvasFormat } = useCanvas()
  const timeline = useTimeline()

  const [animatedFlame, setAnimatedFlame] =
    createSignal<TimelineFlameDescriptor>(
      JSON.parse(JSON.stringify(props.flameDescriptor)),
    )

  const backgroundColorFinal = () => {
    if (props.flameDescriptor.renderSettings.backgroundColor === undefined) {
      return props.flameDescriptor.renderSettings.drawMode === 'light'
        ? vec3f(...backgroundColorDefault)
        : vec3f(...backgroundColorDefaultWhite)
    }
    return vec3f(...props.flameDescriptor.renderSettings.backgroundColor)
  }

  const bucketProbabilityInv = () => {
    const size = canvasSize()
    const height = size.height
    const unitSquareArea = (height ** 2 * camera.zoom() ** 2) / 4
    return unitSquareArea
  }

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
      accumulationBuffer.destroy()
      postprocessBuffer.destroy()
      filterParamsBuffer.destroy()
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
      animatedFlame().renderSettings.paletteMode ?? 0,
    )
  })

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
    // Map 0-1 quality slider (1=best) to qualityK (0.5=best, 20=worst).
    // Values > 1 are old-format direct qualityK for backward compatibility.
    const qualityK =
      storedQuality > 1 ? storedQuality : 0.5 + (1 - storedQuality) * 19.5
    const densityPipeline = createDensityEstimationPipeline(
      root,
      textureSize,
      accumulationBuffer,
      filterParamsBuffer,
      qualityK,
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
    }
  })

  const continueRendering = (accumulatedPointCount: number) => {
    return accumulatedPointCount <= qualityPointCountLimit()
  }

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
    return JSON.stringify({
      transforms: flame.transforms,
      colorInitMode: flame.renderSettings.colorInitMode,
      pointInitMode: flame.renderSettings.pointInitMode,
      skipIters: flame.renderSettings.skipIters,
    })
  })

  // Clone flame descriptor and apply timeline keyframes.
  // Explicitly read renderSettings and transforms sub-properties so SolidJS
  // tracks them reliably. JSON.stringify on a store proxy may miss deep paths.
  let cloneRunCount = 0
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
    const flame = JSON.parse(JSON.stringify(props.flameDescriptor))
    const enabled = props.animationEnabled
    const hasTracks = timeline ? timeline.tracks().length : 0
    // Read currentFrame in the reactive scope so scrubbing triggers re-run.
    const frame = timeline?.currentFrame() ?? 0
    if (timeline && enabled && hasTracks > 0) {
      applyTimelineToFlame(timeline, flame)
      cloneRunCount++
      if (cloneRunCount <= 3 || cloneRunCount % 90 === 0) {
        if (DEBUG_MODE) {
          console.info(
            `[flam3-clone] run #${cloneRunCount}`,
            `frame=${frame}`,
            `tracks=${hasTracks}`,
            `enabled=${enabled}`,
            `exposure=${_rs.exposure}`,
          )
        }
      }
    } else {
      cloneRunCount++
      if (cloneRunCount <= 3) {
        if (DEBUG_MODE) {
          console.info(
            `[flam3-clone] run #${cloneRunCount}`,
            '(no timeline apply)',
            `enabled=${enabled}`,
            `hasTracks=${hasTracks}`,
            `exposure=${_rs.exposure}`,
          )
        }
      }
    }
    setAnimatedFlame(flame)
  })

  /**
   * Timeline animation playback loop.
   * When isPlaying is true, advances the frame at the configured FPS rate.
   */
  createEffect(() => {
    if (!timeline || !timeline.isPlaying()) {
      if (DEBUG_MODE) {
        console.info('[flam3-playback] stopped (isPlaying=false)')
      }
      return
    }

    const cfg = timeline.config()
    const intervalMs = 1000 / cfg.fps
    if (DEBUG_MODE) {
      console.info(
        `[flam3-playback] starting interval: fps=${cfg.fps} intervalMs=${
          intervalMs
        } tracks=${timeline.tracks().length}`,
      )
    }
    const intervalId = window.setInterval(() => {
      for (let i = 0; i < cfg.timeScale; i++) {
        timeline.advanceFrame()
      }
    }, intervalMs)

    onCleanup(() => {
      clearInterval(intervalId)
    })
  })

  function estimateIterationCount(
    timings: NonNullable<ReturnType<typeof timestampQuery.average>>,
    shouldRenderFinalImage: boolean,
  ) {
    const { ifsMs, adaptiveFilterMs, colorGradingMs } = timings
    if (ifsMs <= 0) {
      return 1
    }
    const frameBudgetMs = 14
    const paintTimeMs =
      Number(shouldRenderFinalImage) *
      (colorGradingMs + Number(props.adaptiveFilterEnabled) * adaptiveFilterMs)
    return clamp(floor((frameBudgetMs - paintTimeMs) / ifsMs), 1, 100)
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
      flame.transforms as never,
      textureSize,
      typedAccumulationBuffer,
      flame.renderSettings.colorInitMode,
      flame.renderSettings.pointInitMode,
    )

    let batchIndex = 0
    let accumulatedPointCount_ = 0
    let forceDrawToScreen = false
    let clearRequested = true

    // Update IFS pipeline uniforms when animatedFlame changes.
    createEffect(() => {
      const flame = animatedFlame()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ifsPipeline.update(flame as any)
    })

    // Reset accumulation on structural parameter changes.
    createEffect(() => {
      parameterFingerprint()
      if (!animationExportRunning()) resetAccumulation()
    })

    // Reset accumulation on animation frame change during playback or scrubbing.
    // Without this, IFS points from different frames accumulate together.
    createEffect(() => {
      if (
        !timeline ||
        (!timeline.isPlaying() && !timeline.isScrubbing()) ||
        animationExportRunning()
      )
        return
      timeline.currentFrame()
      resetAccumulation()
    })

    // Reset accumulation on camera pan/zoom.
    createEffect(() => {
      camera.update()
      if (!animationExportRunning()) resetAccumulation()
    })

    function resetAccumulation() {
      batchIndex = 0
      accumulatedPointCount_ = 0
      clearRequested = true
      rafLoop.redraw()
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
      })
      rafLoop.redraw()
      forceDrawToScreen = true
    })

    // Redraw when color grading pipeline or palette changes.
    createEffect(() => {
      const _ = colorGradingPipeline()
      void props.palette?.()
      rafLoop.redraw()
      forceDrawToScreen = true
    })

    const rafLoop = createAnimationFrame(
      (frameId) => {
        const currentExportCb =
          props.onExportImage && !exportedImages.has(props.onExportImage)
            ? props.onExportImage
            : undefined

        const shouldRenderFinalImage =
          forceDrawToScreen ||
          batchIndex < OUTPUT_EVERY_FRAME_BATCH_INDEX ||
          batchIndex % OUTPUT_INTERVAL_BATCH_INDEX === 0 ||
          currentExportCb !== undefined

        const pointCountPerBatch = props.pointCountPerBatch
        const colorGradingPipeline_ = colorGradingPipeline()
        if (colorGradingPipeline_ === undefined) {
          return
        }

        const encoder = device.createCommandEncoder()

        if (clearRequested) {
          clearRequested = false
          encoder.clearBuffer(accumulationBuffer.buffer)
        }

        const timings = timestampQuery.average()
        const iterationCount = continueRendering(accumulatedPointCount_)
          ? timings
            ? estimateIterationCount(timings, shouldRenderFinalImage)
            : 1
          : 0

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
          for (let i = 0; i < iterationCount; i++) {
            const pass = encoder.beginComputePass({
              timestampWrites: timestampWrites.ifsMs,
            })
            ifsPipeline.run(pass, pointCountPerBatch)
            pass.end()
          }

          accumulatedPointCount_ += pointCountPerBatch * iterationCount
        }

        setAccumulatedPointCountGlobal(accumulatedPointCount_)
        props.onAccumulatedPointCount?.(accumulatedPointCount_)

        if (shouldRenderFinalImage) {
          const skipItersFactor =
            1 + animatedFlame().renderSettings.skipIters * 0.05
          colorGradingUniforms.writePartial({
            averagePointCountPerBucketInv:
              (bucketProbabilityInv() / accumulatedPointCount_) *
              skipItersFactor,
          })
          if (props.adaptiveFilterEnabled) {
            const pass = encoder.beginComputePass({
              timestampWrites: timestampWrites.adaptiveFilterMs,
            })
            runAdaptiveFilter()?.run(pass)
            pass.end()
          }

          {
            const pass = encoder.beginRenderPass({
              timestampWrites: timestampWrites.colorGradingMs,
              colorAttachments: [
                {
                  loadOp: 'clear',
                  storeOp: 'store',
                  view: context.getCurrentTexture().createView(),
                },
              ],
            })
            colorGradingPipeline_.run(pass)
            pass.end()
          }
        }

        timestampQuery.write(encoder)
        device.queue.submit([encoder.finish()])

        if (currentExportCb) {
          exportedImages.add(currentExportCb)
          currentExportCb(canvas)
        }

        device.queue
          .onSubmittedWorkDone()
          .then(() => timestampQuery.read(frameId))
          .catch(() => {})

        batchIndex += 1
        forceDrawToScreen = false
      },
      () =>
        continueRendering(accumulatedPointCount_)
          ? props.renderInterval
          : Infinity,
      () => device.queue.onSubmittedWorkDone(),
    )

    // When quality changes (up or down), force a redraw so the interval function
    // re-evaluates continueRendering() with the updated point limit. Without this,
    // quality downgrades may not immediately stop rendering because the RAF interval
    // callback reads props.quality outside SolidJS tracking context.
    createEffect(() => {
      const q = props.quality
      void q
      rafLoop.redraw()
    })
  })
  return null
}
