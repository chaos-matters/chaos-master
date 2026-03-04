import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, u32, vec2f, vec2i } from 'typegpu/data'
import { abs, add, clamp, length, min, smoothstep, sqrt, sub, } from 'typegpu/std'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER, BUCKET_FIXED_POINT_MULTIPLIER_INV, } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 4

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
  postprocessBuffer: {
    storage: arrayOf(Bucket),
    access: 'mutable',
  },
})

export function createBlurPipeline(
  root: TgpuRoot,
  textureSize: readonly [number, number],
  accumulationBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationBuffer']
  >,
  postprocessBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['postprocessBuffer']
  >,
) {
  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    accumulationBuffer,
    postprocessBuffer,
    textureSize: textureSizeBuffer,
  })

  const blur = tgpu.computeFn({
    in: { globalInvocationId: builtin.globalInvocationId },
    workgroupSize: [GROUP_SIZE_X, GROUP_SIZE_Y, 1],
  })(({ globalInvocationId }) => {
    const uv = vec2i(globalInvocationId.xy)
    const textureSize = bindGroupLayout.$.textureSize
    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer
    const postprocessBuffer = bindGroupLayout.$.postprocessBuffer
    if (uv.x >= textureSize.x || uv.y >= textureSize.y) {
      return
    }

    const texelIndex = uv.y * textureSize.x + uv.x
    const centralTexel = accumulationBuffer[texelIndex]!
    const count = f32(centralTexel.count)
    const stdDev =
      (10 + sqrt(count * BUCKET_FIXED_POINT_MULTIPLIER_INV)) *
      BUCKET_FIXED_POINT_MULTIPLIER
    let totalColorA = f32(centralTexel.color.a)
    let totalColorB = f32(centralTexel.color.b)
    let totalCount = count
    let totalWeight = f32(1.0)
    const HALF_SIZE = 2
    for (let j = -HALF_SIZE; j <= HALF_SIZE; j += 1) {
      for (let i = -HALF_SIZE; i <= HALF_SIZE; i += 1) {
        if (i === 0 && j === 0) {
          continue
        }
        const shift = vec2i(i, j)
        const pixelCoord = clamp(add(uv, shift), vec2i(0), sub(textureSize, 1))
        const texel =
          accumulationBuffer[pixelCoord.y * textureSize.x + pixelCoord.x]!
        const texelCount = f32(texel.count)
        const stdDiff = min(stdDev / (abs(texelCount - count) + 1), 1)
        const shiftDiff = smoothstep(3, 0, length(vec2f(shift)))
        const weight = stdDiff * shiftDiff
        totalColorA += f32(texel.color.a) * weight
        totalColorB += f32(texel.color.b) * weight
        totalCount += texelCount * weight
        totalWeight += weight
      }
    }

    postprocessBuffer[texelIndex]!.count = u32(totalCount / totalWeight)
    postprocessBuffer[texelIndex]!.color.a = i32(totalColorA / totalWeight)
    postprocessBuffer[texelIndex]!.color.b = i32(totalColorB / totalWeight)
  })

  const blurPipeline = root.createComputePipeline({ compute: blur })

  return (pass: GPUComputePassEncoder) => {
    const [width, height] = textureSize
    pass.setPipeline(root.unwrap(blurPipeline))
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(width / GROUP_SIZE_X),
      ceil(height / GROUP_SIZE_Y),
      1,
    )
  }
}
