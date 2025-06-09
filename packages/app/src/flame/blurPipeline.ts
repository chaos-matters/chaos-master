import { tgpu } from 'typegpu'
import { arrayOf, vec4f } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 4

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  accumulationTextureBuffer: {
    storage: (length: number) => arrayOf(vec4f, length),
    access: 'readonly',
  },
  postprocessTexture: {
    storageTexture: 'rgba32float',
    access: 'writeonly',
  },
})

export function createBlurPipeline(
  root: TgpuRoot,
  textureSize: [number, number],
  accumulationTextureBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationTextureBuffer']
  >,
  postprocessTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['postprocessTexture']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    accumulationTextureBuffer,
    postprocessTexture,
  })

  const blurCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    @compute @workgroup_size(${GROUP_SIZE_X}, ${GROUP_SIZE_Y}, 1) fn blur(
      @builtin(global_invocation_id) global_invocation_id: vec3u
    ) {
      let dims = vec2i(textureDimensions(postprocessTexture));
      let uv = vec2i(global_invocation_id.xy);
      if (uv.x >= dims.x || uv.y >= dims.y) {
        return;
      }
      let centralTexel = accumulationTextureBuffer[uv.y * dims.x + uv.x];
      let count = centralTexel.a;
      let stdDev = 10 + sqrt(count);
      var total = centralTexel;
      var totalWeight = 1.0;
      const HALF_SIZE = 0;
      for(var j = -HALF_SIZE; j <= HALF_SIZE; j += 1) {
        for(var i = -HALF_SIZE; i <= HALF_SIZE; i += 1) {
          if (i == 0 && j == 0) { continue; }
          let shift = vec2i(i, j);
          let pixelCoord = uv + shift;
          if (pixelCoord.x < 0 || pixelCoord.y < 0 || pixelCoord.x >= dims.x || pixelCoord.y >= dims.y) {
            continue;
          }
          let texel = accumulationTextureBuffer[pixelCoord.y * dims.x + pixelCoord.x];
          let stdDiff = min(stdDev / (abs(texel.a - count) + 1), 1);
          let shiftDiff = smoothstep(3, 0, length(vec2f(shift)));
          let weight = stdDiff * shiftDiff;
          total += texel * weight;
          totalWeight += weight;
        }
      }
      textureStore(postprocessTexture, uv, total / totalWeight);
    }
  `

  const blurModule = device.createShaderModule({
    code: blurCode,
  })

  const blurPipeline = device.createComputePipeline({
    label: 'BlurPIP',
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
