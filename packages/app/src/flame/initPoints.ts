import { tgpu } from 'typegpu'
import { arrayOf } from 'typegpu/data'
import { random, randomState, setSeed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import { PI } from './constants'
import { Point, VariationInfo } from './variations/types'
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import type { WgslArray } from 'typegpu/data'

const { ceil } = Math

const INIT_GROUP_SIZE = 32

const bindGroupLayout = tgpu.bindGroupLayout({
  points: {
    storage: (length: number) => arrayOf(Point, length),
    access: 'mutable',
  },
})

export function createInitPointsPipeline(
  root: TgpuRoot,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
  })

  const initPointsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      setSeed,
      randomState,
      random,
      PI,
      VariationInfo: VariationInfo,
    }}

    @compute @workgroup_size(${INIT_GROUP_SIZE}, 1, 1) fn computeSomething(
      @builtin(num_workgroups) num_workgroups: vec3<u32>,
      @builtin(workgroup_id) workgroup_id : vec3<u32>,
      @builtin(local_invocation_index) local_invocation_index: u32
    ) {
      let workgroup_index =
        workgroup_id.x +
        workgroup_id.y * num_workgroups.x +
        workgroup_id.z * num_workgroups.x * num_workgroups.y;

      let pointIndex = workgroup_index * ${INIT_GROUP_SIZE} + local_invocation_index;
      var point = points[pointIndex];
      setSeed(point.seed + pointIndex);

      // uniform disk
      let r = sqrt(random());
      let theta = random() * 2 * PI;
      point.position = r * vec2f(cos(theta), sin(theta));
      point.seed = randomState;
      point.color = vec2f(0);
      points[pointIndex] = point;
    }
  `

  const initPointsModule = device.createShaderModule({
    code: initPointsShaderCode,
  })

  const initPointsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: initPointsModule,
    },
  })

  return (pass: GPUComputePassEncoder, pointCount: number) => {
    pass.setPipeline(initPointsPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(pointCount / (INIT_GROUP_SIZE * INIT_GROUP_SIZE)),
      INIT_GROUP_SIZE,
      1,
    )
  }
}
