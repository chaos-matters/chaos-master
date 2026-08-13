import { hash } from '@typegpu/noise'
import { onCleanup } from 'solid-js'
import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, struct, u32, vec2f, vec2i, vec2u, vec4f, } from 'typegpu/data'
import { add, arrayLength, atomicAdd, atomicLoad, div, max, mul, sub, } from 'typegpu/std'
import { camera2DWorldToClip } from '@/lib/Camera2D'
import { random, randomState, setSeed } from '@/shaders/random'
import { recordEntries, recordKeys } from '@/utils/record'
import { vramLog } from '@/utils/vramLog'
import { AffineParams, transformAffine } from './affineTranform'
import { colorInitModeToImplFn } from './colorInitMode'
import { isPointInitMode2D, pointInitModeToImplFn } from './pointInitMode'
import { createFlameWgsl, extractFlameUniforms } from './transformFunction'
import { AtomicBucket, BUCKET_FIXED_POINT_MULTIPLIER, BUCKET_SATURATION_COUNT, Point, } from './types'
import { getCacheVersion } from './variations/custom'
import type { StorageFlag, TgpuBuffer, TgpuComputeFn, TgpuRoot } from 'typegpu'
import type { Vec2f, Vec2u, Vec4f, WgslArray } from 'typegpu/data'
import type { ColorInitMode } from './colorInitMode'
import type { PointInitMode, PointInitMode2D } from './pointInitMode'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { Bucket } from './types'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math
const IFS_GROUP_SIZE = 64

// Mitchell-Netravali cubic filter (B=1/3, C=1/3).
// Support [-2, 2], integrates to 1. Used for stochastic accumulation.
// Defined at module scope and referenced directly in the computeFn body — the
// same proven pattern as the 3D pipeline's copy. (Not shared cross-module: a
// WGSL-string tgpu.fn imported into another file's computeFn body is not
// reliably traced by unplugin-typegpu.)
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

const pipelineCache = new Map<
  string,
  {
    FlameUniforms: ReturnType<typeof struct>
    bindGroupLayout: ReturnType<typeof tgpu.bindGroupLayout>
    ifsCompute: TgpuComputeFn
  }
>()

// Monotonic count of actual GPUComputePipeline (shader-module) compiles. With
// the per-root cache below this should now climb only once per distinct
// (root, variation) — not on every createIFSPipeline re-run. The IFS-PIP-...
// "errors while creating shader module" appeared here once VRAM was exhausted.
let pipelineCompiles = 0

// Compiled-pipeline cache. The base compute pipeline depends only on the shader
// (ifsCompute, already keyed by `sig`); `.with(bindGroup)` binds buffers without
// recompiling. So we cache the COMPILED pipeline per (root, sig) and re-apply
// `.with()` each call — turning the gallery's ~601 redundant compiles for ~18
// distinct shaders into one compile per distinct (root, variation).
//
// Keyed by root via a WeakMap so a preview's cache is collected with its Root
// (Root.tsx onCleanup destroys the root). Never shared across roots/devices —
// each preview has its own Root, and a pipeline is bound to its root's device.
type IfsBasePipeline = ReturnType<TgpuRoot['createComputePipeline']>
const basePipelineByRoot = new WeakMap<TgpuRoot, Map<string, IfsBasePipeline>>()

