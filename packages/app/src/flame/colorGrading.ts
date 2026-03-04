import { oklabToRgb } from '@typegpu/color'
import { tgpu } from 'typegpu'
import {
  arrayOf,
  builtin,
  f32,
  struct,
  vec2f,
  vec2i,
  vec3f,
  vec4f,
} from 'typegpu/data'
import {
  abs,
  div,
  log,
  max,
  mix,
  mul,
  pow,
  saturate,
  smoothstep,
} from 'typegpu/std'
import { Bucket, BUCKET_FIXED_POINT_MULTIPLIER_INV } from './types'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import type { DrawModeFn } from './drawMode'

export const ColorGradingUniforms = struct({
  averagePointCountPerBucketInv: f32,
  exposure: f32,
  backgroundColor: vec4f,
  /** Adds a slight fade towards the edge of the viewport */
  edgeFadeColor: vec4f,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  textureSize: {
    uniform: vec2i,
  },
  accumulationBuffer: {
    storage: arrayOf(Bucket),
    access: 'readonly',
  },
})

export function createColorGradingPipeline(
  root: TgpuRoot,
  uniforms: LayoutEntryToInput<(typeof bindGroupLayout)['entries']['uniforms']>,
  textureSize: readonly [number, number],
  accumulationBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['accumulationBuffer']
  >,
  canvasFormat: GPUTextureFormat,
  drawMode: DrawModeFn,
) {
  const textureSizeBuffer = root
    .createBuffer(vec2i, vec2i(...textureSize))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    accumulationBuffer,
    textureSize: textureSizeBuffer,
  })

  const VertexOutput = {
    pos: builtin.position,
    uv: vec2f,
  }

  const vertex = tgpu.vertexFn({
    in: { vertexIndex: builtin.vertexIndex },
    out: VertexOutput,
  })(({ vertexIndex }) => {
    const pos = [vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3)]
    return {
      pos: vec4f(pos[vertexIndex]!, 0.0, 1.0),
      uv: pos[vertexIndex]!,
    }
  })

  const fragment = tgpu.fragmentFn({
    in: VertexOutput,
    out: vec4f,
  })(({ pos, uv }) => {
    const uniforms = bindGroupLayout.$.uniforms
    const textureSize = bindGroupLayout.$.textureSize
    const accumulationBuffer = bindGroupLayout.$.accumulationBuffer
    const edgeFade =
      uniforms.edgeFadeColor.a * smoothstep(0.98, 1, max(abs(uv.x), abs(uv.y)))
    const backgroundColor = mix(
      uniforms.backgroundColor,
      uniforms.edgeFadeColor,
      edgeFade,
    )
    const pos2i = vec2i(pos.xy)
    const texelIndex = pos2i.y * textureSize.x + pos2i.x
    const tex = accumulationBuffer[texelIndex]!
    const count = f32(tex.count) * BUCKET_FIXED_POINT_MULTIPLIER_INV
    const ab = div(
      mul(
        vec2f(f32(tex.color.a), f32(tex.color.b)),
        BUCKET_FIXED_POINT_MULTIPLIER_INV,
      ),
      count,
    )
    const adjustedCount = 0.1 * count * uniforms.averagePointCountPerBucketInv
    const value = uniforms.exposure * pow(log(adjustedCount + 1), 0.4545)
    const rgb = saturate(oklabToRgb(vec3f(drawMode(value), ab)))
    const alpha = saturate(value) * (1 - edgeFade)
    const rgba = vec4f(rgb, alpha)
    return mix(backgroundColor, rgba, alpha)
  })

  const renderPipeline = root.createRenderPipeline({
    vertex,
    fragment,
    targets: { format: canvasFormat },
  })

  return {
    run: (pass: GPURenderPassEncoder) => {
      pass.setPipeline(root.unwrap(renderPipeline))
      pass.setBindGroup(0, root.unwrap(bindGroup))
      pass.draw(3, 1)
    },
  }
}
