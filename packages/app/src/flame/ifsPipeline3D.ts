import { onCleanup } from 'solid-js'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, u32, vec2f, vec2i, vec2u, } from 'typegpu/data'
import { add, arrayLength, atomicAdd, mul } from 'typegpu/std'
import { DEBUG_MODE } from '@/defaults'
import { camera3DWorldToClip } from '@/lib/Camera3D'
import { hash, random, randomState, setSeed } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { vramLog } from '@/utils/vramLog'
import { AffineParams3D, transformAffine3D } from './affineTransform3D'
import { colorInitModeToImplFn } from './colorInitMode'
import { isPointInitMode3D, pointInitMode3DToImplFn } from './pointInitMode3D'
import { createFlameWgsl3D, extractFlameUniforms3D, isAffine3D, } from './transformFunction3D'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER } from './types'
import { Point3D } from './types3D'
import type { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import type { Vec2u, WgslArray } from 'typegpu/data'
import type { ColorInitMode } from './colorInitMode'
import type { PointInitMode } from './pointInitMode'
import type { PointInitMode3D } from './pointInitMode3D'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { Bucket } from './types'
import type { Camera3DContext } from '@/lib/Camera3DContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 64

const pipelineCache3D = new Map<
  string,
  {
    FlameUniforms: ReturnType<typeof struct>
    bindGroupLayout: ReturnType<typeof tgpu.bindGroupLayout>
    ifsCompute: ReturnType<ReturnType<typeof tgpu.computeFn>>
  }
>()

export function createIFSPipeline3D(
  root: TgpuRoot,
  camera: Camera3DContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec2u>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof Bucket>> & StorageFlag,
  colorInitType: ColorInitMode = 'colorInitZero',
  pointInitType: PointInitMode = 'pointInitUnitSphere',
) {
  // Flames switched to 3D (or animated point-init keyframes) can still carry a
  // 2D init mode — fall back instead of resolving an undefined shader external.
  const pointInit: PointInitMode3D = isPointInitMode3D(pointInitType)
    ? pointInitType
    : 'pointInitUnitBall'
  const globId = `IFS-3DPIP-${recordKeys(transforms).join('')}`
  // Cache key contains only what is baked into the generated WGSL: transform
  // ids (struct member names), variation ids/types, loop count and init mode.
  // Uniform values flow through buffers and must not fragment the cache.
  const sig = JSON.stringify({
    insideShaderCount,
    colorInitType,
    pointInit,
    transforms: recordEntries(transforms).map(([tid, tr]) => ({
      tid,
      variations: recordEntries(tr.variations).map(([vid, v]) => ({
        vid,
        type: v.type,
      })),
    })),
  })

  let cached = pipelineCache3D.get(sig)
  if (!cached) {
    const flames = Object.fromEntries(
      recordEntries(transforms).map(([tid, tr]) => {
        const variationTypes = recordEntries(tr.variations).map(
          ([vid, v]) => `${vid}:${v.type}`,
        )
        if (DEBUG_MODE) {
          console.info(
            `[ifsPipeline3D] Compiling transform ${tid}:`,
            variationTypes,
          )
        }
        return [tid, createFlameWgsl3D(tr)]
      }),
    )

    const flamesObj = Object.fromEntries(
      recordKeys(transforms).map((tid) => [`flame${tid}`, flames[tid]!.fnImpl]),
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
        uniform: AffineParams3D,
      },
      accumulationBuffer: {
        storage: arrayOf(AtomicBucket),
        access: 'mutable',
      },
    })

    const pointInitMode = pointInitMode3DToImplFn[pointInit]
    const colorInitMode = colorInitModeToImplFn[colorInitType]

    const executeRandomFlame = tgpu.fn([Point3D], Point3D) /* wgsl */ `
      (point: Point3D) -> Point3D {
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
      if (pointIndex >= arrayLength(pointRandomSeeds)) return
      const pointSeed = pointRandomSeeds[pointIndex]!
      const seed = add(pointSeed, hash(pointIndex))
      setSeed(seed)
      let point = Point3D()
      point.position = pointInitMode(pointIndex)
      point.color = colorInitMode(point.position.xy)
      for (let i = 0; i < insideShaderCount; i += 1) {
        point = executeRandomFlame(point)
      }
      point.position = transformAffine3D(
        bindGroupLayout.$.finalTransform,
        point.position,
      )
      const clip = camera3DWorldToClip(point.position)
      const outputTextureDimensionF = vec2f(outputTextureDimension)
      const screen = mul(
        outputTextureDimensionF,
        add(mul(clip.xy, vec2f(0.5, -0.5)), 0.5),
      )
      bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(randomState.$)
      const jittered = add(screen, pointInitMode(pointIndex).xy)
      if (
        jittered.x < 0 ||
        jittered.y < 0 ||
        jittered.x > outputTextureDimensionF.x ||
        jittered.y > outputTextureDimensionF.y ||
        // eslint-disable-next-line eqeqeq -- NaN check in WGSL
        jittered.x != jittered.x ||
        // eslint-disable-next-line eqeqeq -- NaN check in WGSL
        jittered.y != jittered.y
      )
        return
      const screenI = vec2i(jittered)
      const pixelIndex = screenI.y * outputTextureDimension.x + screenI.x
      const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
      atomicAdd(accumulationBuffer[pixelIndex]!.count, u32(1 * fixed_m))
      atomicAdd(accumulationBuffer[pixelIndex]!.z, i32(clip.z * f32(fixed_m)))
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
    pipelineCache3D.set(sig, cached)
  }

  const { FlameUniforms, bindGroupLayout, ifsCompute } = cached

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')
  const outputTextureDimensionBuffer = root
    .createBuffer(vec2i, vec2i(...outputTextureDimension))
    .$usage('uniform')
  const finalTransformBuffer = root
    .createBuffer(AffineParams3D, {
      a: 1,
      b: 0,
      c: 0,
      d: 0,
      e: 0,
      f: 1,
      g: 0,
      h: 0,
      i: 0,
      j: 0,
      k: 1,
      l: 0,
    })
    .$usage('uniform')
  vramLog(
    '[ifsPipeline3D] Created flameUniforms, finalTransform & dimension buffers',
  )

  onCleanup(() => {
    vramLog(
      '[ifsPipeline3D] Destroying flameUniforms, finalTransform & dimension buffers',
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
      try {
        ifsPipeline
          .with(pass)
          .dispatchWorkgroups(
            ceil(pointCount / (IFS_GROUP_SIZE * IFS_GROUP_SIZE)),
            IFS_GROUP_SIZE,
            1,
          )
      } catch (err) {
        console.error(
          `[ifsPipeline3D] Pipeline ${globId} dispatch failed. sig:`,
          sig,
          err,
        )
      }
    },
    update: (flameDescriptor: FlameDescriptor) => {
      const uniforms = extractFlameUniforms3D(flameDescriptor)
      if (Object.keys(uniforms).length === 0) {
        flameUniformsBuffer.write({ _dummy: 0 })
      } else {
        flameUniformsBuffer.write(uniforms)
      }
      const ft = flameDescriptor.finalTransform as
        | Record<string, number | undefined>
        | undefined
      finalTransformBuffer.write(
        ft
          ? isAffine3D(ft)
            ? {
                a: ft.a ?? 1,
                b: ft.b ?? 0,
                c: ft.c ?? 0,
                d: ft.d ?? 0,
                e: ft.e ?? 0,
                f: ft.f ?? 1,
                g: ft.g ?? 0,
                h: ft.h ?? 0,
                i: ft.i ?? 0,
                j: ft.j ?? 0,
                k: ft.k ?? 1,
                l: ft.l ?? 0,
              }
            : {
                a: ft.a ?? 1,
                b: ft.b ?? 0,
                c: 0,
                d: ft.c ?? 0, // Translation X
                e: ft.d ?? 0,
                f: ft.e ?? 1,
                g: 0,
                h: ft.f ?? 0, // Translation Y
                i: 0,
                j: 0,
                k: 1,
                l: 0,
              }
          : {
              a: 1,
              b: 0,
              c: 0,
              d: 0,
              e: 0,
              f: 1,
              g: 0,
              h: 0,
              i: 0,
              j: 0,
              k: 1,
              l: 0,
            },
      )
    },
  }
}
