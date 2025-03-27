import { hash, random, randomState, setSeed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import tgpu, { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu'
import {
  arrayOf,
  struct,
  Vec4u,
  vec4u,
  WgslArray,
  WgslStruct,
} from 'typegpu/data'
import { AffineParams, Point, transformAffine } from './variations/types'
import {
  createFlameWgsl,
  extractFlameUniforms,
  FlameFunction,
} from './flameFunction'
import { range } from '@/utils/range'

const { ceil } = Math
const IFS_GROUP_SIZE = 16

export const ComputeUniforms = struct({
  seed: vec4u,
})

export function createIFSPipeline(
  root: TgpuRoot,
  insideShaderCount: number,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  computeUniforms: TgpuBuffer<WgslStruct<{ seed: Vec4u }>> & UniformFlag,
  flameFunctions: FlameFunction[],
) {
  const { device } = root

  const flames = flameFunctions.map(createFlameWgsl)
  const flamesObj = Object.fromEntries(
    flames.map((f, i) => [`flame${i}`, f.fnImpl]),
  )

  const FlameUniforms = struct(
    Object.fromEntries(flames.map((f, i) => [`flame${i}`, f.Uniforms])),
  )

  const bindGroupLayout = tgpu.bindGroupLayout({
    points: {
      storage: (length: number) => arrayOf(Point, length),
      access: 'mutable',
    },
    computeUniforms: {
      uniform: ComputeUniforms,
    },
    flameUniforms: {
      storage: FlameUniforms,
      access: 'readonly',
    },
  })

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    computeUniforms,
    flameUniforms: flameUniformsBuffer,
  })

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      ...flamesObj,
      Point,
      hash,
      setSeed,
      random,
      randomState,
      AffineParams,
      transformAffine,
    }}

    const ITER_COUNT = ${insideShaderCount};

    @compute @workgroup_size(${IFS_GROUP_SIZE}, 1, 1) fn cs(
      @builtin(num_workgroups) numWorkgroups: vec3<u32>,
      @builtin(workgroup_id) workgroupId : vec3<u32>,
      @builtin(local_invocation_index) localInvocationIndex: u32
    ) {
      let workgroupIndex =
        workgroupId.x +
        workgroupId.y * numWorkgroups.x +
        workgroupId.z * numWorkgroups.x * numWorkgroups.y;

      let pointIndex = workgroupIndex * ${IFS_GROUP_SIZE} + localInvocationIndex;

      var point = points[pointIndex];

      var seed = (computeUniforms.seed ^ point.seed) + hash(1234 * pointIndex + point.seed.x);
      setSeed(seed);

      for (var i = 0; i < ITER_COUNT; i += 1) {
        let flameIndex = random();
        var probabilitySum = 0.;
        ${range(flameFunctions.length)
          .map(
            (i) => /* wgsl */ `
            probabilitySum += flameUniforms.flame${i}.probability;
            if (flameIndex < probabilitySum) {
              point = flame${i}(point, flameUniforms.flame${i});
              continue;
            }
          `,
          )
          .join('\n')}
      }

      point.seed = randomState;
      points[pointIndex] = point;
    }
  `

  const ifsModule = device.createShaderModule({
    code: ifsShaderCode,
  })

  const ifsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    compute: {
      module: ifsModule,
    },
  })

  return {
    run: (pass: GPUComputePassEncoder, pointCount: number) => {
      pass.setPipeline(ifsPipeline)
      pass.setBindGroup(0, root.unwrap(bindGroup))
      pass.dispatchWorkgroups(
        ceil(pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE)),
        IFS_GROUP_SIZE,
        1,
      )
    },
    update: (flameFunctions: FlameFunction[]) => {
      flameUniformsBuffer.write(extractFlameUniforms(flameFunctions))
    },
  }
}
