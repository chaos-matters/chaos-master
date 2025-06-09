import { tgpu } from 'typegpu'
import { arrayOf, vec2i } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
import {
  Bucket,
  BUCKET_FIXED_POINT_MULTIPLIER,
  BUCKET_FIXED_POINT_MULTIPLIER_INV,
} from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 16
const GROUP_SIZE_Y = 8

const { ceil } = Math

const bindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: (length: number) => arrayOf(Bucket, length),
    access: 'readonly',
  },
  postprocessBuffer: {
    storage: (length: number) => arrayOf(Bucket, length),
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
      Bucket,
    }}

    const PAD: i32 = 2;
    const GROUP_SIZE_X: i32 = ${GROUP_SIZE_X};
    const GROUP_SIZE_Y: i32 = ${GROUP_SIZE_Y};
    const TILE_WIDTH: i32 = ${GROUP_SIZE_X} + 2 * PAD;
    const TILE_HEIGHT: i32 = ${GROUP_SIZE_Y} + 2 * PAD;

    const fixed_m = ${BUCKET_FIXED_POINT_MULTIPLIER};
    const fixed_m_inv = ${BUCKET_FIXED_POINT_MULTIPLIER_INV};

    var<workgroup> tile: array<array<Bucket, TILE_WIDTH>, TILE_HEIGHT>;

    @compute @workgroup_size(GROUP_SIZE_X, GROUP_SIZE_Y, 1)
    fn blur(@builtin(local_invocation_id) local_id: vec3u,
            @builtin(global_invocation_id) global_id: vec3u,
            @builtin(workgroup_id) workgroup_id: vec3u) {

      let gid = vec2i(global_id.xy);
      let lid = vec2i(local_id.xy);

      // Workgroup origin in texel space
      let group_origin = vec2i(workgroup_id.xy) * vec2i(GROUP_SIZE_X, GROUP_SIZE_Y);

      // Load tile into shared memory
      for (var dy = lid.y; dy < TILE_HEIGHT; dy += GROUP_SIZE_Y) {
        for (var dx = lid.x; dx < TILE_WIDTH; dx += GROUP_SIZE_X) {
          let coord = group_origin + vec2i(dx - PAD, dy - PAD);
          let clamped = clamp(coord, vec2i(0), vec2i(textureSize) - vec2i(1));
          let index = clamped.y * textureSize.x + clamped.x;
          tile[dy][dx] = accumulationBuffer[index];
        }
      }

      workgroupBarrier();

      // Compute adaptive blur
      if (gid.x >= textureSize.x || gid.y >= textureSize.y) {
        return;
      }

      let localX = lid.x + PAD;
      let localY = lid.y + PAD;
      let centralTexel = tile[localY][localX];
      let count = f32(centralTexel.count);
      let stdDev = (10 + sqrt(count * fixed_m_inv)) * fixed_m;

      var totalCount = 0.0;
      var totalColorA = 0.0;
      var totalColorB = 0.0;
      var totalWeight = 0.0;

      for (var j = -PAD; j <= PAD; j++) {
        for (var i = -PAD; i <= PAD; i++) {
          let shift = vec2i(i, j);
          let texel = tile[localY + j][localX + i];
          let texelCount = f32(texel.count);
          let stdDiff = min(stdDev / (abs(texelCount - count) + 1), 1);
          let shiftDiff = smoothstep(3, 0, length(vec2f(shift)));
          let weight = stdDiff * shiftDiff;
          totalColorA += f32(texel.color.a) * weight;
          totalColorB += f32(texel.color.b) * weight;
          totalCount += texelCount * weight;
          totalWeight += weight;
        }
      }
      
      let outIndex = gid.y * textureSize.x + gid.x;
      postprocessBuffer[outIndex].count = u32(totalCount / totalWeight);
      postprocessBuffer[outIndex].color.a = i32(totalColorA / totalWeight);
      postprocessBuffer[outIndex].color.b = i32(totalColorB / totalWeight);
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
