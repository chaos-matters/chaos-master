import { oklabToRgb } from '@typegpu/color'
import { tgpu } from 'typegpu'
import { f32, struct, vec4f } from 'typegpu/data'
import { wgsl } from '@/utils/wgsl'
import type { LayoutEntryToInput, TgpuRoot } from 'typegpu'
import type { DrawModeFn } from './drawMode'

export const ColorGradingUniforms = struct({
  countAdjustmentFactor: f32,
  exposure: f32,
  backgroundColor: vec4f,
  /** Adds a slight fade towards the edge of the viewport */
  edgeFadeColor: vec4f,
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
      let edgeFade = uniforms.edgeFadeColor.a * smoothstep(0.98, 1, max(abs(in.uv.x), abs(in.uv.y)));
      let backgroundColor = mix(uniforms.backgroundColor, uniforms.edgeFadeColor, edgeFade);
      let pos2u = vec2u(in.pos.xy);
      let tex = textureLoad(outputTexture, pos2u, 0);
      let count = tex.a;
      let adjustedCount = count * uniforms.countAdjustmentFactor;
      let value = uniforms.exposure * pow(log(adjustedCount + 1), 0.4545);
      let ab = tex.gb / count;
      let rgb = saturate(oklabToRgb(vec3f(drawMode(value), ab)));
      let alpha = saturate(value) * (1 - edgeFade);
      let rgba = vec4f(rgb, alpha);
      return mix(backgroundColor, rgba, alpha);
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
        },
      ],
    },
  })
  return {
    run: (encoder: GPUCommandEncoder, context: GPUCanvasContext) => {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            loadOp: 'clear',
            storeOp: 'store',
            view: context.getCurrentTexture().createView(),
          },
        ],
      })
      pass.setPipeline(renderPipeline)
      pass.setBindGroup(0, root.unwrap(bindGroup))
      pass.draw(3, 1)
      pass.end()
    },
  }
}
