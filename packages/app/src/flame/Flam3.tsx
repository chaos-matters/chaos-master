import { onCleanup, createEffect, createMemo } from 'solid-js'
import {
  ColorGradingUniforms,
  createColorGradingPipeline,
} from './colorGrading'
import { ComputeUniforms, createIFSPipeline } from './ifsPipeline'
import { createInitPointsPipeline } from './initPoints'
import { createRenderPointsPipeline } from './renderPoints'
import { Point, outputTextureFormat } from './variations/types'
import { useCamera } from '../lib/CameraContext'
import { useCanvas } from '../lib/CanvasContext'
import { useRootContext } from '../lib/RootContext'
import { createAnimationFrame } from '../utils/createAnimationFrame'
import { arrayOf, v3f, vec2f, vec4f, vec4u } from 'typegpu/data'
import { DrawModeFn } from './drawMode'
import { usePointer } from '@/utils/usePointer'
import { clamp } from 'typegpu/std'
import { createBlurPipeline } from './blurPipeline'
import { FlameFunction } from './flameFunction'
import { randomVec4u } from '@/utils/randomVec4u'

export const MAX_POINT_COUNT = 4e6
export const MAX_OUTER_ITERS = 15
export const MAX_INNER_ITERS = 15

type Flam3Props = {
  outerIters: number
  skipIters: number
  pointCount: number
  drawMode: DrawModeFn
  backgroundColor: v3f
  exposure: number
  adaptiveFilterEnabled: boolean
  flameFunctions: FlameFunction[]
}

export function Flam3(props: Flam3Props) {
  const camera = useCamera()
  const { root, device } = useRootContext()
  const { context, canvasSize, pixelRatio, canvas, canvasFormat } = useCanvas()
  const pointer = usePointer(canvas)
  const queryBuffer = root.createBuffer(vec4f, vec4f())

  function _readCountUnderPoiner(frameIndex: number) {
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
        })
        .catch(() => {})
    }
  }

  const factor = createMemo(
    () => (camera.zoom() * pixelRatio()) ** 2 / (props.pointCount / 1e5),
  )

  const points = root
    .createBuffer(arrayOf(Point, MAX_POINT_COUNT))
    .$usage('storage')

  onCleanup(() => {
    points.destroy()
  })

  const colorGradingUniforms = root
    .createBuffer(ColorGradingUniforms, {
      accumulatedIterationCount: 0,
      factor: 1,
      exposure: 1,
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

  const runColorGradingPipeline = createMemo(() => {
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
      props.drawMode,
    )
  })

  createEffect(() => {
    console.info('Creating everything from scratch.')
    const o = outputTextures()
    if (!o) {
      return undefined
    }

    const { accumulationTexture, postprocessTexture } = o
    const outputTextureView = root.unwrap(accumulationTexture).createView()

    const computeUniforms = root
      .createBuffer(ComputeUniforms, { seed: vec4u() })
      .$usage('uniform')

    const runInitPoints = createInitPointsPipeline(
      root,
      points,
      computeUniforms,
    )
    const runSkipIfs = createIFSPipeline(
      root,
      props.skipIters,
      points,
      computeUniforms,
      props.flameFunctions,
    )
    const runIfs = createIFSPipeline(
      root,
      1,
      points,
      computeUniforms,
      props.flameFunctions,
    )
    const renderPoints = createRenderPointsPipeline(root, camera, points)
    const runBlur = createBlurPipeline(
      root,
      accumulationTexture.props.size,
      accumulationTexture,
      postprocessTexture,
    )

    let count = 0
    createEffect(() => {
      count = 0
      const _ = props.outerIters
      camera.js.clipToWorld(vec2f())
      colorGradingUniforms.write({
        accumulatedIterationCount: 0,
        factor: factor(),
        exposure: 1,
      })

      runSkipIfs.update(props.flameFunctions)
      runIfs.update(props.flameFunctions)

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
    })

    createAnimationFrame(() => {
      camera.update()
      computeUniforms.write({
        seed: randomVec4u(),
      })
      count += props.outerIters
      colorGradingUniforms.write({
        accumulatedIterationCount: count,
        factor: factor(),
        exposure: 2 * Math.exp(props.exposure),
      })

      // Encode commands to do the computation
      const encoder = device.createCommandEncoder()
      {
        const pass = encoder.beginComputePass()
        runInitPoints(pass, props.pointCount)
        runSkipIfs.run(pass, props.pointCount)
        pass.end()
      }
      for (let i = 0; i < props.outerIters; ++i) {
        {
          const pass = encoder.beginComputePass()
          runIfs.run(pass, props.pointCount)
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
          })
          renderPoints(pass, props.pointCount)
          pass.end()
        }
      }
      if (props.adaptiveFilterEnabled) {
        const pass = encoder.beginComputePass()
        runBlur(pass)
        pass.end()
      }

      runColorGradingPipeline()?.(encoder, context, props.backgroundColor)

      // readCountUnderPoiner(count)

      device.queue.submit([encoder.finish()])
    })
  })
  return null
}
