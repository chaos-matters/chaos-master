import { CameraContext } from '@/lib/CameraContext'
import { wgsl } from '@/utils/wgsl'
import tgpu, { StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu'
import { arrayOf, WgslArray } from 'typegpu/data'
import { Point, outputTextureFormat } from './variations/types'
import { random, setSeed } from '@/shaders/random'

const bindGroupLayout = tgpu
  .bindGroupLayout({
    points: {
      storage: (length: number) => arrayOf(Point, length),
    },
  })
  .$name('RenderPointsPipeline.bindGroupLayout')

export function createRenderPointsPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
) {
  const { device } = root

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
  })

  const renderPointsShaderCode = wgsl/* wgsl */ `
    ${{
      ...camera.BindGroupLayout.bound,
      ...bindGroupLayout.bound,
      worldToClip: camera.wgsl.worldToClip,
      clipToPixels: camera.wgsl.clipToPixels,
      random,
      setSeed,
    }}

    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) color: vec2f
    }

    @vertex fn vs(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
      let point = points[vertex_index];
      setSeed(point.seed);

      // antialiasing jitter
      let pxScale = 1 / clipToPixels(vec2f(1, 1));
      let proj = worldToClip(point.position);
      let jittered = proj + pxScale * (2 * vec2f(random(), random()) - 1);

      return VertexOutput(
        vec4f(jittered, 0, 1),
        point.color
      );
    }

    @fragment fn fs(in: VertexOutput) -> @location(0) vec4f {
      return vec4f(0, in.color, 1);
    }
  `

  const module = device.createShaderModule({
    code: renderPointsShaderCode,
  })

  const renderPointsPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(camera.BindGroupLayout),
        root.unwrap(bindGroupLayout),
      ],
    }),
    primitive: {
      topology: 'point-list',
    },
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [
        {
          format: outputTextureFormat,
          blend: {
            color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
            alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          },
        },
      ],
    },
  })

  return (pass: GPURenderPassEncoder, pointCount: number) => {
    pass.setPipeline(renderPointsPipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(bindGroup))
    pass.draw(pointCount)
  }
}
