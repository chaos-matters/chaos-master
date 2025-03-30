import { wgsl } from '@/utils/wgsl'
import { outputTextureFormat } from './variations/types'
import type { TgpuRoot } from 'typegpu'

export const FADE_CONSTANT = 0.999

export function createFadePipeline(root: TgpuRoot) {
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
      return vec4f(1);
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
              srcFactor: 'zero',
              dstFactor: 'constant',
            },
            alpha: {
              operation: 'add',
              srcFactor: 'zero',
              dstFactor: 'constant',
            },
          },
        },
      ],
    },
  })
  return (pass: GPURenderPassEncoder) => {
    pass.setPipeline(renderPipeline)
    pass.setBlendConstant([1, 1, 1, FADE_CONSTANT])
    pass.draw(3, 1)
    pass.end()
  }
}
