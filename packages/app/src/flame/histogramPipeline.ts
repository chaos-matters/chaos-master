import { tgpu } from 'typegpu'
import { arrayOf, atomic, u32 } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
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
    storage: (length: number) => arrayOf(atomic(u32), length),
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
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    accumulationBuffer,
    histogram,
  })

  const moduleCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    @compute @workgroup_size(${GROUP_SIZE}, 1, 1) fn run(
      @builtin(num_workgroups) numWorkgroups: vec3<u32>,
      @builtin(workgroup_id) workgroupId : vec3<u32>,
      @builtin(local_invocation_index) localInvocationIndex: u32
    ) {
      let workgroupIndex =
        workgroupId.x +
        workgroupId.y * numWorkgroups.x +
        workgroupId.z * numWorkgroups.x * numWorkgroups.y;

      let threadIndex = workgroupIndex * ${GROUP_SIZE} + localInvocationIndex;

      if (threadIndex >= arrayLength(&accumulationBuffer)) {
        return;
      }
      let texel = accumulationBuffer[threadIndex];
      let count = f32(texel.count) * ${BUCKET_FIXED_POINT_MULTIPLIER_INV};
      let adjustedCount = count * uniforms.averagePointCountPerBucketInv;
      let binCount = arrayLength(&histogram);
      let bin = clamp(u32(adjustedCount * 200), 0, binCount);
      atomicAdd(&histogram[bin], 1u);
    }
  `

  const module = device.createShaderModule({
    code: moduleCode,
  })

  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: module,
    },
  })

  return (pass: GPUComputePassEncoder) => {
    const [width, height] = textureSize
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil((width * height) / (GROUP_SIZE * GROUP_SIZE)),
      GROUP_SIZE,
      1,
    )
  }
}
