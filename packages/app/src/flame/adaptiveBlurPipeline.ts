import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, i32, u32, vec2i } from 'typegpu/data'
import { add, ceil, clamp, exp, max, sub } from 'typegpu/std'
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER, FilterParams } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const GROUP_SIZE_X = 8
const GROUP_SIZE_Y = 8
const { ceil: ceilMath } = Math
const MAX_SIGMA = 12

// Horizontal pass: accumulationBuffer → tempBuffer
const hBlurBindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
  filterParamsBuffer: {
    storage: arrayOf(FilterParams),
    access: 'readonly',
  },
  tempBuffer: {
    storage: arrayOf(Bucket),
    access: 'mutable',
  },
})

// Vertical pass: tempBuffer → postprocessBuffer
const vBlurBindGroupLayout = tgpu.bindGroupLayout({
  textureSize: {
    uniform: vec2i,
  },
  tempBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
  filterParamsBuffer: {
    storage: arrayOf(FilterParams),
    access: 'readonly',
  },
  postprocessBuffer: {
    storage: arrayOf(Bucket),
    access: 'mutable',
  },
})

export function createAdaptiveBlurPipeline(
  root: TgpuRoot,
  textureSize: readonly [number, number],
  accumulationBuffer: LayoutEntryToInput<
    (typeof hBlurBindGroupLayout)['entries']['accumulationBuffer']
  >,
  filterParamsBuffer: LayoutEntryToInput<
    (typeof hBlurBindGroupLayout)['entries']['filterParamsBuffer']
  >,
  postprocessBuffer: LayoutEntryToInput<
    (typeof vBlurBindGroupLayout)['entries']['postprocessBuffer']
  >,
) {
  const [width, height] = textureSize
  const pixelCount = width * height

  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')

  const tempBuffer = root
    .createBuffer(arrayOf(Bucket, pixelCount))
    .$usage('storage')

  // ── Horizontal pass ──
  const hBindGroup = root.createBindGroup(hBlurBindGroupLayout, {
    accumulationBuffer,
    filterParamsBuffer,
    tempBuffer,
    textureSize: textureSizeBuffer,
  })

  const hBlur = tgpu.computeFn({
    in: { globalInvocationId: builtin.globalInvocationId },
    workgroupSize: [GROUP_SIZE_X, GROUP_SIZE_Y, 1],
  })(({ globalInvocationId }) => {
    const uv = vec2i(globalInvocationId.xy)
    const textureSize = hBlurBindGroupLayout.$.textureSize
    if (uv.x >= textureSize.x || uv.y >= textureSize.y) {
      return
    }

    const accumulationBuffer = hBlurBindGroupLayout.$.accumulationBuffer
    const filterParamsBuffer = hBlurBindGroupLayout.$.filterParamsBuffer
    const tempBuffer = hBlurBindGroupLayout.$.tempBuffer

    const texelIndex = uv.y * textureSize.x + uv.x
    const sigma = filterParamsBuffer[texelIndex]!.sigma
    const radius = i32(ceil(sigma * f32(3)))
    const clampedRadius = clamp(radius, i32(1), i32(MAX_SIGMA * 3))

    let totalCount = f32(0)
    let totalColorA = f32(0)
    let totalColorB = f32(0)
    let totalWeight = f32(0)

    for (let dx = -clampedRadius; dx <= clampedRadius; dx += 1) {
      const sx = clamp(add(uv.x, dx), i32(0), sub(textureSize.x, i32(1)))
      const sampleIdx = uv.y * textureSize.x + sx
      const sample = accumulationBuffer[sampleIdx]!

      const dist = f32(dx)
      const weight = exp(sub(f32(0), (dist * dist) / (f32(2) * sigma * sigma)))

      totalCount += f32(sample.count) * weight
      totalColorA += f32(sample.color.a) * weight
      totalColorB += f32(sample.color.b) * weight
      totalWeight += weight
    }

    tempBuffer[texelIndex]!.count = u32(totalCount / totalWeight)
    tempBuffer[texelIndex]!.color.a = i32(totalColorA / totalWeight)
    tempBuffer[texelIndex]!.color.b = i32(totalColorB / totalWeight)
  })

  const hPipeline = root
    .createComputePipeline({ compute: hBlur })
    .with(hBindGroup)

  // ── Vertical pass ──
  const vBindGroup = root.createBindGroup(vBlurBindGroupLayout, {
    tempBuffer,
    filterParamsBuffer,
    postprocessBuffer,
    textureSize: textureSizeBuffer,
  })

  const vBlur = tgpu.computeFn({
    in: { globalInvocationId: builtin.globalInvocationId },
    workgroupSize: [GROUP_SIZE_X, GROUP_SIZE_Y, 1],
  })(({ globalInvocationId }) => {
    const uv = vec2i(globalInvocationId.xy)
    const textureSize = vBlurBindGroupLayout.$.textureSize
    if (uv.x >= textureSize.x || uv.y >= textureSize.y) {
      return
    }

    const tempBuffer = vBlurBindGroupLayout.$.tempBuffer
    const filterParamsBuffer = vBlurBindGroupLayout.$.filterParamsBuffer
    const postprocessBuffer = vBlurBindGroupLayout.$.postprocessBuffer

    const texelIndex = uv.y * textureSize.x + uv.x
    const sigma = filterParamsBuffer[texelIndex]!.sigma
    const radius = i32(ceil(sigma * f32(3)))
    const clampedRadius = clamp(radius, i32(1), i32(MAX_SIGMA * 3))

    let totalCount = f32(0)
    let totalColorA = f32(0)
    let totalColorB = f32(0)
    let totalWeight = f32(0)

    for (let dy = -clampedRadius; dy <= clampedRadius; dy += 1) {
      const sy = clamp(add(uv.y, dy), i32(0), sub(textureSize.y, i32(1)))
      const sampleIdx = sy * textureSize.x + uv.x
      const sample = tempBuffer[sampleIdx]!

      const dist = f32(dy)
      const weight = exp(sub(f32(0), (dist * dist) / (f32(2) * sigma * sigma)))

      totalCount += f32(sample.count) * weight
      totalColorA += f32(sample.color.a) * weight
      totalColorB += f32(sample.color.b) * weight
      totalWeight += weight
    }

    postprocessBuffer[texelIndex]!.count = u32(
      max(f32(0), totalCount / totalWeight),
    )
    postprocessBuffer[texelIndex]!.color.a = i32(totalColorA / totalWeight)
    postprocessBuffer[texelIndex]!.color.b = i32(totalColorB / totalWeight)
  })

  const vPipeline = root
    .createComputePipeline({ compute: vBlur })
    .with(vBindGroup)

  return {
    run: (pass: GPUComputePassEncoder) => {
      hPipeline
        .with(pass)
        .dispatchWorkgroups(
          ceilMath(width / GROUP_SIZE_X),
          ceilMath(height / GROUP_SIZE_Y),
          1,
        )
      vPipeline
        .with(pass)
        .dispatchWorkgroups(
          ceilMath(width / GROUP_SIZE_X),
          ceilMath(height / GROUP_SIZE_Y),
          1,
        )
    },
    destroy: () => {
      tempBuffer.destroy()
    },
  }
}
