import { onCleanup } from 'solid-js'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, u32, vec2f, vec2i, vec2u, vec4f, } from 'typegpu/data'
import { add, arrayLength, atomicAdd, atomicLoad, div, max, mul, sub, } from 'typegpu/std'
import { DEBUG_MODE } from '@/defaults'
import { camera3DWorldToClip } from '@/lib/Camera3D'
import { hash, random, randomState, setSeed } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { vramLog } from '@/utils/vramLog'
import { AffineParams3D, transformAffine3D } from './affineTransform3D'
import { colorInitModeToImplFn } from './colorInitMode'
import { isPointInitMode3D, pointInitMode3DToImplFn } from './pointInitMode3D'
import { createFlameWgsl3D, extractFlameUniforms3D, isAffine3D, } from './transformFunction3D'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER, BUCKET_SATURATION_COUNT, } from './types'
import { Point3D } from './types3D'
import type { StorageFlag, TgpuBuffer, TgpuComputeFn, TgpuRoot } from 'typegpu'
import type { Vec2f, Vec2u, Vec4f, WgslArray } from 'typegpu/data'
import type { ColorInitMode } from './colorInitMode'
import type { PointInitMode } from './pointInitMode'
import type { PointInitMode3D } from './pointInitMode3D'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { Bucket } from './types'
import type { Camera3DContext } from '@/lib/Camera3DContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 64

// Mitchell-Netravali cubic filter (B=1/3, C=1/3).
// Support [-2, 2], integrates to 1. Used for stochastic accumulation.
// Kept as its own module-scope copy (rather than imported from ifsPipeline)
// because a WGSL-string tgpu.fn imported into another file's computeFn body is
// not reliably traced by unplugin-typegpu.
const mitchellNetravali = tgpu.fn([f32], f32) /* wgsl */ `
  (x: f32) -> f32 {
    let ax = abs(x);
    if (ax < 1.0) {
      return (7.0 * ax * ax * ax - 12.0 * ax * ax + 16.0 / 3.0) / 6.0;
    } else if (ax < 2.0) {
      return (-7.0 / 3.0 * ax * ax * ax + 12.0 * ax * ax - 20.0 * ax + 32.0 / 3.0) / 6.0;
    }
    return 0.0;
  }
`

const pipelineCache3D = new Map<
  string,
  {
    FlameUniforms: ReturnType<typeof struct>
    bindGroupLayout: ReturnType<typeof tgpu.bindGroupLayout>
    ifsCompute: TgpuComputeFn
  }
>()

// Compiled-pipeline cache per (root, sig) — same rationale as ifsPipeline.ts:
// avoids recompiling the shader on every createIFSPipeline3D re-run.
type IfsBasePipeline3D = ReturnType<TgpuRoot['createComputePipeline']>
const basePipeline3DByRoot = new WeakMap<
  TgpuRoot,
  Map<string, IfsBasePipeline3D>
>()

