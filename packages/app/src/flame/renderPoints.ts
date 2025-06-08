import { tgpu } from 'typegpu'
import { arrayOf, vec2u, vec4f } from 'typegpu/data'
import { random, setSeed } from '@/shaders/random'
import { wgsl } from '@/utils/wgsl'
import { Point } from './variations/types'
import type {
  LayoutEntryToInput,
  StorageFlag,
  TgpuBuffer,
  TgpuRoot,
} from 'typegpu'
import type { WgslArray } from 'typegpu/data'
import type { CameraContext } from '@/lib/CameraContext'

const { ceil } = Math

const GROUP_SIZE = 32

const bindGroupLayout = tgpu
  .bindGroupLayout({
    points: {
      storage: (length: number) => arrayOf(Point, length),
    },
    outputTextureDimension: {
      uniform: vec2u,
    },
    outputTextureBuffer: {
      storage: (length: number) => arrayOf(vec4f, length),
      access: 'mutable',
    },
  })
  .$name('RenderPointsPipeline.bindGroupLayout')

export function createRenderPointsPipeline(
  root: TgpuRoot,
  camera: CameraContext,
  points: TgpuBuffer<WgslArray<typeof Point>> & StorageFlag,
  outputTextureDimension: [number, number],
  outputTextureBuffer: LayoutEntryToInput<
    (typeof bindGroupLayout)['entries']['outputTextureBuffer']
  >,
) {
  const { device } = root

  const outputTextureDimensionBuffer = root
    .createBuffer(vec2u, vec2u(...outputTextureDimension))
    .$usage('uniform')

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    points,
    outputTextureDimension: outputTextureDimensionBuffer,
    outputTextureBuffer,
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

    @compute @workgroup_size(${GROUP_SIZE}, 1, 1) fn cs(
      @builtin(num_workgroups) numWorkgroups: vec3<u32>,
      @builtin(workgroup_id) workgroupId : vec3<u32>,
      @builtin(local_invocation_index) localInvocationIndex: u32
    ) {
      let workgroupIndex =
        workgroupId.x +
        workgroupId.y * numWorkgroups.x +
        workgroupId.z * numWorkgroups.x * numWorkgroups.y;

      let pointIndex = workgroupIndex * ${GROUP_SIZE} + localInvocationIndex;

      let point = points[pointIndex];
      setSeed(point.seed);

      let clip = worldToClip(point.position);
      // antialiasing jitter
      let pxScale = 1 / clipToPixels(vec2f(1, 1));
      let jittered = clip + pxScale * (2 * vec2f(random(), random()) - 1);

      let screen = vec2u(vec2f(outputTextureDimension) * (jittered * vec2f(1, -1) * 0.5 + 0.5));
      if (screen.x < 0 || screen.y < 0 || screen.x >= outputTextureDimension.x || screen.y >= outputTextureDimension.y) {
        return;
      }
      let pixelIndex = screen.y * outputTextureDimension.x + screen.x;
      outputTextureBuffer[pixelIndex] += vec4f(0, point.color, 1);
    }
  `

  const module = device.createShaderModule({
    code: renderPointsShaderCode,
  })

  const renderPointsPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({
      bindGroupLayouts: [
        root.unwrap(camera.BindGroupLayout),
        root.unwrap(bindGroupLayout),
      ],
    }),
    compute: {
      module,
    },
  })

  return (pass: GPUComputePassEncoder, pointCount: number) => {
    pass.setPipeline(renderPointsPipeline)
    pass.setBindGroup(0, root.unwrap(camera.bindGroup))
    pass.setBindGroup(1, root.unwrap(bindGroup))
    pass.dispatchWorkgroups(
      ceil(pointCount / (GROUP_SIZE * GROUP_SIZE)),
      GROUP_SIZE,
      1,
    )
  }
}
