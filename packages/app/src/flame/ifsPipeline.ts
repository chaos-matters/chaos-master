import { tgpu } from 'typegpu'
import { arrayOf, struct, vec2u, vec4f, vec4u } from 'typegpu/data'
import { hash, random, randomState, setSeed } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { wgsl } from '@/utils/wgsl'
import { PI } from './constants'
import { createFlameWgsl, extractFlameUniforms } from './transformFunction'
import { AffineParams, Point, transformAffine } from './variations/types'
import type { StorageFlag, TgpuBuffer, TgpuRoot, UniformFlag } from 'typegpu'
import type { Vec4f, Vec4u, WgslArray, WgslStruct } from 'typegpu/data'
import type { FlameDescriptor, TransformRecord } from './transformFunction'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 16

export const ComputeUniforms = struct({
  seed: vec4u,
})

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec4u>> & StorageFlag,
  computeUniforms: TgpuBuffer<WgslStruct<{ seed: Vec4u }>> & UniformFlag,
  transforms: TransformRecord,
  outputTextureDimension: [number, number],
  outputTextureBuffer: TgpuBuffer<WgslArray<Vec4f>> & StorageFlag,
) {
  const { device } = root
  const flames = Object.fromEntries(
    recordEntries(transforms).map(([tid, tr]) => [tid, createFlameWgsl(tr)]),
  )

  const flamesObj = Object.fromEntries(
    recordKeys(transforms).map((tid) => [`flame${tid}`, flames[tid]!.fnImpl]),
  )
  const FlameUniforms = struct(
    Object.fromEntries(
      recordKeys(transforms).map((tid) => [
        `flame${tid}`,
        flames[tid]!.Uniforms,
      ]),
    ),
  )

  const bindGroupLayout = tgpu.bindGroupLayout({
    pointRandomSeeds: {
      storage: (length: number) => arrayOf(vec4u, length),
      access: 'mutable',
    },
    computeUniforms: {
      uniform: ComputeUniforms,
    },
    flameUniforms: {
      storage: FlameUniforms,
      access: 'readonly',
    },
    outputTextureDimension: {
      uniform: vec2u,
    },
    outputTextureBuffer: {
      storage: (length: number) => arrayOf(vec4f, length),
      access: 'mutable',
    },
  })

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')

  const outputTextureDimensionBuffer = root
    .createBuffer(vec2u, vec2u(...outputTextureDimension))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    pointRandomSeeds,
    computeUniforms,
    flameUniforms: flameUniformsBuffer,
    outputTextureDimension: outputTextureDimensionBuffer,
    outputTextureBuffer,
  })

  const ifsShaderCode = wgsl/* wgsl */ `
    ${{
      ...camera.BindGroupLayout.bound,
      ...bindGroupLayout.bound,
      ...flamesObj,
      Point,
      hash,
      setSeed,
      random,
      randomState,
      AffineParams,
      transformAffine,
      PI,
      worldToClip: camera.wgsl.worldToClip,
      clipToPixels: camera.wgsl.clipToPixels,
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

      let pointSeed = pointRandomSeeds[pointIndex];
      var seed = (computeUniforms.seed ^ pointSeed) + hash(1234 * pointIndex + pointSeed.x);
      setSeed(seed);

      var point = Point();

      // uniform disk
      let r = sqrt(random());
      let theta = random() * 2 * PI;
      point.position = r * vec2f(cos(theta), sin(theta));

      for (var i = 0; i < ITER_COUNT; i += 1) {
        let flameIndex = random();
        var probabilitySum = 0.;
        ${Object.keys(transforms)
          .map(
            (tid) => /* wgsl */ `
            probabilitySum += flameUniforms.flame${tid}.probability;
            if (flameIndex < probabilitySum) {
              point = flame${tid}(point, flameUniforms.flame${tid});
              continue;
            }
          `,
          )
          .join('\n')}
      }

      let clip = worldToClip(point.position);
      // antialiasing jitter
      let pxScale = 1 / clipToPixels(vec2f(1, 1));
      let jittered = clip + pxScale * (2 * vec2f(random(), random()) - 1);

      let screen = vec2u(vec2f(outputTextureDimension) * (jittered * vec2f(1, -1) * 0.5 + 0.5));
      if (screen.x < 0 || screen.y < 0 || screen.x >= outputTextureDimension.x || screen.y >= outputTextureDimension.y) {
        return;
      }
      let pixelIndex = screen.y * outputTextureDimension.x + screen.x;
      outputTextureBuffer[pixelIndex] += vec4f(0, point.color, 1);

      pointRandomSeeds[pointIndex] = randomState;
    }
  `

  const ifsModule = device.createShaderModule({
    code: ifsShaderCode,
  })

  const ifsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(camera.BindGroupLayout),
        root.unwrap(bindGroupLayout),
      ],
    }),
    compute: {
      module: ifsModule,
    },
  })

  return {
    run: (pass: GPUComputePassEncoder, pointCount: number) => {
      pass.setPipeline(ifsPipeline)
      pass.setBindGroup(0, root.unwrap(camera.bindGroup))
      pass.setBindGroup(1, root.unwrap(bindGroup))
      pass.dispatchWorkgroups(
        ceil(pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE)),
        IFS_GROUP_SIZE,
        1,
      )
    },
    update: (flameDescriptor: FlameDescriptor) => {
      flameUniformsBuffer.write(extractFlameUniforms(flameDescriptor))
    },
  }
}
