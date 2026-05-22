import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, vec2i } from 'typegpu/data'
import { add, clamp, max, sqrt, sub } from 'typegpu/std'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER_INV, FilterParams, } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 8
const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  qualityK: {
    uniform: f32,
  },
  accumulationBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
  filterParamsBuffer: {
    storage: arrayOf(FilterParams),
    access: 'mutable',
  },
})

const DEFAULT_QUALITY_K = 5
const MIN_SIGMA = 0.5
const MAX_SIGMA = 12
const EPSILON = 0.001

export function createDensityEstimationPipeline(
  root: TgpuRoot,
  textureSize: readonly [number, number],
  accumulationBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationBuffer']
  >,
  filterParamsBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['filterParamsBuffer']
  >,
  qualityK = DEFAULT_QUALITY_K,
) {
  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')

  const qualityKBuffer = root.createBuffer(f32, qualityK).$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    accumulationBuffer,
    filterParamsBuffer,
    textureSize: textureSizeBuffer,
    qualityK: qualityKBuffer,
  })

  const estimate = tgpu.computeFn({
    in: { globalInvocationId: builtin.globalInvocationId },
    workgroupSize: [GROUP_SIZE_X, GROUP_SIZE_Y, 1],
  })(({ globalInvocationId }) => {
    const uv = vec2i(globalInvocationId.xy)
    const textureSize = bindGroupLayout.$.textureSize
    if (uv.x >= textureSize.x || uv.y >= textureSize.y) {
      return
    }

    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer
    const filterParamsBuffer = bindGroupLayout.$.filterParamsBuffer
    const qualityK = bindGroupLayout.$.qualityK

    let densitySum = f32(0)
    const kernelRadius = i32(1)
    let sampleCount = i32(0)

    const texelIndex = uv.y * textureSize.x + uv.x

    for (let dy = -kernelRadius; dy <= kernelRadius; dy += 1) {
      for (let dx = -kernelRadius; dx <= kernelRadius; dx += 1) {
        const nx = clamp(add(uv.x, dx), i32(0), sub(textureSize.x, i32(1)))
        const ny = clamp(add(uv.y, dy), i32(0), sub(textureSize.y, i32(1)))
        const neighborIdx = ny * textureSize.x + nx
        densitySum += max(
          f32(accumulationBuffer[neighborIdx]!.count) *
            f32(BUCKET_FIXED_POINT_MULTIPLIER_INV),
          f32(EPSILON),
        )
        sampleCount += 1
      }
    }

    const avgDensity = densitySum / f32(sampleCount)
    const sigma = clamp(
      qualityK / sqrt(avgDensity),
      f32(MIN_SIGMA),
      f32(MAX_SIGMA),
    )

    filterParamsBuffer[texelIndex]!.sigma = sigma
  })

  const pipeline = root
    .createComputePipeline({ compute: estimate })
    .with(bindGroup)

  return {
    run: (pass: GPUComputePassEncoder) => {
      const [width, height] = textureSize
      pipeline
        .with(pass)
        .dispatchWorkgroups(
          ceil(width / GROUP_SIZE_X),
          ceil(height / GROUP_SIZE_Y),
          1,
        )
    },
    setQualityK: (value: number) => {
      qualityKBuffer.write(value)
    },
  }
}