export function createIFSPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  insideShaderCount: number,
  pointRandomSeeds: TgpuBuffer<WgslArray<Vec2u>> & StorageFlag,
  // Persisted chain state across dispatches (position xyz in a vec4f, color in a
  // vec2f). Lets the warmup/fuse be paid once per settle rather than every
  // dispatch — see the `resetPoints` uniform below.
  pointPositions: TgpuBuffer<WgslArray<Vec4f>> & StorageFlag,
  pointColors: TgpuBuffer<WgslArray<Vec2f>> & StorageFlag,
  transforms: TransformRecord,
  outputTextureDimension: readonly [number, number],
  accumulationBuffer: TgpuBuffer<WgslArray<typeof Bucket>> & StorageFlag,
  colorInitType: ColorInitMode = 'colorInitZero',
  pointInitType: PointInitMode = 'pointInitUnitDisk',
  blendTransforms?: TransformRecord,
  // Number of points each chain plots after the warmup/fuse. The chaos game
  // converges onto the attractor during `insideShaderCount` warmup iterations,
  // then plots one point per iteration (compare bezo97/IFSRenderer). Plotting
  // many points per chain amortizes the warmup cost — the key throughput lever.
  // Baked as a compile-time loop bound so the shader compiler can unroll it.
  plotsPerChain: number = 1,
) {
  // Flames switched to 2D (or loaded 3D presets previewed without a 3D
  // camera) can carry a 3D init mode — fall back instead of resolving an
  // undefined shader external.
  const pointInit: PointInitMode2D = isPointInitMode2D(pointInitType)
    ? pointInitType
    : 'pointInitUnitDisk'
  const isBlending = blendTransforms !== undefined
  let globId = `IFS-PIP-${recordKeys(transforms).join('')}`
  if (isBlending) globId += recordKeys(blendTransforms).join('')
  // Cache key contains only what is baked into the generated WGSL: transform
  // ids (struct member names), variation ids/types, loop count and init modes.
  // Uniform values flow through buffers and must not fragment the cache.
  const sig = JSON.stringify({
    insideShaderCount,
    plotsPerChain,
    customVariationsVersion: getCacheVersion(),
    colorInitType,
    pointInit,
    transforms: recordEntries(transforms).map(([tid, tr]) => ({
      tid,
      variations: recordEntries(tr.variations).map(([vid, v]) => ({
        vid,
        type: v.type,
      })),
    })),
    ...(isBlending && {
      blendTransforms: recordEntries(blendTransforms).map(([tid, tr]) => ({
        tid,
        variations: recordEntries(tr.variations).map(([vid, v]) => ({
          vid,
          type: v.type,
        })),
      })),
    }),
  })

  let cached = pipelineCache.get(sig)
  vramLog(
    cached
      ? `[ifsPipeline] WGSL def cache HIT (defs=${pipelineCache.size})`
      : `[ifsPipeline] WGSL def cache MISS — generating WGSL (defs=${pipelineCache.size})`,
  )
  if (!cached) {
    if (isBlending) {
      // ---- Blending code path ----
      const tidsA = recordKeys(transforms)
      const tidsB = recordKeys(blendTransforms)

      const flamesA = Object.fromEntries(
        tidsA.map((tid) => [tid, createFlameWgsl(transforms[tid]!)]),
      )
      const flamesB = Object.fromEntries(
        tidsB.map((tid) => [tid, createFlameWgsl(blendTransforms[tid]!)]),
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
      const pointInitMode = pointInitModeToImplFn[pointInit]

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
        // Cold start (after a settle/reset): seed the chain and pay the warmup
        // fuse. Otherwise continue the persisted chain from the last dispatch.
        if (blendBindGroupLayout.$.resetPoints > 0) {
          point.position = pointInitMode(pointIndex)
          point.color = colorInitMode(point.position)
          for (let i = 0; i < insideShaderCount; i += 1) {
            point = executeRandomFlame(point)
          }
        } else {
          point.position = blendBindGroupLayout.$.pointPositions[pointIndex]!.xy
          point.color = vec2f(blendBindGroupLayout.$.pointColors[pointIndex]!)
        }
        const outputTextureDimensionF = vec2f(outputTextureDimension)
        const filterRadius = blendBindGroupLayout.$.stochasticFilterRadius
        // Plot one point per chain step after the warmup above, amortizing the
        // warmup cost across plotsPerChain plotted points.
        for (let plot = 0; plot < plotsPerChain; plot += 1) {
          point = executeRandomFlame(point)
          const plotPos = transformAffine(
            blendBindGroupLayout.$.finalTransform,
            point.position,
          )
          const clip = camera2DWorldToClip(plotPos)
          const screen = mul(
            outputTextureDimensionF,
            add(mul(clip, vec2f(0.5, -0.5)), 0.5),
          )
          if (filterRadius > 0) {
            const offsetX = mul(sub(random(), 0.5), mul(filterRadius, 4))
            const offsetY = mul(sub(random(), 0.5), mul(filterRadius, 4))
            const wx = mitchellNetravali(div(offsetX, filterRadius))
            const wy = mitchellNetravali(div(offsetY, filterRadius))
            // Importance-sampling estimator: offset ~ uniform on [-2R, 2R]²
            // (pdf = 1/(16R²)); the normalized 2D MN kernel is MN(dx/R)·MN(dy/R)/R².
            // weight = kernel / pdf = 16·MN·MN, giving an expected contribution of
            // 1 per point — energy-preserving and independent of the radius, so it
            // matches the non-MN path (count += 1) and the tonemap normalization.
            // Clamp to >= 0 before the u32 cast below: 16·MN·MN goes negative when
            // exactly one of wx/wy lands in a negative MN lobe, and u32(negative)
            // is UNDEFINED in WGSL — on some GPUs it wraps to a huge value and
            // produces bright speckle grain (worst while the camera moves and
            // accumulation is low). Dropping the negative lobes is slightly softer
            // but correct.
            const accumWeight = max(mul(mul(wx, wy), 16), f32(0))
            const finalScreen = add(screen, vec2f(offsetX, offsetY))
            const oob =
              finalScreen.x < 0 ||
              finalScreen.y < 0 ||
              finalScreen.x > outputTextureDimensionF.x ||
              finalScreen.y > outputTextureDimensionF.y ||
              // NaN check (v !== v is true only for NaN)
              finalScreen.x !== finalScreen.x ||
              finalScreen.y !== finalScreen.y
            if (!oob) {
              const screenI = vec2i(finalScreen)
              const pixelIndex =
                screenI.y * outputTextureDimension.x + screenI.x
              const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
              const fixedWeight = u32(mul(accumWeight, f32(fixed_m)))
              // Stop once the bucket saturates so the atomics can't wrap.
              if (
                atomicLoad(accumulationBuffer[pixelIndex]!.count) <
                BUCKET_SATURATION_COUNT
              ) {
                atomicAdd(accumulationBuffer[pixelIndex]!.count, fixedWeight)
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
            const jittered = add(screen, pointInitMode(pointIndex))
            const oob =
              jittered.x < 0 ||
              jittered.y < 0 ||
              jittered.x > outputTextureDimensionF.x ||
              jittered.y > outputTextureDimensionF.y ||
              // NaN check (v !== v is true only for NaN)
              jittered.x !== jittered.x ||
              jittered.y !== jittered.y
            if (!oob) {
              const screenI = vec2i(jittered)
              const pixelIndex =
                screenI.y * outputTextureDimension.x + screenI.x
              const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
              // Stop once the bucket saturates so the atomics can't wrap.
              if (
                atomicLoad(accumulationBuffer[pixelIndex]!.count) <
                BUCKET_SATURATION_COUNT
              ) {
                atomicAdd(
                  accumulationBuffer[pixelIndex]!.count,
                  u32(1 * fixed_m),
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
        blendBindGroupLayout.$.pointPositions[pointIndex] = vec4f(
          point.position,
          0,
          0,
        )
        blendBindGroupLayout.$.pointColors[pointIndex] = vec2f(point.color)
        blendBindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(
          randomState.$,
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
        recordEntries(transforms).map(([tid, tr]) => [
          tid,
          createFlameWgsl(tr),
        ]),
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

      const colorInitMode = colorInitModeToImplFn[colorInitType]
      const pointInitMode = pointInitModeToImplFn[pointInit]

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
        // Cold start (after a settle/reset): seed the chain and pay the warmup
        // fuse. Otherwise continue the persisted chain from the last dispatch.
        if (bindGroupLayout.$.resetPoints > 0) {
          point.position = pointInitMode(pointIndex)
          point.color = colorInitMode(point.position)
          for (let i = 0; i < insideShaderCount; i += 1) {
            point = executeRandomFlame(point)
          }
        } else {
          point.position = bindGroupLayout.$.pointPositions[pointIndex]!.xy
          point.color = vec2f(bindGroupLayout.$.pointColors[pointIndex]!)
        }
        const outputTextureDimensionF = vec2f(outputTextureDimension)
        const filterRadius = bindGroupLayout.$.stochasticFilterRadius
        // Plot one point per chain step after the warmup above, amortizing the
        // warmup cost across plotsPerChain plotted points.
        for (let plot = 0; plot < plotsPerChain; plot += 1) {
          point = executeRandomFlame(point)
          const plotPos = transformAffine(
            bindGroupLayout.$.finalTransform,
            point.position,
          )
          const clip = camera2DWorldToClip(plotPos)
          const screen = mul(
            outputTextureDimensionF,
            add(mul(clip, vec2f(0.5, -0.5)), 0.5),
          )
          if (filterRadius > 0) {
            const offsetX = mul(sub(random(), 0.5), mul(filterRadius, 4))
            const offsetY = mul(sub(random(), 0.5), mul(filterRadius, 4))
            const wx = mitchellNetravali(div(offsetX, filterRadius))
            const wy = mitchellNetravali(div(offsetY, filterRadius))
            // Importance-sampling estimator: offset ~ uniform on [-2R, 2R]²
            // (pdf = 1/(16R²)); the normalized 2D MN kernel is MN(dx/R)·MN(dy/R)/R².
            // weight = kernel / pdf = 16·MN·MN, giving an expected contribution of
            // 1 per point — energy-preserving and independent of the radius, so it
            // matches the non-MN path (count += 1) and the tonemap normalization.
            // Clamp to >= 0 before the u32 cast below: 16·MN·MN goes negative when
            // exactly one of wx/wy lands in a negative MN lobe, and u32(negative)
            // is UNDEFINED in WGSL — on some GPUs it wraps to a huge value and
            // produces bright speckle grain (worst while the camera moves and
            // accumulation is low). Dropping the negative lobes is slightly softer
            // but correct.
            const accumWeight = max(mul(mul(wx, wy), 16), f32(0))
            const finalScreen = add(screen, vec2f(offsetX, offsetY))
            const oob =
              finalScreen.x < 0 ||
              finalScreen.y < 0 ||
              finalScreen.x > outputTextureDimensionF.x ||
              finalScreen.y > outputTextureDimensionF.y ||
              // NaN check (v !== v is true only for NaN)
              finalScreen.x !== finalScreen.x ||
              finalScreen.y !== finalScreen.y
            if (!oob) {
              const screenI = vec2i(finalScreen)
              const pixelIndex =
                screenI.y * outputTextureDimension.x + screenI.x
              const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
              const fixedWeight = u32(mul(accumWeight, f32(fixed_m)))
              // Stop once the bucket saturates so the atomics can't wrap.
              if (
                atomicLoad(accumulationBuffer[pixelIndex]!.count) <
                BUCKET_SATURATION_COUNT
              ) {
                atomicAdd(accumulationBuffer[pixelIndex]!.count, fixedWeight)
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
            const jittered = add(screen, pointInitMode(pointIndex))
            const oob =
              jittered.x < 0 ||
              jittered.y < 0 ||
              jittered.x > outputTextureDimensionF.x ||
              jittered.y > outputTextureDimensionF.y ||
              // NaN check (v !== v is true only for NaN)
              jittered.x !== jittered.x ||
              jittered.y !== jittered.y
            if (!oob) {
              const screenI = vec2i(jittered)
              const pixelIndex =
                screenI.y * outputTextureDimension.x + screenI.x
              const fixed_m = BUCKET_FIXED_POINT_MULTIPLIER
              // Stop once the bucket saturates so the atomics can't wrap.
              if (
                atomicLoad(accumulationBuffer[pixelIndex]!.count) <
                BUCKET_SATURATION_COUNT
              ) {
                atomicAdd(
                  accumulationBuffer[pixelIndex]!.count,
                  u32(1 * fixed_m),
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
        bindGroupLayout.$.pointPositions[pointIndex] = vec4f(
          point.position,
          0,
          0,
        )
        bindGroupLayout.$.pointColors[pointIndex] = vec2f(point.color)
        bindGroupLayout.$.pointRandomSeeds[pointIndex] = vec2u(randomState.$)
      })

      cached = { FlameUniforms, bindGroupLayout, ifsCompute }
    }
    pipelineCache.set(sig, cached)
  }

  const { FlameUniforms, bindGroupLayout, ifsCompute } = cached

  // Capture a template of the expected uniform structure so update() can
  // defensively fill missing entries with zero-probability defaults when a
  // flame descriptor has fewer transforms than the pipeline was built for
  // (avoids "Cannot read properties of undefined (reading 'probability')"
  // in TypeGPU's compiled writer).
  const _templateUniforms: Record<string, unknown> = isBlending
    ? {
        ...Object.fromEntries(
          Object.entries(extractFlameUniforms({ transforms })).map(([k, v]) => [
            k.replace(/^flame/, 'a_'),
            v,
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(
            extractFlameUniforms({ transforms: blendTransforms }),
          ).map(([k, v]) => [k.replace(/^flame/, 'b_'), v]),
        ),
        blendWeight: 0,
      }
    : extractFlameUniforms({ transforms })
  const _uniformKeys = Object.keys(_templateUniforms)

  const flameUniformsBuffer = root.createBuffer(FlameUniforms).$usage('storage')
  const outputTextureDimensionBuffer = root
    .createBuffer(vec2i, vec2i(...outputTextureDimension))
    .$usage('uniform')
  const finalTransformBuffer = root
    .createBuffer(AffineParams, { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 })
    .$usage('uniform')
  const stochasticFilterRadiusBuffer = root
    .createBuffer(f32, 0)
    .$usage('uniform')
  // Defaults to 1 so a freshly created pipeline warms up on its first dispatch.
  const resetPointsBuffer = root.createBuffer(u32, 1).$usage('uniform')
  vramLog(
    '[ifsPipeline] Created flameUniforms, finalTransform, dimension & stochasticFilterRadius buffers',
  )

  onCleanup(() => {
    vramLog(
      '[ifsPipeline] Destroying flameUniforms, finalTransform, dimension & stochasticFilterRadius buffers',
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

  let rootCache = basePipelineByRoot.get(root)
  if (!rootCache) {
    rootCache = new Map()
    basePipelineByRoot.set(root, rootCache)
  }
  let basePipeline = rootCache.get(sig)
  if (!basePipeline) {
    pipelineCompiles += 1
    vramLog(
      `[ifsPipeline] createComputePipeline (shader-module COMPILE) ${globId} compiles=${pipelineCompiles} rootCache=${rootCache.size}`,
    )
    basePipeline = root.createComputePipeline({ compute: ifsCompute })
    basePipeline.$name(globId)
    rootCache.set(sig, basePipeline)
  } else {
    vramLog(`[ifsPipeline] compiled-pipeline cache HIT ${globId}`)
  }

  // `.with()` binds resources onto the cached base pipeline without recompiling.
  const ifsPipeline = basePipeline.with(camera.bindGroup).with(bindGroup)
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
        const uniforms: Record<string, unknown> = {
          ...Object.fromEntries(
            Object.entries(a).map(([k, v]) => [k.replace(/^flame/, 'a_'), v]),
          ),
          ...Object.fromEntries(
            Object.entries(b).map(([k, v]) => [k.replace(/^flame/, 'b_'), v]),
          ),
          blendWeight: blendWeight ?? 0,
        }
        // Defensively merge with template so the compiled writer never
        // encounters a missing field when transform counts differ.
        const safe: Record<string, unknown> = {}
        for (const key of _uniformKeys) {
          safe[key] =
            key in uniforms
              ? uniforms[key]
              : {
                  ...(_templateUniforms[key] as Record<string, unknown>),
                  probability: 0,
                }
        }
        flameUniformsBuffer.write(safe)
      } else if (_uniformKeys.length === 0) {
        // Pipeline was built with zero transforms — the struct is the
        // `{ _dummy }` placeholder, so write its field explicitly.
        flameUniformsBuffer.write({ _dummy: 0 })
      } else {
        const uniforms = extractFlameUniforms(flameDescriptor)
        const safe: Record<string, unknown> = {}
        for (const key of _uniformKeys) {
          safe[key] =
            key in uniforms
              ? uniforms[key]
              : {
                  ...(_templateUniforms[key] as Record<string, unknown>),
                  probability: 0,
                }
        }
        flameUniformsBuffer.write(safe)
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
