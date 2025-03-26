import { wgsl } from '@/utils/wgsl'
import { TgpuRoot } from 'typegpu'
import { outputTextureFormat } from './variations/types'

export function createTemporalBlendPipeline(root: TgpuRoot) {
  const { device } = root

  const renderShaderCode = wgsl/* wgsl */ `
    const pos = array(
      vec2f(-1, -1),
      vec2f(3, -1),
      vec2f(-1, 3)
    );

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
    ) -> @builtin(position) vec4f {
      return vec4f(pos[vertexIndex], 0.0, 1.0);
    }

    @fragment fn fs() -> @location(0) vec4f {
      return vec4f(0, 0, 0, 0);
    }
  `

  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  })

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [],
    }),
    vertex: {
      module: renderModule,
    },
    fragment: {
      module: renderModule,
      targets: [
        {
          format: outputTextureFormat,
          blend: {
            color: {
              operation: 'add',
              srcFactor: 'constant',
              dstFactor: 'one-minus-constant',
            },
            alpha: {
              operation: 'add',
              srcFactor: 'constant',
              dstFactor: 'one-minus-constant',
            },
          },
        },
      ],
    },
  })
  return (pass: GPURenderPassEncoder, fade = 0.02) => {
    pass.setPipeline(renderPipeline)
    pass.setBlendConstant([fade, fade, fade, fade])
    pass.draw(3, 1)
  }
}
