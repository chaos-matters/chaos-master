import { oklabToRgb } from '@typegpu/color'
import { tgpu } from 'typegpu'
import { f32, struct } from 'typegpu/data'
import { alphaBlend } from '@/utils/blendModes'
import { wgsl } from '@/utils/wgsl'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import type { v3f } from 'typegpu/data'
import type { DrawModeFn } from './drawMode'

export const ColorGradingUniforms = struct({
  countAdjustmentFactor: f32,
  exposure: f32,
  /** Adds a slight fade towards the edge of the viewport */
  edgeFade: f32,
})

const bindGroupLayout = tgpu.bindGroupLayout({
  uniforms: {
    uniform: ColorGradingUniforms,
  },
  outputTexture: {
    texture: 'unfilterable-float',
    visibility: ['fragment'],
  },
})

export function createColorGradingPipeline(
  root: TgpuRoot,
  uniforms: LayoutEntryToInput<(typeof bindGroupLayout)['entries']['uniforms']>,
  outputTexture: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['outputTexture']
  >,
  canvasFormat: GPUTextureFormat,
  drawMode: DrawModeFn,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    uniforms,
    outputTexture,
  })

  const renderShaderCode = wgsl/* wgsl */ `
    ${{
      ...bindGroupLayout.bound,
      oklabToRgb,
      drawMode,
    }}

    const pos = array(
      vec2f(-1, -1),
      vec2f(3, -1),
      vec2f(-1, 3)
    );

    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) uv: vec2f
    }

    @vertex fn vs(
      @builtin(vertex_index) vertexIndex : u32
    ) -> VertexOutput {
      return VertexOutput(
        vec4f(pos[vertexIndex], 0.0, 1.0), 
        pos[vertexIndex]
      );
    }

    @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
      let pos2u = vec2u(in.pos.xy);
      let tex = textureLoad(outputTexture, pos2u, 0);
      let count = tex.a;
      let adjustedCount = count * uniforms.countAdjustmentFactor;
      let value = uniforms.exposure * pow(log(adjustedCount + 1), 0.4545);
      let ab = tex.gb / count;
      let rgb = oklabToRgb(vec3f(drawMode(value), ab));
      let edgeFade = smoothstep(1, 0.98, max(abs(in.uv.x), abs(in.uv.y)));
      return vec4f(rgb, value * mix(1.0, edgeFade, uniforms.edgeFade));
    }
  `

  const renderModule = device.createShaderModule({
    code: renderShaderCode,
  })

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(bindGroupLayout)],
    }),
    vertex: {
      module: renderModule,
    },
    fragment: {
      module: renderModule,
      targets: [
        {
          format: canvasFormat,
          blend: alphaBlend,
        },
      ],
    },
  })
  return (
    encoder: GPUCommandEncoder,
    context: GPUCanvasContext,
    backgroundColor: v3f,
  ) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [
            backgroundColor.x,
            backgroundColor.y,
            backgroundColor.z,
            1,
          ],
          view: context.getCurrentTexture().createView(),
        },
      ],
    })
    pass.setPipeline(renderPipeline)
    pass.setBindGroup(0, root.unwrap(bindGroup))
    pass.draw(3, 1)
    pass.end()
  }
}
