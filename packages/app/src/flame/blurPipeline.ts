import { tgpu } from 'typegpu'
import { arrayOf, vec2i, vec4f } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 4

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: (length: number) => arrayOf(vec4f, length),
    access: 'readonly',
  },
  postprocessBuffer: {
    storage: (length: number) => arrayOf(vec4f, length),
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
  const { device } = root

  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    accumulationBuffer,
    postprocessBuffer,
    textureSize: textureSizeBuffer,
  })

  const blurCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    @compute @workgroup_size(${GROUP_SIZE_X}, ${GROUP_SIZE_Y}, 1) fn blur(
      @builtin(global_invocation_id) global_invocation_id: vec3u
    ) {
      let uv = vec2i(global_invocation_id.xy);
      if (uv.x >= textureSize.x || uv.y >= textureSize.y) {
        return;
      }
      let texelIndex = uv.y * textureSize.x + uv.x;
      let centralTexel = accumulationBuffer[texelIndex];
      let count = centralTexel.a;
      let stdDev = 10 + sqrt(count);
      var total = centralTexel;
      var totalWeight = 1.0;
      const HALF_SIZE = 2;
      for(var j = -HALF_SIZE; j <= HALF_SIZE; j += 1) {
        for(var i = -HALF_SIZE; i <= HALF_SIZE; i += 1) {
          if (i == 0 && j == 0) { continue; }
          let shift = vec2i(i, j);
          let pixelCoord = uv + shift;
          if (pixelCoord.x < 0 || pixelCoord.y < 0 || pixelCoord.x >= textureSize.x || pixelCoord.y >= textureSize.y) {
            continue;
          }
          let texel = accumulationBuffer[pixelCoord.y * textureSize.x + pixelCoord.x];
          let stdDiff = min(stdDev / (abs(texel.a - count) + 1), 1);
          let shiftDiff = smoothstep(3, 0, length(vec2f(shift)));
          let weight = stdDiff * shiftDiff;
          total += texel * weight;
          totalWeight += weight;
        }
      }
      postprocessBuffer[texelIndex] = total / totalWeight;
    }
  `

  const blurModule = device.createShaderModule({
    code: blurCode,
  })

  const blurPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: blurModule,
    },
  })

  return (pass: GPUComputePassEncoder) => {
    const [width, height] = textureSize
    pass.setPipeline(blurPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(width / GROUP_SIZE_X),
      ceil(height / GROUP_SIZE_Y),
      1,
    )
  }
}