export function createIFSPipeline3D(
  root: TgpuRoot,
  camera: Camera3DContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec2u>> & StorageFlag,
  // Persisted chain state across dispatches (position xyz in a vec4f, color in a
  // vec2f) so the warmup/fuse is paid once per settle — see `resetPoints`.
  pointPositions: TgpuBuffer<WgslArray<Vec4f>> & StorageFlag,
  pointColors: TgpuBuffer<WgslArray<Vec2f>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof Bucket>> & StorageFlag,
  colorInitType: ColorInitMode = 'colorInitZero',
  pointInitType: PointInitMode = 'pointInitUnitSphere',
  // Number of points each chain plots after the warmup/fuse (see ifsPipeline).
  // Baked as a compile-time loop bound so the shader compiler can unroll it.
  plotsPerChain: number = 1,
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
    plotsPerChain,
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
      stochasticFilterRadius: {
        uniform: f32,
      },
      pointPositions: {
        storage: arrayOf(vec4f),
        access: 'mutable',
      },
      pointColors: {
        storage: arrayOf(vec2f),
        access: 'mutable',
      },
      resetPoints: {
        uniform: u32,
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
      // Cold start (after a settle/reset): seed the chain and pay the warmup
      // fuse. Otherwise continue the persisted chain from the last dispatch.
      if (bindGroupLayout.$.resetPoints > 0) {
        point.position = pointInitMode(pointIndex)
        point.color = colorInitMode(point.position.xy)
        for (let i = 0; i < insideShaderCount; i += 1) {
          point = executeRandomFlame(point)
        }
      } else {
        point.position = bindGroupLayout.$.pointPositions[pointIndex]!.xyz
        point.color = vec2f(bindGroupLayout.$.pointColors[pointIndex]!)
      }
      const outputTextureDimensionF = vec2f(outputTextureDimension)
      const filterRadius = bindGroupLayout.$.stochasticFilterRadius
      // Plot one point per chain step after the warmup above, amortizing the
      // warmup cost across plotsPerChain plotted points.
      for (let plot = 0; plot < plotsPerChain; plot += 1) {
        point = executeRandomFlame(point)
        const plotPos = transformAffine3D(
          bindGroupLayout.$.finalTransform,
          point.position,
        )
        const clip = camera3DWorldToClip(plotPos)
        const screen = mul(
          outputTextureDimensionF,
          add(mul(clip.xy, vec2f(0.5, -0.5)), 0.5),
        )
        if (filterRadius > 0) {
          // Screen-space Mitchell-Netravali splat (mirrors the 2D path). The
          // kernel ignores depth, so it reconstructs in screen space only — the
          // z value is splatted at the offset pixel weighted by the same factor
          // so the per-pixel depth average (z / count) stays correct.
          const offsetX = mul(sub(random(), 0.5), mul(filterRadius, 4))
          const offsetY = mul(sub(random(), 0.5), mul(filterRadius, 4))
          const wx = mitchellNetravali(div(offsetX, filterRadius))
          const wy = mitchellNetravali(div(offsetY, filterRadius))
          // Clamp the (possibly negative) MN lobes to >= 0 before the u32 cast
          // below: u32(negative) is UNDEFINED in WGSL and wraps to garbage on
          // some GPUs, producing bright speckle grain. Mirrors the 2D path.
          const accumWeight = max(mul(mul(wx, wy), 16), f32(0))
          const finalScreen = add(screen, vec2f(offsetX, offsetY))
          const oob =
            finalScreen.x < 0 ||
            finalScreen.y < 0 ||
            finalScreen.x > outputTextureDimensionF.x ||
            finalScreen.y > outputTextureDimensionF.y ||
            // eslint-disable-next-line eqeqeq -- NaN check in WGSL
            finalScreen.x != finalScreen.x ||
            // eslint-disable-next-line eqeqeq -- NaN check in WGSL
            finalScreen.y != finalScreen.y
          if (!oob) {
            const screenI = vec2i(finalScreen)
            const pixelIndex = screenI.y * outputTextureDimension.x + screenI.x
            const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
            const fixedWeight = u32(mul(accumWeight, f32(fixed_m)))
            // Stop once the bucket saturates so the atomics can't wrap.
            if (
              atomicLoad(accumulationBuffer[pixelIndex]!.count) <
              BUCKET_SATURATION_COUNT
            ) {
              atomicAdd(accumulationBuffer[pixelIndex]!.count, fixedWeight)
              atomicAdd(
                accumulationBuffer[pixelIndex]!.z,
                i32(mul(clip.z, f32(fixedWeight))),
              )
              atomicAdd(
                accumulationBuffer[pixelIndex]!.color.a,
                i32(mul(point.color.x, f32(fixedWeight))),
              )
              atomicAdd(
                accumulationBuffer[pixelIndex]!.color.b,
                i32(mul(point.color.y, f32(fixedWeight))),
              )
            }
          }
        } else {
          const jittered = add(screen, pointInitMode(pointIndex).xy)
          const oob =
            jittered.x < 0 ||
            jittered.y < 0 ||
            jittered.x > outputTextureDimensionF.x ||
            jittered.y > outputTextureDimensionF.y ||
            // eslint-disable-next-line eqeqeq -- NaN check in WGSL
            jittered.x != jittered.x ||
            // eslint-disable-next-line eqeqeq -- NaN check in WGSL
            jittered.y != jittered.y
          if (!oob) {
            const screenI = vec2i(jittered)
            const pixelIndex = screenI.y * outputTextureDimension.x + screenI.x
            const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
            // Stop once the bucket saturates so the atomics can't wrap.
            if (
              atomicLoad(accumulationBuffer[pixelIndex]!.count) <
              BUCKET_SATURATION_COUNT
            ) {
              atomicAdd(accumulationBuffer[pixelIndex]!.count, u32(1 * fixed_m))
              atomicAdd(
                accumulationBuffer[pixelIndex]!.z,
                i32(clip.z * f32(fixed_m)),
              )
              atomicAdd(
                accumulationBuffer[pixelIndex]!.color.a,
                i32(point.color.x * f32(fixed_m)),
              )
              atomicAdd(
                accumulationBuffer[pixelIndex]!.color.b,
                i32(point.color.y * f32(fixed_m)),
              )
            }
          }
        }
      }
      // Persist the chain so the next dispatch continues it without re-warmup.
      bindGroupLayout.$.pointPositions[pointIndex] = vec4f(point.position, 0)
      bindGroupLayout.$.pointColors[pointIndex] = vec2f(point.color)
      bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(randomState.$)
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
  const stochasticFilterRadiusBuffer = root
    .createBuffer(f32, 0)
    .$usage('uniform')
  // Defaults to 1 so a freshly created pipeline warms up on its first dispatch.
  const resetPointsBuffer = root.createBuffer(u32, 1).$usage('uniform')
  vramLog(
    '[ifsPipeline3D] Created flameUniforms, finalTransform, dimension & stochasticFilterRadius buffers',
  )

  onCleanup(() => {
    vramLog(
      '[ifsPipeline3D] Destroying flameUniforms, finalTransform, dimension & stochasticFilterRadius buffers',
    )
    flameUniformsBuffer.destroy()
    outputTextureDimensionBuffer.destroy()
    finalTransformBuffer.destroy()
    stochasticFilterRadiusBuffer.destroy()
    resetPointsBuffer.destroy()
  })

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    pointRandomSeeds,
    flameUniforms: flameUniformsBuffer,
    outputTextureDimension: outputTextureDimensionBuffer,
    finalTransform: finalTransformBuffer,
    accumulationBuffer,
    stochasticFilterRadius: stochasticFilterRadiusBuffer,
    pointPositions,
    pointColors,
    resetPoints: resetPointsBuffer,
  })

  let rootCache = basePipeline3DByRoot.get(root)
  if (!rootCache) {
    rootCache = new Map()
    basePipeline3DByRoot.set(root, rootCache)
  }
  let basePipeline = rootCache.get(sig)
  if (!basePipeline) {
    basePipeline = root.createComputePipeline({ compute: ifsCompute })
    basePipeline.$name(globId)
    rootCache.set(sig, basePipeline)
  }

  // `.with()` binds resources onto the cached base pipeline without recompiling.
  const ifsPipeline = basePipeline.with(camera.bindGroup).with(bindGroup)
  return {
    // Mirror the 2D pipeline: let a dispatch error propagate so the app-level
    // WebGPU-resilience handling (reactive gpuReady + the export driver's
    // onSubmittedWorkDone catch) sees it, rather than silently swallowing it
    // here and freezing the canvas frame after frame.
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
    setStochasticFilterRadius: (radius: number) => {
      stochasticFilterRadiusBuffer.write(radius)
    },
    // 1 = re-initialize chains and pay the warmup this dispatch; 0 = continue the
    // persisted chains. Set to 1 for the first tick after an accumulation reset.
    setResetPoints: (reset: number) => {
      resetPointsBuffer.write(reset)
    },
  }
}
