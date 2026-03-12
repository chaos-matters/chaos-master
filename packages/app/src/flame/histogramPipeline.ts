import { tgpu } from 'typegpu'
import { arrayOf, atomic, builtin, f32, u32 } from 'typegpu/data'
import { arrayLength, atomicAdd, clamp } from 'typegpu/std'
import { ColorGradingUniforms } from './colorGrading'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER_INV } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

export const HISTOGRAM_BIN_COUNT = 256
const GROUP_SIZE = 32

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  accumulationBuffer: {
    storage: (length: number) => arrayOf(Bucket, length),
    access: 'readonly',
  },
  histogram: {
    storage: arrayOf(atomic(u32)),
    access: 'mutable',
  },
})

export function createHistogramPipeline(
  root: TgpuRoot,
  textureSize: [number, number],
  uniforms: LayoutEntryToInput<(typeof bindGroupLayout)['entries']['uniforms']>,
  accumulationBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationBuffer']
  >,
  histogram: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['histogram']
  >,
) {
  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    accumulationBuffer,
    histogram,
  })

  const compute = tgpu.computeFn({
    workgroupSize: [GROUP_SIZE, 1, 1],
    in: {
      numWorkgroups: builtin.numWorkgroups,
      workgroupId: builtin.workgroupId,
      localInvocationIndex: builtin.localInvocationIndex,
    },
  })(({ numWorkgroups, workgroupId, localInvocationIndex }) => {
    const uniforms = bindGroupLayout.$.uniforms
    const workgroupIndex =
      workgroupId.x +
      workgroupId.y * numWorkgroups.x +
      workgroupId.z * numWorkgroups.x * numWorkgroups.y

    const threadIndex = workgroupIndex * GROUP_SIZE + localInvocationIndex

    if (threadIndex >= arrayLength(bindGroupLayout.$.accumulationBuffer)) {
      return
    }
    const texel = bindGroupLayout.$.accumulationBuffer[threadIndex]!
    const count = f32(texel.count) * BUCKET_FIXED_POINT_MULTIPLIER_INV
    const adjustedCount = count * uniforms.averagePointCountPerBucketInv
    const binCount = arrayLength(bindGroupLayout.$.histogram)
    const bin = clamp(u32(adjustedCount * 200), 0, binCount)
    atomicAdd(bindGroupLayout.$.histogram[bin]!, 1)
  })

  const pipeline = root.createComputePipeline({ compute }).with(bindGroup)

  return (pass: GPUComputePassEncoder) => {
    const [width, height] = textureSize
    pipeline
      .with(pass)
      .dispatchWorkgroups(
        ceil((width * height) / (GROUP_SIZE * GROUP_SIZE)),
        GROUP_SIZE,
        1,
      )
  }
}
