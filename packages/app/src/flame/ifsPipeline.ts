import { tgpu } from 'typegpu'
import { arrayOf, struct, vec2i, vec4u } from 'typegpu/data'
import {
  hash,
  random,
  randomState,
  randomUnitDisk,
  randomUnitSquare,
  setSeed,
} from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { wgsl } from '@/utils/wgsl'
import { PI } from './constants'
import { createFlameWgsl, extractFlameUniforms } from './transformFunction'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER, Point } from './types'
import { AffineParams, transformAffine } from './variations/types'
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import type { Vec4u, WgslArray } from 'typegpu/data'
import type { FlameDescriptor, TransformRecord } from './transformFunction'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 32

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec4u>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof AtomicBucket>> & StorageFlag,
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
    flameUniforms: {
      storage: FlameUniforms,
      access: 'readonly',
    },
    outputTextureDimension: {
      uniform: vec2i,
    },
    accumulationBuffer: {
      storage: (length: number) => arrayOf(AtomicBucket, length),
      access: 'mutable',
    },
  })

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')

  const outputTextureDimensionBuffer = root
    .createBuffer(vec2i, vec2i(...outputTextureDimension))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    pointRandomSeeds,
    flameUniforms: flameUniformsBuffer,
    outputTextureDimension: outputTextureDimensionBuffer,
    accumulationBuffer,
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
      randomUnitDisk,
      randomUnitSquare,
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

      if (pointIndex >= arrayLength(&pointRandomSeeds)) {
        return;
      }

      let pointSeed = pointRandomSeeds[pointIndex];
      var seed = pointSeed + hash(1234 * pointIndex + pointSeed.x);
      setSeed(seed);

      var point = Point();

      // point.position = vec2f(0.5, 0.5); //randomUnitDisk();
      // point.position = randomUnitDisk();
      point.position = randomUnitSquare();
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
      let outputTextureDimensionF = vec2f(outputTextureDimension);
      let screen = outputTextureDimensionF * (clip * vec2f(0.5, -0.5) + 0.5);

      // antialiasing jitter
      let jittered = screen+ randomUnitDisk();
      let screenI = vec2i(jittered);

      pointRandomSeeds[pointIndex] = randomState;

      if (
        // important to check the real coordinates and not integer,
        // because negative values > -1 end up on-screen causing
        // a double-counting on the first row/column
        jittered.x < 0 || jittered.y < 0 ||
        jittered.x > outputTextureDimensionF.x
        // not necessary to check y, it will just fall out of buffer
        // jittered.y > outputTextureDimensionF.y
      ) {
        return;
      }

      let pixelIndex = screenI.y * outputTextureDimension.x + screenI.x;
      const fixed_m = ${BUCKET_FIXED_POINT_MULTIPLIER};
      atomicAdd(&accumulationBuffer[pixelIndex].count, 1 * fixed_m);
      atomicAdd(&accumulationBuffer[pixelIndex].color.a, i32(point.color.x * fixed_m));
      atomicAdd(&accumulationBuffer[pixelIndex].color.b, i32(point.color.y * fixed_m));
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
