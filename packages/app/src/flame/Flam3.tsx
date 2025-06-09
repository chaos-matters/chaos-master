import { createEffect, createMemo, onCleanup } from 'solid-js'
import { arrayOf, vec3f, vec4f, vec4u } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import {
  accumulatedPointCount,
  setAccumulatedPointCount,
  setRenderStats,
} from '@/flame/renderStats'
import { createTimestampQuery } from '@/utils/createTimestampQuery'
import { randomVec4u } from '@/utils/randomVec4u'
import { useCamera } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useRootContext } from '../lib/RootContext'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { createBlurPipeline } from './blurPipeline'
import {
  ColorGradingUniforms,
  createColorGradingPipeline,
} from './colorGrading'
import { drawModeToImplFn } from './drawMode'
import { ComputeUniforms, createIFSPipeline } from './ifsPipeline'
import type { v4f } from 'typegpu/data'
import type { FlameDescriptor } from './transformFunction'
import type { ExportImageType } from '@/App'

const { sqrt, floor } = Math

const OUTPUT_EVERY_FRAME_BATCH_INDEX = 20
const OUTPUT_INTERVAL_BATCH_INDEX = 10

type Flam3Props = {
  quality: number
  pointCountPerBatch: number
  renderInterval: number
  onExportImage: ExportImageType | undefined
  adaptiveFilterEnabled: boolean
  flameDescriptor: FlameDescriptor
  edgeFadeColor: v4f
  setCurrentQuality?: (fn: () => number) => void
  setQualityPointCountLimit?: (fn: () => number) => void
}

