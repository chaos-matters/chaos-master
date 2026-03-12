import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, u32, vec2f, vec2i, vec4u, } from 'typegpu/data'
import { add, arrayLength, atomicAdd, mul } from 'typegpu/std'
import { hash, random, randomState, randomUnitDisk, setSeed, } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { colorInitModeToImplFn } from './colorInitMode'
import { createFlameWgsl, extractFlameUniforms } from './transformFunction'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER, Point } from './types'
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import type { Vec4u, WgslArray } from 'typegpu/data'
import type { ColorInitMode } from './colorInitMode'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { Bucket } from './types'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 64

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec4u>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof Bucket>> & StorageFlag,
  colorInitType: ColorInitMode = 'colorInitZero',
) {
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
      storage: arrayOf(vec4u),
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
      storage: arrayOf(AtomicBucket),
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

  const colorInitMode = colorInitModeToImplFn[colorInitType]

  const executeRandomFlame = tgpu.fn([Point], Point) /* wgsl */ `
    (point: Point) -> Point {
      let flameIndex = random();
      var probabilitySum = f32(0);
      ${recordKeys(transforms)
        .map(
          (tid) => /* wgsl */ `{
            let flameUniforms = layout.$.flameUniforms.flame${tid};
            probabilitySum += flameUniforms.probability;
            if (flameIndex < probabilitySum) {
              return flame${tid}(point, flameUniforms);
            }
          }`,
        )
        .join('\n')}
      return point;
    }
  `.$uses({ ...flamesObj, random, layout: bindGroupLayout })

  const ifsCompute = tgpu.computeFn({
    in: {
      numWorkgroups: builtin.numWorkgroups,
      workgroupId: builtin.workgroupId,
      localInvocationIndex: builtin.localInvocationIndex,
    },
    workgroupSize: [IFS_GROUP_SIZE, 1, 1],
  })(({ numWorkgroups, workgroupId, localInvocationIndex }) => {
    const outputTextureDimension = bindGroupLayout.$.outputTextureDimension
    const pointRandomSeeds = bindGroupLayout.$.pointRandomSeeds
    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer
    const workgroupIndex =
      workgroupId.x +
      workgroupId.y * numWorkgroups.x +
      workgroupId.z * numWorkgroups.x * numWorkgroups.y

    const pointIndex = workgroupIndex * IFS_GROUP_SIZE + localInvocationIndex

    if (pointIndex >= arrayLength(pointRandomSeeds)) {
      return
    }

    const pointSeed = pointRandomSeeds[pointIndex]!
    const seed = add(pointSeed, hash(1234 * pointIndex + pointSeed.x))
    setSeed(seed)

    let point = Point()
    point.position = randomUnitDisk()
    point.color = colorInitMode(point.position)

    for (let i = 0; i < insideShaderCount; i += 1) {
      point = executeRandomFlame(point)
    }

    const clip = camera.wgsl.worldToClip(point.position)
    const outputTextureDimensionF = vec2f(outputTextureDimension)
    const screen = mul(
      outputTextureDimensionF,
      add(mul(clip, vec2f(0.5, -0.5)), 0.5),
    )

    bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec4u(randomState.$)

    // antialiasing jitter
    const jittered = add(screen, randomUnitDisk())
    if (
      // important to check the real coordinates and not integer,
      // because negative values > -1 end up on-screen causing
      // a double-counting on the first row/column
      jittered.x < 0 ||
      jittered.y < 0 ||
      jittered.x > outputTextureDimensionF.x
      // not necessary to check y, it will just fall out of buffer
      // jittered.y > outputTextureDimensionF.y
    ) {
      return
    }

    const screenI = vec2i(jittered)
    const pixelIndex = screenI.y * outputTextureDimension.x + screenI.x
    const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
    atomicAdd(accumulationBuffer[pixelIndex]!.count, u32(1 * fixed_m))
    atomicAdd(
      accumulationBuffer[pixelIndex]!.color.a,
      i32(point.color.x * f32(fixed_m)),
    )
    atomicAdd(
      accumulationBuffer[pixelIndex]!.color.b,
      i32(point.color.y * f32(fixed_m)),
    )
  })

  const ifsPipeline = root
    .createComputePipeline({ compute: ifsCompute })
    .with(camera.bindGroup)
    .with(bindGroup)

  return {
    run: (pass: GPUComputePassEncoder, pointCount: number) => {
      ifsPipeline
        .with(pass)
        .dispatchWorkgroups(
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
