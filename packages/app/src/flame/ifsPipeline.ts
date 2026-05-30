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
  blendTransforms?: TransformRecord,
) {
  let globId = 'IFS-PIP-'
  const isBlending = blendTransforms !== undefined
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
    ...(isBlending && {
      blendTransforms: recordEntries(blendTransforms).map(([_, tr]) => ({
        ...tr,
        variations: recordEntries(tr.variations).map(([vid, v]) => ({
          vid,
          type: v.type,
        })),
      })),
    }),
  })

  let cached = pipelineCache.get(sig)
  if (!cached) {
    if (isBlending) {
      // ---- Blending code path ----
      const tidsA = recordKeys(transforms)
      const tidsB = recordKeys(blendTransforms)

      const flamesA = Object.fromEntries(
        tidsA.map((tid) => {
          globId += tid
          return [tid, createFlameWgsl(transforms[tid]!)]
        }),
      )
      const flamesB = Object.fromEntries(
        tidsB.map((tid) => {
          globId += tid
          return [tid, createFlameWgsl(blendTransforms[tid]!)]
        }),
      )

      const flamesObjA = Object.fromEntries(
        tidsA.map((tid) => [`flameA_${tid}`, flamesA[tid]!.fnImpl]),
      )
      const flamesObjB = Object.fromEntries(
        tidsB.map((tid) => [`flameB_${tid}`, flamesB[tid]!.fnImpl]),
      )

      const BlendUniforms = struct({
        ...Object.fromEntries(
          tidsA.map((tid) => [`a_${tid}`, flamesA[tid]!.Uniforms]),
        ),
        ...Object.fromEntries(
          tidsB.map((tid) => [`b_${tid}`, flamesB[tid]!.Uniforms]),
        ),
        blendWeight: f32,
      })

      const blendBindGroupLayout = tgpu.bindGroupLayout({
        pointRandomSeeds: {
          storage: arrayOf(vec2u),
          access: 'mutable',
        },
        flameUniforms: {
          storage: BlendUniforms,
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

      const executeRandomFlame = tgpu.fn([Point], Point) /* wgsl */ `
        (point: Point) -> Point {
          let uniforms = layout.$.flameUniforms;
          if (random() < uniforms.blendWeight) {
            let flameIndex = random();
            var probabilitySumA = f32(0);
            ${tidsA
              .map(
                (tid) => /* wgsl */ `{
              let flameUniforms = uniforms.a_${tid};
              probabilitySumA += flameUniforms.probability;
              if (flameIndex < probabilitySumA) {
                return flameA_${tid}(point, flameUniforms);
              }
            }`,
              )
              .join('\n')}
          } else {
            let flameIndexB = random();
            var probabilitySumB = f32(0);
            ${tidsB
              .map(
                (tid) => /* wgsl */ `{
              let flameUniformsB = uniforms.b_${tid};
              probabilitySumB += flameUniformsB.probability;
              if (flameIndexB < probabilitySumB) {
                return flameB_${tid}(point, flameUniformsB);
              }
            }`,
              )
              .join('\n')}
          }
          return point;
        }
      `.$uses({
        ...flamesObjA,
        ...flamesObjB,
        random,
        layout: blendBindGroupLayout,
      })

      const colorInitMode = colorInitModeToImplFn[colorInitType]
      const pointInitMode = pointInitModeToImplFn[pointInitType]

      const ifsCompute = tgpu.computeFn({
        in: {
          numWorkgroups: builtin.numWorkgroups,
          workgroupId: builtin.workgroupId,
          localInvocationIndex: builtin.localInvocationIndex,
        },
        workgroupSize: [IFS_GROUP_SIZE, 1, 1],
      })(({ numWorkgroups, workgroupId, localInvocationIndex }) => {
        const outputTextureDimension =
          blendBindGroupLayout.$.outputTextureDimension
        const pointRandomSeeds = blendBindGroupLayout.$.pointRandomSeeds
        const accumulationBuffer = blendBindGroupLayout.$.accumulationBuffer
        const workgroupIndex =
          workgroupId.x +
          workgroupId.y * numWorkgroups.x +
          workgroupId.z * numWorkgroups.x * numWorkgroups.y
        const pointIndex =
          workgroupIndex * IFS_GROUP_SIZE + localInvocationIndex
        if (pointIndex >= arrayLength(pointRandomSeeds)) return
        const pointSeed = pointRandomSeeds[pointIndex]!
        const seed = add(pointSeed, hash(pointIndex))
        setSeed(seed)
        let point = Point()
        point.position = pointInitMode(pointIndex)
        point.color = colorInitMode(point.position)
        for (let i = 0; i < insideShaderCount; i += 1) {
          point = executeRandomFlame(point)
        }
        point.position = transformAffine(
          blendBindGroupLayout.$.finalTransform,
          point.position,
        )
        const clip = camera2DWorldToClip(point.position)
        const outputTextureDimensionF = vec2f(outputTextureDimension)
        const screen = mul(
          outputTextureDimensionF,
          add(mul(clip, vec2f(0.5, -0.5)), 0.5),
        )
        blendBindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(
          randomState.$,
        )
        const jittered = add(screen, pointInitMode(pointIndex))
        if (
          !(
            jittered.x >= 0 &&
            jittered.y >= 0 &&
            jittered.x < outputTextureDimensionF.x &&
            jittered.y < outputTextureDimensionF.y
          )
        )
          return
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

      cached = {
        FlameUniforms: BlendUniforms,
        bindGroupLayout: blendBindGroupLayout,
        ifsCompute,
      }
    } else {
      // ---- Existing non-blending code path ----
      const flames = Object.fromEntries(
        recordEntries(transforms).map(([tid, tr]) => {
          globId += tid
          return [tid, createFlameWgsl(tr)]
        }),
      )

      const flamesObj = Object.fromEntries(
        recordKeys(transforms).map((tid) => [
          `flame${tid}`,
          flames[tid]!.fnImpl,
        ]),
      )
      const keys = recordKeys(transforms)
      const FlameUniforms = struct(
        keys.length > 0
          ? Object.fromEntries(
              keys.map((tid) => [`flame${tid}`, flames[tid]!.Uniforms]),
            )
          : { _dummy: f32 },
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
        const pointIndex =
          workgroupIndex * IFS_GROUP_SIZE + localInvocationIndex
        if (pointIndex >= arrayLength(pointRandomSeeds)) return
        const pointSeed = pointRandomSeeds[pointIndex]!
        const seed = add(pointSeed, hash(pointIndex))
        setSeed(seed)
        let point = Point()
        point.position = pointInitMode(pointIndex)
        point.color = colorInitMode(point.position)
        for (let i = 0; i < insideShaderCount; i += 1) {
          point = executeRandomFlame(point)
        }
        point.position = transformAffine(
          bindGroupLayout.$.finalTransform,
          point.position,
        )
        const clip = camera2DWorldToClip(point.position)
        const outputTextureDimensionF = vec2f(outputTextureDimension)
        const screen = mul(
          outputTextureDimensionF,
          add(mul(clip, vec2f(0.5, -0.5)), 0.5),
        )
        bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(randomState.$)
        const jittered = add(screen, pointInitMode(pointIndex))
        if (
          !(
            jittered.x >= 0 &&
            jittered.y >= 0 &&
            jittered.x < outputTextureDimensionF.x &&
            jittered.y < outputTextureDimensionF.y
          )
        )
          return
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
    }
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
  vramLog(
    '[ifsPipeline] Created flameUniforms, finalTransform & dimension buffers',
  )

  onCleanup(() => {
    vramLog(
      '[ifsPipeline] Destroying flameUniforms, finalTransform & dimension buffers',
    )
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
    update: (
      flameDescriptor: FlameDescriptor,
      blendFlameDescriptor?: FlameDescriptor,
      blendWeight?: number,
    ) => {
      if (isBlending && blendFlameDescriptor) {
        const a = extractFlameUniforms(flameDescriptor)
        const b = extractFlameUniforms(blendFlameDescriptor)
        flameUniformsBuffer.write({
          ...Object.fromEntries(
            Object.entries(a).map(([k, v]) => [k.replace(/^flame/, 'a_'), v]),
          ),
          ...Object.fromEntries(
            Object.entries(b).map(([k, v]) => [k.replace(/^flame/, 'b_'), v]),
          ),
          blendWeight: blendWeight ?? 0,
        })
      } else {
        const uniforms = extractFlameUniforms(flameDescriptor)
        if (Object.keys(uniforms).length === 0) {
          flameUniformsBuffer.write({ _dummy: 0 })
        } else {
          flameUniformsBuffer.write(uniforms)
        }
      }
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
