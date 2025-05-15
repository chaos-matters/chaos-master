import { tgpu } from 'typegpu'
import { wgsl } from '@/utils/wgsl'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 4

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  accumulationTexture: {
    texture: 'unfilterable-float',
  },
  postprocessTexture: {
    storageTexture: 'rgba32float',
    access: 'writeonly',
  },
})

export function createBlurPipeline(
  root: TgpuRoot,
  textureSize: [number, number],
  accumulationTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationTexture']
  >,
  postprocessTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['postprocessTexture']
  >,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    accumulationTexture,
    postprocessTexture,
  })

  const blurCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    @compute @workgroup_size(${GROUP_SIZE_X}, ${GROUP_SIZE_Y}, 1) fn blur(
      @builtin(global_invocation_id) global_invocation_id: vec3u
    ) {
      let dims = vec2i(textureDimensions(accumulationTexture));
      let uv = vec2i(global_invocation_id.xy);
      if (uv.x >= dims.x || uv.y >= dims.y) {
        return;
      }
      let centralTexel = textureLoad(accumulationTexture, uv, 0);
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
          if (pixelCoord.x < 0 || pixelCoord.y < 0 || pixelCoord.x >= dims.x || pixelCoord.y >= dims.y) {
            continue;
          }
          let texel = textureLoad(accumulationTexture, pixelCoord, 0);
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
