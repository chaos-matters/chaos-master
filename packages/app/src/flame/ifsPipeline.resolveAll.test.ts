import { createRoot } from 'solid-js'
import { tgpu } from 'typegpu'
import { describe, expect, it } from 'vitest'
import { createIFSPipeline } from './ifsPipeline'
import { createIFSPipeline3D } from './ifsPipeline3D'
import { variationTypes } from './variations'
import { getDefaultFlameByVarType, getDefaultFlameByVarType3D, } from './variations/utils'
import { variationTypes3D } from './variations3D'

// Full WGSL *resolution* is the only pre-GPU check that exercises every
// variation's shader body (the unplugin build only does JS->JS transpile).
// ifsPipeline.resolve.test.ts resolves one curated example; this walks the
// entire variation registry so a change to any shared shader helper is proven
// to still resolve for all of them. It is also the safety net that must stay
// green before/after consolidating the per-variation epsilon guards.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockRoot(capture: (compute: any) => void) {
  const fakeBuffer = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $usage: () => fakeBuffer as any,
    write: () => {},
    destroy: () => {},
    buffer: {},
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createComputePipeline = ({ compute }: { compute: any }) => {
    capture(compute)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p: any = {
      with: () => p,
      $name: () => p,
      dispatchWorkgroups: () => {},
    }
    return p
  }
  return {
    fakeBuffer,
    root: {
      createBuffer: () => fakeBuffer,
      createBindGroup: () => ({}),
      createComputePipeline,
      with: () => ({ createComputePipeline }),
    },
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolve2D(transforms: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any

  const { root, fakeBuffer } = mockRoot((c) => (captured = c))
  createRoot((dispose) => {
    createIFSPipeline(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      root as any,
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
      'pointInitUnitDisk',
      undefined,
      16,
    )
    dispose()
  })
  return tgpu.resolve([captured], { names: 'strict' })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolve3D(transforms: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let captured: any

  const { root, fakeBuffer } = mockRoot((c) => (captured = c))
  createRoot((dispose) => {
    createIFSPipeline3D(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      root as any,
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

describe('every 2D variation resolves to WGSL', () => {
  it.each(variationTypes)('resolves %s', (type) => {
    const flame = getDefaultFlameByVarType(type)
    const code = resolve2D(flame.transforms)
    expect(code.length).toBeGreaterThan(0)
    expect(code).toContain('fn ')
  })
})

describe('every 3D variation resolves to WGSL', () => {
  it.each(variationTypes3D as readonly string[])('resolves %s', (type) => {
    const flame = getDefaultFlameByVarType3D(type as never)
    const code = resolve3D(flame.transforms)
    expect(code.length).toBeGreaterThan(0)
    expect(code).toContain('fn ')
  })
})