export function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, canvas, canvasFormat } = useCanvas()

  const backgroundColorFinal = () => {
    if (props.flameDescriptor.renderSettings.backgroundColor === undefined) {
      return props.flameDescriptor.renderSettings.drawMode === 'light'
        ? vec3f(0)
        : vec3f(1)
    }
    return vec3f(...props.flameDescriptor.renderSettings.backgroundColor)
  }

  const bucketProbabilityInv = () => {
    const { height } = canvasSize()
    const unitSquareArea = (height ** 2 * camera.zoom() ** 2) / 4
    return unitSquareArea
  }

  const qualityPointCountLimit = () => {
    const q = props.quality
    return bucketProbabilityInv() / (q ** 2 - 2 * q + 1)
  }

  props.setCurrentQuality?.(
    () => 1 - sqrt(bucketProbabilityInv() / accumulatedPointCount()),
  )
  props.setQualityPointCountLimit?.(qualityPointCountLimit)

  const pointRandomSeeds = root
    .createBuffer(arrayOf(vec4u, props.pointCountPerBatch))
    .$usage('storage')

  onCleanup(() => {
    pointRandomSeeds.destroy()
  })

  const colorGradingUniforms = root
    .createBuffer(ColorGradingUniforms, {
      averagePointCountPerBucketInv: 0,
      exposure: 1,
      backgroundColor: vec4f(0, 0, 0, 0),
      edgeFadeColor: vec4f(0, 0, 0, 0.8),
    })
    .$usage('uniform')

  onCleanup(() => {
    colorGradingUniforms.destroy()
  })

  const outputTextures = createMemo(() => {
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const accumulationBuffer = root
      .createBuffer(arrayOf(vec4f, width * height))
      .$usage('storage')

    const postprocessBuffer = root
      .createBuffer(arrayOf(vec4f, width * height))
      .$usage('storage')

    onCleanup(() => {
      accumulationBuffer.destroy()
      postprocessBuffer.destroy()
    })

    return {
      accumulationBuffer,
      postprocessBuffer,
      textureSize: [width, height] as const,
    }
  })

  const colorGradingPipeline = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const { textureSize, postprocessBuffer, accumulationBuffer } = o
    return createColorGradingPipeline(
      root,
      colorGradingUniforms,
      textureSize,
      props.adaptiveFilterEnabled ? postprocessBuffer : accumulationBuffer,
      canvasFormat,
      drawModeToImplFn[props.flameDescriptor.renderSettings.drawMode],
    )
  })

  const computeUniforms = root
    .createBuffer(ComputeUniforms, { seed: vec4u() })
    .$usage('uniform')

  const runBlur = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const { textureSize, accumulationBuffer, postprocessBuffer } = o
    return createBlurPipeline(
      root,
      textureSize,
      accumulationBuffer,
      postprocessBuffer,
    )
  })

  const continueRendering = (accumulatedPointCount: number) => {
    return accumulatedPointCount <= qualityPointCountLimit()
  }

  const timestampQuery = createTimestampQuery(device, [
    'adaptiveFilter',
    'colorGrading',
    'ifs',
  ])

  function estimateIterationCount(
    timings: NonNullable<ReturnType<typeof timestampQuery.average>>,
    shouldRenderFinalImage: boolean,
  ) {
    const { ifs, adaptiveFilter, colorGrading } = timings
    if (ifs <= 0) {
      return 1
    }
    const frameBudgetNs = 14e6
    const paintTimeNs =
      Number(shouldRenderFinalImage) *
      (colorGrading + Number(props.adaptiveFilterEnabled) * adaptiveFilter)
    return clamp(floor((frameBudgetNs - paintTimeNs) / ifs), 1, 100)
  }

  createEffect(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }

    const { textureSize, accumulationBuffer } = o

    const ifsPipeline = createIFSPipeline(
      root,
      camera,
      props.flameDescriptor.renderSettings.skipIters,
      pointRandomSeeds,
      computeUniforms,
      props.flameDescriptor.transforms,
      textureSize,
      accumulationBuffer,
    )

    let batchIndex = 0
    let accumulatedPointCount = 0
    let forceDrawToScreen = false
    let clearRequested = true
    createEffect(() => {
      ifsPipeline.update(props.flameDescriptor)

      // this is in a separate effect because we don't
      // want to run ifs.update if not necessary
      createEffect(() => {
        camera.update()
        batchIndex = 0
        accumulatedPointCount = 0
        clearRequested = true
        rafLoop.redraw()
      })
    })

    createEffect(() => {
      colorGradingUniforms.writePartial({
        exposure: 2 * Math.exp(props.flameDescriptor.renderSettings.exposure),
        edgeFadeColor: props.onExportImage ? vec4f(0) : props.edgeFadeColor,
        backgroundColor: vec4f(backgroundColorFinal(), 1),
      })
      rafLoop.redraw()
      forceDrawToScreen = true
    })

    createEffect(() => {
      // redraw when these change
      const __ = colorGradingPipeline()
      rafLoop.redraw()
      forceDrawToScreen = true
    })

    const rafLoop = createAnimationFrame(
      (frameId) => {
        /**
         * Rendering to screen is expensive because it involves
         * blurring and color grading. We only want to do this
         * in the beginning while the image is still forming.
         * Later on, we can trade off rendering to screen for
         * convergence speed.
         */
        const shouldRenderFinalImage =
          forceDrawToScreen ||
          batchIndex < OUTPUT_EVERY_FRAME_BATCH_INDEX ||
          batchIndex % OUTPUT_INTERVAL_BATCH_INDEX === 0 ||
          props.onExportImage !== undefined

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

        computeUniforms.write({
          seed: randomVec4u(),
        })

        const timings = timestampQuery.average()
        const iterationCount = timings
          ? estimateIterationCount(timings, shouldRenderFinalImage)
          : 1

        if (timings) {
          setRenderStats(() => ({
            timing: {
              ifsNs: timings.ifs,
              blurNs: props.adaptiveFilterEnabled ? timings.adaptiveFilter : 0,
              colorGradingNs: timings.colorGrading,
            },
          }))
        }

        const timestampWrites = timestampQuery.timestampWrites(frameId)

        {
          for (let i = 0; i < iterationCount; i++) {
            const pass = encoder.beginComputePass({
              timestampWrites: timestampWrites.ifs,
            })
            ifsPipeline.run(pass, pointCountPerBatch)
            pass.end()
          }

          accumulatedPointCount += pointCountPerBatch * iterationCount
        }

        setAccumulatedPointCount(accumulatedPointCount)

        if (shouldRenderFinalImage) {
          colorGradingUniforms.writePartial({
            averagePointCountPerBucketInv:
              bucketProbabilityInv() / accumulatedPointCount,
          })
          if (props.adaptiveFilterEnabled) {
            const pass = encoder.beginComputePass({
              timestampWrites: timestampWrites.adaptiveFilter,
            })
            runBlur()?.(pass)
            pass.end()
          }

          {
            const pass = encoder.beginRenderPass({
              timestampWrites: timestampWrites.colorGrading,
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

        //_readCountUnderPointer(renderAccumulationIndex)

        timestampQuery.write(encoder)
        device.queue.submit([encoder.finish()])

        device.queue
          .onSubmittedWorkDone()
          .then(() => timestampQuery.read(frameId))
          .catch(() => {})
        props.onExportImage?.(canvas)

        batchIndex += 1
        forceDrawToScreen = false
      },
      () =>
        continueRendering(accumulatedPointCount)
          ? props.renderInterval
          : Infinity,
      () => device.queue.onSubmittedWorkDone(),
    )
  })
  return null
}
