import { tgpu } from 'typegpu'
import { arrayOf, u32 } from 'typegpu/data'
import { alphaBlend } from '@/utils/blendModes'
import { wgsl } from '@/utils/wgsl'
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
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    histogram,
  })

  const renderHistogramShaderCode = wgsl /* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
    }}

    struct VertexOutput {
      @builtin(position) position: vec4f
    }

    const rectangle = array(
      vec2f(0, 0),
      vec2f(1, 0),
      vec2f(0, 1),
      vec2f(1, 1)
    );

    @vertex fn vs(@builtin(vertex_index) vertex_index: u32, @builtin(instance_index) instance_index: u32) -> VertexOutput {
      let vertex = rectangle[vertex_index];
      let binCount = arrayLength(&histogram);
      let binWidth = 1 / f32(binCount);
      let count = histogram[instance_index];
      let x = (f32(instance_index) + vertex.x) * binWidth;
      let y = vertex.y * log2(f32(count)) / 20;

      return VertexOutput(
        vec4f(x * 2 - 1, y * 2 - 1, 0, 1)
      );
    }

    @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
      return vec4f(1, 1, 1, 1);
    }
  `

  const module = device.createShaderModule({
    code: renderHistogramShaderCode,
  })

  const renderHistogramPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    primitive: {
      topology: 'triangle-strip',
    },
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [
        {
          format: globalThis.navigator.gpu.getPreferredCanvasFormat(),
          blend: alphaBlend,
        },
      ],
    },
  })

  return (pass: GPURenderPassEncoder, binCount: number) => {
    pass.setPipeline(renderHistogramPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.draw(4, binCount)
  }
}
