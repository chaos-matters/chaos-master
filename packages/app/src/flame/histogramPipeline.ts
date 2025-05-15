import { tgpu } from 'typegpu'
import { arrayOf, atomic, u32 } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
import { ColorGradingUniforms } from './colorGrading'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

export const HISTOGRAM_BIN_COUNT = 1024
const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 4

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  accumulationTexture: {
    texture: 'unfilterable-float',
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
  accumulationTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationTexture']
  >,
  histogram: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['histogram']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    accumulationTexture,
    histogram,
  })

  const moduleCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    @compute @workgroup_size(${GROUP_SIZE_X}, ${GROUP_SIZE_Y}, 1) fn run(
      @builtin(global_invocation_id) global_invocation_id: vec3u
    ) {
      let dims = vec2i(textureDimensions(accumulationTexture));
      let uv = vec2i(global_invocation_id.xy);
      if (uv.x >= dims.x || uv.y >= dims.y) {
        return;
      }
      let centralTexel = textureLoad(accumulationTexture, uv, 0);
      let count = centralTexel.a;
      let adjustedCount = count * uniforms.averagePointCountPerBucketInv;
      let binCount = arrayLength(&histogram);
      let bin = clamp(u32(adjustedCount * 2000), 0, binCount);
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
      ceil(width / GROUP_SIZE_X),
      ceil(height / GROUP_SIZE_Y),
      1,
    )
  }
}
