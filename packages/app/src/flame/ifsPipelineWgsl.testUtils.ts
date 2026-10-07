/**
 * Resolve an IFS pipeline's compute shader to WGSL without a GPU, for tests.
 *
 * `createIFSPipeline` and `createIFSPipeline3D` touch the root only to create
 * buffers, bind groups and the compute pipeline; the shader references the
 * bind-group layouts, not the buffers. So a root that records the compute
 * function instead of compiling it is enough, and `tgpu.resolve` then runs
 * the same JS-to-WGSL generation a real device would, with strict names so
 * the text is stable.
 */
import { createRoot } from 'solid-js'
import { tgpu } from 'typegpu'
import { legacyRandomOutputSlot, RENDERER_RANDOM_IMPLEMENTATION_IDS, } from '@/shaders/random'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import type { FlameDescriptor, TransformRecord } from './schema/flameSchema'
import type { RendererRandomImplementationId } from '@/shaders/random'

type Captured = Parameters<typeof tgpu.resolve>[0][number]

/**
 * A root that records the compute function instead of compiling it, and every
 * value written to a buffer it created. The pipelines touch the root only to
 * create buffers, bind groups and the pipeline; the shader itself references
 * the bind-group layouts, so resolving the captured function needs no device.
 */
function mockRoot(capture: (compute: Captured) => void, writes: unknown[]) {
  const makeBuffer = () => {
    const buffer = {
      $usage: () => buffer,
      write: (value: unknown) => {
        writes.push(value)
      },
      destroy: () => {},
      buffer: {},
    }
    return buffer
  }
  const createComputePipeline = ({ compute }: { compute: Captured }) => {
    capture(compute)
    const pipeline = {
      with: () => pipeline,
      $name: () => pipeline,
      dispatchWorkgroups: () => {},
    }
    return pipeline
  }
  return {
    buffer: makeBuffer(),
    root: {
      createBuffer: makeBuffer,
      createBindGroup: () => ({}),
      createComputePipeline,
      with: () => ({ createComputePipeline }),
    },
  }
}

export type IfsShaderShape = {
  transforms: TransformRecord
  dims: 2 | 3
  blendTransforms?: TransformRecord
  random?: RendererRandomImplementationId
}

/**
 * Build a pipeline on the mock root. `wgsl()` resolves its compute shader;
 * `update` is the pipeline's own, and `writes` collects what it writes.
 */
export function buildIfsPipeline(shape: IfsShaderShape) {
  let captured: Captured | undefined
  const writes: unknown[] = []
  const { root, buffer } = mockRoot((compute) => (captured = compute), writes)
  // The pipelines take a TgpuRoot and typed buffers; the mock stands in for
  // the few members they call.
  const anyRoot = root as unknown as Parameters<typeof createIFSPipeline>[0]
  const anyBuffer = buffer as unknown as Parameters<typeof createIFSPipeline>[3]
  const positions = buffer as unknown as Parameters<typeof createIFSPipeline>[4]
  const colors = buffer as unknown as Parameters<typeof createIFSPipeline>[5]
  const accumulation = buffer as unknown as Parameters<
    typeof createIFSPipeline
  >[8]
  const camera = { bindGroup: {} } as unknown as Parameters<
    typeof createIFSPipeline
  >[1]
  const camera3D = { bindGroup: {} } as unknown as Parameters<
    typeof createIFSPipeline3D
  >[1]
  let update: (flame: FlameDescriptor) => void = () => {}
  createRoot((dispose) => {
    if (shape.dims === 3) {
      update = createIFSPipeline3D(
        anyRoot,
        camera3D,
        20,
        anyBuffer,
        positions,
        colors,
        shape.transforms,
        [256, 256],
        accumulation,
        'colorInitZero',
        'pointInitUnitSphere',
        16,
        shape.random,
      ).update
    } else {
      update = createIFSPipeline(
        anyRoot,
        camera,
        20,
        anyBuffer,
        positions,
        colors,
        shape.transforms,
        [256, 256],
        accumulation,
        'colorInitZero',
        'pointInitUnitDisk',
        shape.blendTransforms,
        16,
        shape.random,
      ).update
    }
    dispose()
  })
  const compute = captured
  if (!compute) throw new Error('the pipeline compiled nothing')
  return {
    update,
    writes,
    wgsl: () =>
      tgpu.resolve([compute], {
        names: 'strict',
        config: (config) =>
          config.with(
            legacyRandomOutputSlot,
            shape.random === RENDERER_RANDOM_IMPLEMENTATION_IDS.legacy,
          ),
      }),
  }
}

export function resolveIfsWgsl(shape: IfsShaderShape): string {
  return buildIfsPipeline(shape).wgsl()
}
