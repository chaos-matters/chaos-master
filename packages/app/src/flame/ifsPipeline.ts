import { onCleanup } from 'solid-js'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, u32, vec2f, vec2i, vec2u, } from 'typegpu/data'
import { add, arrayLength, atomicAdd, mul } from 'typegpu/std'
import { camera2DWorldToClip } from '@/lib/Camera2D'
import { hash, random, randomState, setSeed } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { vramLog } from '@/utils/vramLog'
import { AffineParams, transformAffine } from './affineTranform'
import { colorInitModeToImplFn } from './colorInitMode'
import { pointInitModeToImplFn } from './pointInitMode'
import { createFlameWgsl, extractFlameUniforms } from './transformFunction'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER, Point } from './types'
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import type { Vec2u, WgslArray } from 'typegpu/data'
import type { ColorInitMode } from './colorInitMode'
import type { PointInitMode } from './pointInitMode'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { Bucket } from './types'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 64

const pipelineCache = new Map<
  string,
  {
    FlameUniforms: ReturnType<typeof struct>
    bindGroupLayout: ReturnType<typeof tgpu.bindGroupLayout>
    ifsCompute: ReturnType<ReturnType<typeof tgpu.computeFn>>
  }
>()

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec2u>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof Bucket>> & StorageFlag,
  colorInitType: ColorInitMode = 'colorInitZero',
  pointInitType: PointInitMode = 'pointInitUnitDisk',
) {
  let globId = 'IFS-PIP-'
  const sig = JSON.stringify({
    insideShaderCount,
    colorInitType,
    pointInitType,
    transforms: recordEntries(transforms).map(([_, tr]) => ({
      ...tr,
      variations: recordEntries(tr.variations).map(([vid, v]) => ({
        vid,
        type: v.type,
      })),
    })),
  })

  let cached = pipelineCache.get(sig)
  if (!cached) {
    const flames = Object.fromEntries(
      recordEntries(transforms).map(([tid, tr]) => {
        globId += tid
        return [tid, createFlameWgsl(tr)]
      }),
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
        storage: arrayOf(vec2u),
        access: 'mutable',
      },
      flameUniforms: {
        storage: FlameUniforms,
        access: 'readonly',
      },
      outputTextureDimension: {
        uniform: vec2i,
      },
      finalTransform: {
        uniform: AffineParams,
      },
      accumulationBuffer: {
        storage: arrayOf(AtomicBucket),
        access: 'mutable',
      },
    })

    const colorInitMode = colorInitModeToImplFn[colorInitType]
    const pointInitMode = pointInitModeToImplFn[pointInitType]

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
      const seed = add(pointSeed, hash(pointIndex))
      setSeed(seed)

      let point = Point()
      point.position = pointInitMode(pointIndex)
      point.color = colorInitMode(point.position)

      for (let i = 0; i < insideShaderCount; i += 1) {
        point = executeRandomFlame(point)
      }

      point.position = transformAffine(bindGroupLayout.$.finalTransform, point.position)

      const clip = camera2DWorldToClip(point.position)
      const outputTextureDimensionF = vec2f(outputTextureDimension)
      const screen = mul(
        outputTextureDimensionF,
        add(mul(clip, vec2f(0.5, -0.5)), 0.5),
      )

      bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(randomState.$)

      // antialiasing jitter
      const jittered = add(screen, pointInitMode(pointIndex))
      if (
        // important to check the real coordinates and not integer,
        // because negative values > -1 end up on-screen causing
        // a double-counting on the first row/column
        jittered.x < 0 ||
        jittered.y < 0 ||
        jittered.x > outputTextureDimensionF.x ||
        // TODO: skipping this causes weird white dots artifacts for some variations (probs infinite
        // values get mapped to the clip space somehow)
        jittered.y > outputTextureDimensionF.y
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

    cached = { FlameUniforms, bindGroupLayout, ifsCompute }
    pipelineCache.set(sig, cached)
  }

  const { FlameUniforms, bindGroupLayout, ifsCompute } = cached

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')
  const outputTextureDimensionBuffer = root
    .createBuffer(vec2i, vec2i(...outputTextureDimension))
    .$usage('uniform')
  const finalTransformBuffer = root
    .createBuffer(AffineParams, { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 })
    .$usage('uniform')
  vramLog('[ifsPipeline] Created flameUniforms, finalTransform & dimension buffers')

  onCleanup(() => {
    vramLog('[ifsPipeline] Destroying flameUniforms, finalTransform & dimension buffers')
    flameUniformsBuffer.destroy()
    outputTextureDimensionBuffer.destroy()
    finalTransformBuffer.destroy()
  })

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    pointRandomSeeds,
    flameUniforms: flameUniformsBuffer,
    outputTextureDimension: outputTextureDimensionBuffer,
    finalTransform: finalTransformBuffer,
    accumulationBuffer,
  })

  const ifsPipeline = root
    .createComputePipeline({ compute: ifsCompute })
    .with(camera.bindGroup)
    .with(bindGroup)

  ifsPipeline.$name(globId)
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
      finalTransformBuffer.write(
        flameDescriptor.finalTransform ?? {
          a: 1,
          b: 0,
          c: 0,
          d: 0,
          e: 1,
          f: 0,
        },
      )
    },
  }
}
