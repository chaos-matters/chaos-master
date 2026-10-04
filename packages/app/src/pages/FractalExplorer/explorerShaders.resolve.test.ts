import { tgpu } from 'typegpu'
import { describe, expect, it } from 'vitest'
import { colourEntry, presentFragment, presentVertex, } from './explorerColourShaders'
import { initEntry, iterateEntry } from './explorerShaders'

// Resolving is the JS -> WGSL generation that otherwise first runs at the
// first dispatch on a real GPU; doing it here catches tracing and naming
// errors in CI without a device.
describe('explorer shaders', () => {
  it.each([
    ['init', initEntry],
    ['iterate', iterateEntry],
    ['colour', colourEntry],
  ])('resolves the %s pass', (_name, entry) => {
    const wgsl = tgpu.resolve([entry], { names: 'strict' })
    expect(wgsl).toContain('@compute')
  })

  it('resolves the present pass', () => {
    const wgsl = tgpu.resolve([presentVertex, presentFragment], {
      names: 'strict',
    })
    expect(wgsl).toContain('@fragment')
  })
})
