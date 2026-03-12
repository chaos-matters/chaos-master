import { tgpu } from 'typegpu'
import { arrayOf, builtin, f32, u32, vec2f, vec4f } from 'typegpu/data'
import { arrayLength, log2 } from 'typegpu/std'
import { alphaBlend } from '@/utils/blendModes'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'

const bindGroupLayout = tgpu
  .bindGroupLayout({
    histogram: {
      storage: arrayOf(u32),
      access: 'readonly',
    },
  })
  .$name('RenderHistogramPipeline.bindGroupLayout')

export function createRenderHistogramPipeline(
  root: TgpuRoot,
  histogram: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['histogram']
  >,
  canvasFormat: GPUTextureFormat,
) {
  const bindGroup = root.createBindGroup(bindGroupLayout, {
    histogram,
  })

  const VertexOutput = {
    position: builtin.position,
  }

  const vertex = tgpu.vertexFn({
    in: {
      vertexIndex: builtin.vertexIndex,
      instanceIndex: builtin.instanceIndex,
    },
    out: VertexOutput,
  })(({ vertexIndex, instanceIndex }) => {
    const rectangle = [vec2f(0, 0), vec2f(1, 0), vec2f(0, 1), vec2f(1, 1)]
    const vertex = rectangle[vertexIndex]!
    const binCount = arrayLength(bindGroupLayout.$.histogram)
    const binWidth = 1 / f32(binCount)
    const count = bindGroupLayout.$.histogram[instanceIndex]!
    const x = (f32(instanceIndex) + vertex.x) * binWidth
    const y = (vertex.y * log2(f32(count + 1))) / 50
    return { position: vec4f(x * 2 - 1, y * 2 - 1, 0, 1) }
  })

  const fragment = tgpu.fragmentFn({ in: VertexOutput, out: vec4f })(() =>
    vec4f(1),
  )
  const pipeline = root
    .createRenderPipeline({
      vertex,
      fragment,
      primitive: { topology: 'triangle-strip' },
      targets: { format: canvasFormat, blend: alphaBlend },
    })
    .with(bindGroup)

  return (pass: GPURenderPassEncoder, binCount: number) => {
    pipeline.with(pass).draw(4, binCount)
  }
}
