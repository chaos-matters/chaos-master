import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { arrayOf, vec3f, vec4f, vec4u } from 'typegpu/data'
import { clamp } from 'typegpu/std'
import { setRenderStats } from '@/flame/renderStats'
import { createTimestampQuery } from '@/utils/createTimestampQuery'
import { randomVec4u } from '@/utils/randomVec4u'
import { usePointer } from '@/utils/usePointer'
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
import { createInitPointsPipeline } from './initPoints'
import { createRenderPointsPipeline } from './renderPoints'
import { outputTextureFormat, Point } from './variations/types'
import type { v4f } from 'typegpu/data'
import type { FlameDescriptor } from './transformFunction'
import type { ExportImageType } from '@/App'

/**
 * TODO: This factor is fine tuned to look good for the default example.
 * Consider dynamically computing the correct factor to use.
 */
export const MAX_POINT_COUNT = 4e6
export const MAX_INNER_ITERS = 30

type Flam3Props = {
  quality: number
  pointCountPerBatch: number
  renderInterval: number
  onExportImage: ExportImageType | undefined
  adaptiveFilterEnabled: boolean
  flameDescriptor: FlameDescriptor
  edgeFadeColor: v4f
}

export function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, pixelRatio, canvas, canvasFormat } = useCanvas()
  const pointer = usePointer(canvas)
  const queryBuffer = root.createBuffer(vec4f, vec4f())
  const [maxPointsCount, setMaxPointsCount] = createSignal(0)

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

  function _readCountUnderPointer(frameIndex: number) {
    const o = outputTextures()
    const p = pointer()
    if (frameIndex % 10 === 0 && p && o) {
      const { accumulationTexture } = o
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor(
        clamp(
          (p.clientX - rect.x) * pixelRatio() * window.devicePixelRatio,
          0,
          accumulationTexture.props.size[0] - 1,
        ),
      )
      const y = Math.floor(
        clamp(
          (p.clientY - rect.y) * pixelRatio() * window.devicePixelRatio,
          0,
          accumulationTexture.props.size[1] - 1,
        ),
      )
      const encoder = device.createCommandEncoder()
      encoder.copyTextureToBuffer(
        {
          texture: root.unwrap(accumulationTexture),
          origin: { x, y },
        },
        queryBuffer,
        { width: 1, height: 1 },
      )
      device.queue.submit([encoder.finish()])
      queryBuffer
        .read()
        .then((value) => {
          console.info(x, y, value.w)
          console.info('Accu', frameIndex)
        })
        .catch(() => {})
    }
  }

  createEffect(() => {
    setMaxPointsCount(qualityPointCountLimit())
    setRenderStats((prev) => ({
      ...prev,
      qualityPointCountLimit: maxPointsCount(),
    }))
  })

  const points = root
    .createBuffer(arrayOf(Point, MAX_POINT_COUNT))
    .$usage('storage')

  onCleanup(() => {
    points.destroy()
  })

  const colorGradingUniforms = root
    .createBuffer(ColorGradingUniforms, {
      averagePointCountPerBucketInv: 0,
      exposure: 1,
      backgroundColor: vec4f(0, 0, 0, 0),
      edgeFadeColor: vec4f(0, 0, 0, 0.8),
    })
    .$usage('uniform')

  const outputTextures = createMemo(() => {
    const { width, height } = canvasSize()
    if (width * height === 0) {
      return
    }

    const accumulationTexture = root['~unstable']
      .createTexture({
        format: outputTextureFormat,
        size: [width, height],
      })
      .$usage('sampled', 'render')
      .$name('outputTexture')
    onCleanup(() => {
      accumulationTexture.destroy()
    })

    const postprocessTexture = root['~unstable']
      .createTexture({
        format: outputTextureFormat,
        size: [width, height],
      })
      .$usage('sampled', 'storage')
      .$name('outputTexture')
    onCleanup(() => {
      postprocessTexture.destroy()
    })

    return { accumulationTexture, postprocessTexture }
  })

  const colorGradingPipeline = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const { accumulationTexture, postprocessTexture } = o
    return createColorGradingPipeline(
      root,
      colorGradingUniforms,
      props.adaptiveFilterEnabled ? postprocessTexture : accumulationTexture,
      canvasFormat,
      drawModeToImplFn[props.flameDescriptor.renderSettings.drawMode],
    )
  })

  const computeUniforms = root
    .createBuffer(ComputeUniforms, { seed: vec4u() })
    .$usage('uniform')

  const renderPoints = createRenderPointsPipeline(root, camera, points)

  const runBlur = createMemo(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }
    const { accumulationTexture, postprocessTexture } = o
    return createBlurPipeline(
      root,
      accumulationTexture.props.size,
      accumulationTexture,
      postprocessTexture,
    )
  })

  const continueRendering = (accumulatedPointCount: number) => {
    return accumulatedPointCount <= qualityPointCountLimit()
  }

  const timestampQuery = createTimestampQuery(device, [
    'ifs',
    'renderPoints',
    'blur',
    'colorGrading',
  ])

  createEffect(() => {
    const o = outputTextures()
    if (!o) {
      return undefined
    }

    const { accumulationTexture } = o
    const outputTextureView = root.unwrap(accumulationTexture).createView()

    const runInitPoints = createInitPointsPipeline(
      root,
      points,
      computeUniforms,
    )
    const ifsPipeline = createIFSPipeline(
      root,
      props.flameDescriptor.renderSettings.skipIters,
      points,
      computeUniforms,
      props.flameDescriptor.transforms,
    )

    let accumulatedPointCount = 0
    let clearRequested = true
    createEffect(() => {
      ifsPipeline.update(props.flameDescriptor)

      // this is in a separate effect because we don't
      // want to run ifs.update if not necessary
      createEffect(() => {
        camera.update()
        accumulatedPointCount = 0
        colorGradingUniforms.writePartial({
          averagePointCountPerBucketInv: 0,
        })

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
    })

    createEffect(() => {
      // redraw when these change
      const _ = backgroundColorFinal()
      const __ = colorGradingPipeline()
      rafLoop.redraw()
    })

    const rafLoop = createAnimationFrame(
      () => {
        const pointCountPerBatch = props.pointCountPerBatch
        const colorGradingPipeline_ = colorGradingPipeline()
        if (colorGradingPipeline_ === undefined) {
          return
        }
        if (clearRequested) {
          clearRequested = false
          const encoder = device.createCommandEncoder()
          {
            const pass = encoder.beginRenderPass({
              colorAttachments: [
                {
                  view: outputTextureView,
                  loadOp: 'clear',
                  storeOp: 'store',
                  clearValue: [0, 0, 0, 0],
                },
              ],
            })
            pass.end()
          }
          device.queue.submit([encoder.finish()])
        }
        camera.update()
        computeUniforms.write({
          seed: randomVec4u(),
        })
        accumulatedPointCount += pointCountPerBatch
        colorGradingUniforms.writePartial({
          averagePointCountPerBucketInv:
            bucketProbabilityInv() / accumulatedPointCount,
        })

        // Encode commands to do the computation
        const encoder = device.createCommandEncoder()

        {
          const pass = encoder.beginComputePass({
            timestampWrites: timestampQuery.timestampWrites.ifs,
          })
          runInitPoints(pass, pointCountPerBatch)
          ifsPipeline.run(pass, pointCountPerBatch)
          pass.end()
        }

        {
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: outputTextureView,
                loadOp: 'load',
                storeOp: 'store',
              },
            ],
            timestampWrites: timestampQuery.timestampWrites.renderPoints,
          })
          renderPoints(pass, pointCountPerBatch)
          pass.end()
        }

        if (props.adaptiveFilterEnabled) {
          const pass = encoder.beginComputePass({
            timestampWrites: timestampQuery.timestampWrites.blur,
          })
          runBlur()?.(pass)
          pass.end()
        }

        {
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                loadOp: 'clear',
                storeOp: 'store',
                view: context.getCurrentTexture().createView(),
              },
            ],
            timestampWrites: timestampQuery.timestampWrites.colorGrading,
          })
          colorGradingPipeline_.run(pass)
          pass.end()
        }

        //_readCountUnderPointer(renderAccumulationIndex)

        timestampQuery.write(encoder)

        device.queue.submit([encoder.finish()])

        timestampQuery
          .read()
          .then((timing) => {
            setRenderStats((prev) => ({
              ...prev,
              accumulatedPointCount: accumulatedPointCount,
              timing: {
                ifsNs: timing.ifs,
                renderPointsNs: timing.renderPoints,
                blurNs: props.adaptiveFilterEnabled ? timing.blur : 0,
                colorGradingNs: timing.colorGrading,
              },
            }))
          })
          .catch(() => {})

        props.onExportImage?.(canvas)
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
