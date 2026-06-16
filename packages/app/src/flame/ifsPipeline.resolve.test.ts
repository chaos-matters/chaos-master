import { createRoot } from 'solid-js'
import { tgpu } from 'typegpu'
import { describe, expect, it } from 'vitest'
import { examples } from './examples'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'

// Full WGSL *resolution* (the JS-DSL -> WGSL generation that runs at the first
// dispatch on a real GPU) is what catches errors like assigning a storage
// reference to a local. The unplugin-typegpu build only does the JS->JS
// transpile, so it misses them. `tgpu.resolve` performs that generation with no
// GPU device, so we can guard the class of error in CI.
//
// createIFSPipeline only touches the root for buffer/bindgroup/pipeline creation
// at setup; the compute shader references the bind-group *layout*, not the
// buffers — so a tiny mock root is enough to build the shader, and we capture
// the compute fn via createComputePipeline and resolve it.

function resolveIFSCompute(opts: {
  transforms: (typeof examples)[keyof typeof examples]['transforms']
  blendTransforms?: (typeof examples)[keyof typeof examples]['transforms']
}): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any
  const fakeBuffer = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $usage: () => fakeBuffer as any,
    write: () => {},
    destroy: () => {},
    buffer: {},
  }
  const mockRoot = {
    createBuffer: () => fakeBuffer,
    createBindGroup: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createComputePipeline: ({ compute }: { compute: any }) => {
      captured = compute
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = {
        with: () => p,
        $name: () => p,
        dispatchWorkgroups: () => {},
      }
      return p
    },
  }
  const mockCamera = { bindGroup: {} }

  createRoot((dispose) => {
    createIFSPipeline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRoot as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockCamera as any,
      20,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      opts.transforms,
      [256, 256],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      'colorInitZero',
      'pointInitUnitDisk',
      opts.blendTransforms,
      16,
    )
    dispose()
  })

  // Throws (and fails the test) if the shader body has a resolution error.
  return tgpu.resolve([captured], { names: 'strict' })
}

function resolveIFSCompute3D(
  transforms: (typeof examples)[keyof typeof examples]['transforms'],
): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any
  const fakeBuffer = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $usage: () => fakeBuffer as any,
    write: () => {},
    destroy: () => {},
    buffer: {},
  }
  const mockRoot = {
    createBuffer: () => fakeBuffer,
    createBindGroup: () => ({}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createComputePipeline: ({ compute }: { compute: any }) => {
      captured = compute
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = {
        with: () => p,
        $name: () => p,
        dispatchWorkgroups: () => {},
      }
      return p
    },
  }
  createRoot((dispose) => {
    createIFSPipeline3D(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockRoot as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { bindGroup: {} } as any,
      20,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      transforms,
      [256, 256],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fakeBuffer as any,
      'colorInitZero',
      'pointInitUnitSphere',
      16,
    )
    dispose()
  })
  return tgpu.resolve([captured], { names: 'strict' })
}

describe('IFS pipeline WGSL resolution', () => {
  it('resolves the non-blend 2D compute shader', () => {
    const code = resolveIFSCompute({ transforms: examples.example2.transforms })
    expect(code).toContain('fn ')
  })

  it('resolves the blend 2D compute shader', () => {
    const code = resolveIFSCompute({
      transforms: examples.example2.transforms,
      blendTransforms: examples.example1.transforms,
    })
    expect(code).toContain('fn ')
  })

  it('resolves the 3D compute shader', () => {
    const code = resolveIFSCompute3D(examples.example40.transforms)
    expect(code).toContain('fn ')
  })
})
